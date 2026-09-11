import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires an explicit driver adapter rather than reading the
// connection string off the schema file. See prisma.config.ts and
// docs/architecture.md §8.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Standard Next.js Prisma singleton: avoids exhausting database connections
// from a new PrismaClient being created on every hot-reload in dev.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
