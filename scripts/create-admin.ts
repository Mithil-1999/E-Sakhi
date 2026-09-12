/**
 * Creates (or promotes) the first ADMIN account from ADMIN_SEED_EMAIL /
 * ADMIN_SEED_PASSWORD in .env. This is the ONLY sanctioned way to get an
 * ADMIN account outside of an existing admin promoting someone through a
 * future admin UI (Part 12) — the public /register form always creates a
 * USER and has no way to request ADMIN. See docs/architecture.md §3.
 *
 * Safe to re-run: if the email already exists, it only promotes the role
 * to ADMIN and leaves the existing password untouched (never overwrites a
 * real user's password from this script). If it doesn't exist, it creates
 * a new ADMIN account with the given password.
 *
 * Run with: npm run db:create-admin
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;

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

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === "ADMIN") {
      console.log(`${email} is already an ADMIN. Nothing to do.`);
      return;
    }
    await prisma.user.update({
      where: { email },
      data: { role: "ADMIN" },
    });
    console.log(`Promoted existing user ${email} to ADMIN. Password left unchanged.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      name: "Admin",
      email,
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`Created new ADMIN account: ${email}`);
}

main()
  .catch((err) => {
    console.error("create-admin failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
