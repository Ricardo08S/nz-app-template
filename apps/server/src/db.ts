import { ZenStackClient } from "@zenstackhq/orm";
import { schema } from "./zenstack/schema";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";
import { env } from "./env";
import { PolicyPlugin } from "@zenstackhq/plugin-policy";

export const db = new ZenStackClient(schema, {
  log: !env.VERBOSE ? ["query", "error"] : [],
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: env.DATABASE_URL,
    }),
  }),
});

export const authDb = db.$use(new PolicyPlugin());
