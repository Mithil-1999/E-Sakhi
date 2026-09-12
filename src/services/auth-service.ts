import "server-only";
import bcrypt from "bcryptjs";
import * as z from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { RegisterSchema, type RegisterInput } from "@/lib/validation/auth";

const BCRYPT_SALT_ROUNDS = 12;

export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Registers a new USER account. This is the ONLY path that creates a
 * user from public input, and it never accepts a role from the caller —
 * role is always USER here. Promoting to ADMIN happens exclusively via
 * scripts/create-admin.ts (see docs/architecture.md §3).
 */
export async function registerUser(input: unknown): Promise<RegisterResult> {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodError(parsed.error),
    };
  }

  return createUser(parsed.data);
}

async function createUser(data: RegisterInput): Promise<RegisterResult> {
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: "USER",
      },
      select: { id: true },
    });
    return { ok: true, userId: user.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "An account with this email already exists." };
    }
    throw error;
  }
}

function flattenZodError(error: z.ZodError): Record<string, string[]> {
  const flat: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (flat[key] ??= []).push(issue.message);
  }
  return flat;
}

/** Verifies a plaintext password against a stored bcrypt hash. */
export async function verifyPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
