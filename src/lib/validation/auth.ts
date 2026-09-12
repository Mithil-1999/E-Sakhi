import * as z from "zod";

/**
 * Shared server-side validation for registration and login. Used by the
 * Server Actions in src/app/register and src/app/login — never trust a
 * form's client-side validation alone (see docs/architecture.md §10).
 */

const passwordSchema = z
  .string()
  .min(8, { error: "Password must be at least 8 characters long." })
  .regex(/[a-zA-Z]/, { error: "Password must contain at least one letter." })
  .regex(/[0-9]/, { error: "Password must contain at least one number." });

export const RegisterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(100, { error: "Name must be at most 100 characters long." }),
  // Registration NEVER accepts a role field from the client — role is
  // always forced to USER server-side (see src/services/auth-service.ts).
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Please enter a valid email address." })),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Please enter a valid email address." })),
  password: z.string().min(1, { error: "Password is required." }),
});

export type LoginInput = z.infer<typeof LoginSchema>;
