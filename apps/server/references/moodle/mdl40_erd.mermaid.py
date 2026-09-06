#!/usr/bin/env python3
"""Parse mdl40_erd.mdl40_erd.xml (SchemaSpy-style DB dump of Moodle 4.0) into
a Mermaid erDiagram, one entity per table.

Usage:
  python3 mdl40_erd.mermaid.py                    # all 469 tables
  python3 mdl40_erd.mermaid.py --quiz-only         # quiz/question/qtype tables only
  python3 mdl40_erd.mermaid.py --filter quiz,forum # tables named/prefixed "quiz" or "forum"
  python3 mdl40_erd.mermaid.py --filter quiz -o out.mmd

Reads:  mdl40_erd.mdl40_erd.xml (same directory)
Writes: mdl40_erd.erd.mmd by default, or mdl40_erd.<name>.erd.mmd
        when --filter/--quiz-only is used (unless --output is given).

Relations that cross the filter boundary (e.g. quiz.course -> course, which is
excluded under --quiz-only) are dropped, since the target entity isn't emitted.
"""
import argparse
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).parent
XML_PATH = HERE / "mdl40_erd.mdl40_erd.xml"

QUIZ_PREFIXES = ["quiz", "quizaccess", "question", "qtype"]

TYPE_MAP = {
    "BIGINT": "bigint",
    "INT": "int",
    "MEDIUMINT": "int",
    "SMALLINT": "int",
    "TINYINT": "int",
    "DECIMAL": "decimal",
    "DOUBLE": "double",
    "FLOAT": "float",
    "VARCHAR": "varchar",
    "LONGTEXT": "text",
    "BIT": "bit",
}


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
    p.add_argument("-o", "--output", type=Path, help="output .mmd path (default derived from filter)")
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
        out_path = HERE / "mdl40_erd.quiz.erd.mmd"
    elif prefixes:
        out_path = HERE / f"mdl40_erd.{'-'.join(prefixes)}.erd.mmd"
    else:
        out_path = HERE / "mdl40_erd.erd.mmd"

    root = ET.parse(XML_PATH).getroot()
    tables = [t for t in root.find("tables").findall("table") if included(t.get("name"))]

    # -- edges: (child_table, column, parent_table, parent_column, nullable) --
    edges = []
    for t in tables:
        table = t.get("name")
        for c in t.findall("column"):
            parent = c.find("parent")
            if parent is not None and included(parent.get("table")):
                edges.append((table, c.get("name"), parent.get("table"), c.get("nullable") == "true"))

    out = []
    out.append("erDiagram")

    for t in sorted(tables, key=lambda t: t.get("name")):
        table = t.get("name")
        out.append(f"  {table} {{")
        for c in t.findall("column"):
            ztype = TYPE_MAP[c.get("type")]
            cname = c.get("name")
            keys = []
            if cname == "id":
                keys.append("PK")
            if c.find("parent") is not None:
                keys.append("FK")
            key_str = f" {','.join(keys)}" if keys else ""
            out.append(f"    {ztype} {cname}{key_str}")
        out.append("  }")

    for child, col, parent, nullable in edges:
        # crow's foot: many children reference one parent; nullable FK -> optional
        left = "|o" if nullable else "||"
        out.append(f'  {parent} {left}--o{{ {child} : "{col}"')

    out_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {len(tables)} entities to {out_path}")


if __name__ == "__main__":
    main()
