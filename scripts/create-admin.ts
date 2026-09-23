/**
 * Creates (or promotes) the first ADMIN or SUPER_ADMIN account from
 * ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD (+ optional ADMIN_SEED_ROLE) in
 * .env. This is the ONLY sanctioned way to get a SUPER_ADMIN account —
 * the admin UI's own "Add User" form can only hand out ADMIN/Member (see
 * CreateUserSchema, src/lib/validation/user.ts) — same out-of-band
 * pattern the very first ADMIN account already used before the RBAC
 * upgrade. The public /register form always creates a plain Member and
 * has no way to request anything else. See docs/architecture.md §3.
 *
 * Safe to re-run: if the email already exists, it only promotes the role
 * (to ADMIN_SEED_ROLE, default ADMIN) and leaves the existing password
 * untouched (never overwrites a real user's password from this script).
 * If it doesn't exist, it creates a new account with the given password.
 *
 * Run with: npm run db:create-admin
 * For a Super Admin instead: set ADMIN_SEED_ROLE=SUPER_ADMIN in .env first.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const VALID_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;
type SeedRole = (typeof VALID_ROLES)[number];

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  const roleInput = (process.env.ADMIN_SEED_ROLE?.trim().toUpperCase() || "ADMIN") as SeedRole;

  if (!email || !password) {
    console.error(
      "ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must both be set in .env before running this script."
    );
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error("ADMIN_SEED_PASSWORD must be at least 8 characters long.");
    process.exitCode = 1;
    return;
  }
  if (!VALID_ROLES.includes(roleInput)) {
    console.error(`ADMIN_SEED_ROLE must be one of ${VALID_ROLES.join(", ")} (got "${roleInput}").`);
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === roleInput) {
      console.log(`${email} is already ${roleInput}. Nothing to do.`);
      return;
    }
    await prisma.user.update({
      where: { email },
      data: { role: roleInput, status: "ACTIVE" },
    });
    console.log(`Promoted existing user ${email} to ${roleInput}. Password left unchanged.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      name: roleInput === "SUPER_ADMIN" ? "Super Admin" : "Admin",
      email,
      passwordHash,
      role: roleInput,
    },
  });
  console.log(`Created new ${roleInput} account: ${email}`);
}

main()
  .catch((err) => {
    console.error("create-admin failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
