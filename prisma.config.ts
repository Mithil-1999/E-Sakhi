import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved connection config out of schema.prisma and into this file.
// See docs/architecture.md §8 (Environment Variables) for DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
