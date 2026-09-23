import * as z from "zod";
import { PaginationQuerySchema } from "@/lib/validation/pagination";

/**
 * User management validation — Super Admin only (see
 * src/lib/auth/api.ts's requireSuperAdminForApi()). Mirrors
 * src/lib/validation/auth.ts's password rules exactly, so "strong enough
 * to register" and "strong enough for a Super Admin to set" never drift
 * apart.
 */

const passwordSchema = z
  .string()
  .min(8, { error: "Password must be at least 8 characters long." })
  .regex(/[a-zA-Z]/, { error: "Password must contain at least one letter." })
  .regex(/[0-9]/, { error: "Password must contain at least one number." });

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Please enter a valid email address." }));

const nameSchema = z
  .string()
  .trim()
  .min(2, { error: "Name must be at least 2 characters long." })
  .max(100, { error: "Name must be at most 100 characters long." });

// Nepal-shaped but lenient — this dataset's own contact numbers (see
// docs/data-model.md) are a mix of formats; a phone number is optional
// free text here too, not strictly validated against one format.
const phoneSchema = z.string().trim().max(20).nullable().optional();

// A Super Admin can only ever hand out ADMIN or USER ("Member") — never
// SUPER_ADMIN itself. Creating another Super Admin is deliberately not a
// feature of this UI (see docs/architecture.md's RBAC section) — the only
// sanctioned way is promoting via scripts/create-admin.ts, same
// out-of-band pattern the very first Admin account already used.
const assignableRoleSchema = z.enum(["ADMIN", "USER"]);

export const UserListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "USER"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;

export const CreateUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  role: assignableRoleSchema,
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const ChangeUserRoleSchema = z.object({
  role: assignableRoleSchema,
});
export type ChangeUserRoleInput = z.infer<typeof ChangeUserRoleSchema>;

export const ChangeUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
export type ChangeUserStatusInput = z.infer<typeof ChangeUserStatusSchema>;

/** A Super Admin setting a new password for someone else — no "current password" needed, since it isn't theirs. */
export const AdminResetPasswordSchema = z.object({
  newPassword: passwordSchema,
});
export type AdminResetPasswordInput = z.infer<typeof AdminResetPasswordSchema>;

// ---------------------------------------------------------------------------
// Self-service profile — every authenticated role, not just admins.
// ---------------------------------------------------------------------------

export const UpdateProfileSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ChangeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Current password is required." }),
    newPassword: passwordSchema,
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    error: "New password and confirmation don't match.",
    path: ["confirmNewPassword"],
  });
export type ChangeOwnPasswordInput = z.infer<typeof ChangeOwnPasswordSchema>;
