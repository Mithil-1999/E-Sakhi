import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

/**
 * Data Access Layer for auth — the single place every Server Component,
 * Server Action, and Route Handler goes to check who's signed in and
 * what they're allowed to do. Proxy (src/proxy.ts) does an *optimistic*
 * pass for UX (redirecting obviously-unauthenticated requests early),
 * but it is not a substitute for these checks: Server Actions are not
 * separate routes Proxy's matcher necessarily covers, so every
 * sensitive action must call one of these itself. See
 * docs/architecture.md §3 and §10.
 *
 * Three roles now (RBAC upgrade): SUPER_ADMIN, ADMIN, USER (labeled
 * "Member" everywhere in the UI — see prisma/schema.prisma's UserRole
 * comment for why the enum value itself stays USER). SUPER_ADMIN is a
 * strict superset of ADMIN: requireAdmin() below passes for both, so
 * every one of the ~19 existing ADMIN-gated pages/routes (station/
 * charger management, import, verification, reports) already works
 * correctly for SUPER_ADMIN too, with no changes to any of them.
 */

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "USER";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
};

/**
 * Returns the signed-in user from the JWT session only — no database hit,
 * so it's cheap enough to call on every page (the header uses this to show
 * Login/Register vs Profile/Logout). NOT the check to gate a sensitive
 * action on: the JWT's role can be briefly stale after a role change or
 * deactivation (a JWT session isn't invalidated server-side the instant
 * the database changes). Use requireUser()/requireAdmin()/
 * requireSuperAdmin() below for anything that actually needs an
 * up-to-the-request-accurate role/status check.
 */
export async function getOptionalUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    role: session.user.role,
  };
}

/**
 * Returns the signed-in user, re-verified fresh against the live database
 * (current role AND current status — not the JWT's, which can be stale)
 * on every call. Redirects to /login if there's no session, the user row
 * is gone, or the account has since been deactivated — so a Super Admin
 * deactivating someone, or changing their role, takes effect on that
 * person's very next authenticated request, not just at their next login.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getOptionalUser();
  if (!session) {
    redirect("/login");
  }

  const current = await prisma.user.findUnique({
    where: { id: session.id },
    select: { name: true, email: true, role: true, status: true },
  });
  if (!current || current.status !== "ACTIVE") {
    redirect("/login?deactivated=1");
  }

  return { id: session.id, name: current.name, email: current.email, role: current.role };
}

/** Returns the signed-in ADMIN-or-SUPER_ADMIN user, or redirects. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    redirect("/profile");
  }
  return user;
}

/** Returns the signed-in SUPER_ADMIN user, or redirects. User management (this app's most sensitive surface) is exclusive to this role. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") {
    redirect("/admin");
  }
  return user;
}
