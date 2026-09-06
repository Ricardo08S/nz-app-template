#!/usr/bin/env python3
"""Parse mdl40_erd.mdl40_erd.xml (SchemaSpy-style DB dump of Moodle 4.0) into
a standalone ZenStack .zmodel reference file, one model per table.

Usage:
  python3 mdl40_erd.parse.py                    # all 469 tables
  python3 mdl40_erd.parse.py --quiz-only         # quiz/question/qtype tables only
  python3 mdl40_erd.parse.py --filter quiz,forum # tables named/prefixed "quiz" or "forum"
  python3 mdl40_erd.parse.py --filter quiz -o out.zmodel

Reads:  mdl40_erd.mdl40_erd.xml (same directory)
Writes: mdl40_erd.reference.zmodel by default, or mdl40_erd.<name>.reference.zmodel
        when --filter/--quiz-only is used (unless --output is given).

Relations that cross the filter boundary (e.g. quiz.course -> course, which is
excluded under --quiz-only) keep their scalar FK column (courseid: BigInt) but
drop the ZenStack relation field, since the target model isn't emitted.
"""
import argparse
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).parent
XML_PATH = HERE / "mdl40_erd.mdl40_erd.xml"

QUIZ_PREFIXES = ["quiz", "quizaccess", "question", "qtype"]

TYPE_MAP = {
    "BIGINT": "BigInt",
    "INT": "Int",
    "MEDIUMINT": "Int",
    "SMALLINT": "Int",
    "TINYINT": "Int",
    "DECIMAL": "Decimal",
    "DOUBLE": "Float",
    "FLOAT": "Float",
    "VARCHAR": "String",
    "LONGTEXT": "String",
    "BIT": "Boolean",
}


def pascal(name: str) -> str:
    return "".join(w.capitalize() for w in name.split("_"))


def strip_id_suffix(col: str) -> str:
    if col != "id" and col.endswith("id") and len(col) > 2:
        return col[:-2]
    return col


def clean_remark(remark: str | None) -> str:
    if not remark:
        return ""
    return " ".join(remark.split())


def default_expr(zt: str, raw: str | None) -> str | None:
    if raw is None or raw == "null":
        return None
    if zt == "Boolean":
        return {"0": "false", "1": "true"}.get(raw)
    if zt in ("Int", "BigInt"):
        try:
            return str(int(raw))
        except ValueError:
            return None
    if zt in ("Float", "Decimal"):
        try:
            return str(float(raw))
        except ValueError:
            return None
    if zt == "String":
        if raw == "":
            return '""'
        esc = raw.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{esc}"'
    return None


def unique_name(base: str, used: set[str]) -> str:
    name = base
    i = 2
    while name in used:
        name = f"{base}{i}"
        i += 1
    used.add(name)
    return name


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "--filter",
        metavar="PREFIXES",
        help="comma-separated table name prefixes to keep (e.g. 'quiz,forum'); "
        "a table is kept if its name equals a prefix or starts with '<prefix>_'",
    )
    p.add_argument(
        "--quiz-only",
        action="store_true",
        help=f"shortcut for --filter {','.join(QUIZ_PREFIXES)}",
    )
    p.add_argument("-o", "--output", type=Path, help="output .zmodel path (default derived from filter)")
    return p.parse_args()


def make_table_filter(prefixes: list[str] | None):
    if not prefixes:
        return lambda table: True
    return lambda table: any(table == p or table.startswith(p + "_") for p in prefixes)


def main() -> None:
    args = parse_args()
    prefixes = args.quiz_only and QUIZ_PREFIXES or (args.filter.split(",") if args.filter else None)
    included = make_table_filter(prefixes)

    if args.output:
        out_path = args.output
    elif args.quiz_only:
        out_path = HERE / "mdl40_erd.quiz.reference.zmodel"
    elif prefixes:
        out_path = HERE / f"mdl40_erd.{'-'.join(prefixes)}.reference.zmodel"
    else:
        out_path = HERE / "mdl40_erd.reference.zmodel"

    root = ET.parse(XML_PATH).getroot()
    tables = root.find("tables").findall("table")

    # -- pass 1: basic per-table field data + relation edges --------------
    class Model:
        def __init__(self, table_el):
            self.table = table_el.get("name")
            self.name = pascal(self.table)
            self.remark = clean_remark(table_el.get("remarks"))
            self.columns = table_el.findall("column")
            self.used_names = {c.get("name") for c in self.columns}
            self.scalar_lines: list[str] = []
            self.relation_lines: list[str] = []
            self.back_relation_lines: list[str] = []

    models = {m.table: m for m in (Model(t) for t in tables)}

    # edges: (child_table, column, parent_table, parent_column, nullable)
    edges = []
    unique_targets: set[tuple[str, str]] = set()
    for m in models.values():
        for c in m.columns:
            parent = c.find("parent")
            if parent is not None:
                pcol = parent.get("column")
                edges.append((m.table, c.get("name"), parent.get("table"), pcol, c.get("nullable") == "true"))
                if pcol != "id":
                    unique_targets.add((parent.get("table"), pcol))

    # group edges by the *unordered* pair of models they connect (regardless of
    # which side is "child"/"parent") to detect ambiguous relations — Prisma/
    # ZenStack require an explicit relation name whenever two models are
    # connected by more than one relation, or a model references itself.
    from collections import defaultdict

    grouped = defaultdict(list)
    for child, col, parent, pcol, nullable in edges:
        grouped[frozenset((child, parent))].append((child, col))

    def needs_name(child: str, parent: str) -> bool:
        return child == parent or len(grouped[frozenset((child, parent))]) > 1

    # -- pass 2: scalar fields ---------------------------------------------
    for m in models.values():
        for c in m.columns:
            cname = c.get("name")
            remark = clean_remark(c.get("remarks"))
            comment = f" // {remark}" if remark else ""
            if cname == "id":
                m.scalar_lines.append("  id BigInt @id @default(autoincrement())" + comment)
                continue
            ztype = TYPE_MAP[c.get("type")]
            nullable = c.get("nullable") == "true"
            dflt = default_expr(ztype, c.get("defaultValue"))
            suffix = "?" if nullable else ""
            attrs = f" @default({dflt})" if dflt is not None else ""
            if (m.table, cname) in unique_targets:
                attrs += " @unique"
            m.scalar_lines.append(f"  {cname} {ztype}{suffix}{attrs}{comment}")

    # -- pass 3: relations ---------------------------------------------------
    for child, col, parent, pcol, nullable in edges:
        cm = models[child]
        pm = models[parent]
        ambiguous = needs_name(child, parent)
        opt = "?" if nullable else ""

        base_child_field = pascal(strip_id_suffix(col)) or pm.name
        child_field = unique_name(base_child_field, cm.used_names)

        base_parent_field = pascal(child) if not ambiguous else f"{pascal(child)}By{pascal(strip_id_suffix(col))}"
        parent_field = unique_name(base_parent_field, pm.used_names)

        rel_name = f'"{child}_{col}"' if ambiguous else None
        rel_attr = (
            f"@relation(name: {rel_name}, fields: [{col}], references: [{pcol}])"
            if rel_name
            else f"@relation(fields: [{col}], references: [{pcol}])"
        )

        if included(child) and included(parent):
            cm.relation_lines.append(f"  {child_field} {pm.name}{opt} {rel_attr}")
            opp_attr = f"@relation(name: {rel_name})" if rel_name else ""
            pm.back_relation_lines.append(f"  {parent_field} {cm.name}[]{(' ' + opp_attr) if opp_attr else ''}")

    # -- emit -----------------------------------------------------------------
    out = []
    out.append("// Auto-generated from mdl40_erd.mdl40_erd.xml by mdl40_erd.parse.py — do not edit by hand.")
    out.append("// Faithful mirror of the Moodle 4.0 MySQL schema: one model per table, original")
    out.append("// table/column names preserved. No access policies (documentation reference only).")
    if prefixes:
        out.append(f"// Filtered to tables matching prefixes: {', '.join(prefixes)}")
    out.append("")

    kept = [m for m in models.values() if included(m.table)]
    for m in sorted(kept, key=lambda m: m.name):
        if m.remark:
            out.append(f"// {m.remark}")
        out.append(f"model {m.name} {{")
        out.extend(m.scalar_lines)
        if m.relation_lines:
            out.append("")
            out.extend(m.relation_lines)
        if m.back_relation_lines:
            out.append("")
            out.extend(m.back_relation_lines)
        out.append("")
        out.append(f'  @@map("{m.table}")')
        out.append("}")
        out.append("")

    out_path.write_text("\n".join(out), encoding="utf-8")
    print(f"wrote {len(kept)} models to {out_path}")


if __name__ == "__main__":
    main()
