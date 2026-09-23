import "server-only";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildPaginationMeta } from "@/lib/validation/pagination";
import type {
  UserListQuery,
  CreateUserInput,
} from "@/lib/validation/user";

/**
 * User management — Super Admin only (enforced by the calling Route
 * Handler via requireSuperAdminForApi(), not re-checked here; this layer
 * trusts its caller the same way every other service in this app does —
 * see station-service.ts's mutation section for the identical pattern).
 *
 * Deliberately no hard-delete-user function: the spec's own emphasis is
 * deactivation, not deletion ("their data should not be deleted") — a
 * user's favorites/reviews/reports/verification-log/created-station rows
 * all reference them, and this app never hard-deletes rows with real
 * dependents (see docs/architecture.md §4's soft-delete rule for
 * stations/chargers). Deactivating (status: INACTIVE) is the only
 * sanctioned way to remove someone's access.
 */

const BCRYPT_SALT_ROUNDS = 12;

const userListSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserListRow = Prisma.UserGetPayload<{ select: typeof userListSelect }>;

export async function listUsers(query: UserListQuery) {
  const where: Prisma.UserWhereInput = {};
  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;
  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const };
    where.OR = [{ name: contains }, { email: contains }, { phone: contains }];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: userListSelect,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { data: users, meta: buildPaginationMeta(query.page, query.pageSize, total) };
}

export async function getUserById(id: string): Promise<UserListRow | null> {
  return prisma.user.findUnique({ where: { id }, select: userListSelect });
}

export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export async function createUser(input: CreateUserInput): Promise<MutationResult<UserListRow>> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        passwordHash,
        role: input.role,
      },
      select: userListSelect,
    });
    return { ok: true, data: user };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "An account with this email already exists.", status: 409 };
    }
    throw error;
  }
}

/** ADMIN <-> USER only — a SUPER_ADMIN target is never a valid role-change target through this function (protects the account from accidental demotion; see prisma/schema.prisma's UserRole comment). */
export async function changeUserRole(
  id: string,
  role: "ADMIN" | "USER"
): Promise<MutationResult<UserListRow>> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "User not found.", status: 404 };
  }
  if (existing.role === "SUPER_ADMIN") {
    return { ok: false, error: "A Super Admin's role can't be changed here.", status: 403 };
  }

  const user = await prisma.user.update({ where: { id }, data: { role }, select: userListSelect });
  return { ok: true, data: user };
}

/** `actingUserId` is the Super Admin making the call — self-deactivation is always rejected, so a Super Admin can never lock themselves out. */
export async function changeUserStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE",
  actingUserId: string
): Promise<MutationResult<UserListRow>> {
  if (id === actingUserId && status === "INACTIVE") {
    return { ok: false, error: "You can't deactivate your own account.", status: 400 };
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "User not found.", status: 404 };
  }

  const user = await prisma.user.update({ where: { id }, data: { status }, select: userListSelect });
  return { ok: true, data: user };
}

/** A Super Admin sets a new password for someone else — no "current password" check, since it isn't theirs to know. */
export async function resetUserPassword(
  id: string,
  newPassword: string
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "User not found.", status: 404 };
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  return { ok: true, data: { id } };
}
