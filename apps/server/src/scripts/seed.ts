// Change to script's directory
process.chdir(__dirname);

import { db } from "../db";
import { hashPassword } from "../common";
import { env } from "../env";
import { Role } from "../zenstack/models";

if (env.APP_ENV === "production") {
  throw new Error("Refusing to run seed script in production (APP_ENV=production).");
}

const SEED_PASSWORD = "password123";

async function createUser(data: { username: string; name: string; email: string; role: Role }) {
  return db.user.create({
    data: {
      username: data.username,
      name: data.name,
      email: data.email,
      role: data.role,
      passwordHash: hashPassword(SEED_PASSWORD),
    },
  });
}

async function main() {
  console.log("Seeding minimal dev data...");

  await createUser({
    username: "admin",
    name: "Admin",
    email: "admin@example.com",
    role: Role.ADMIN,
  });
  await createUser({
    username: "user",
    name: "Test User",
    email: "user@example.com",
    role: Role.USER,
  });

  console.log(`Done. Both accounts use password "${SEED_PASSWORD}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
