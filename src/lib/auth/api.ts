import "server-only";
import { getOptionalUser, type SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/api/response";

/**
 * Auth helpers for Route Handlers specifically.
 *
 * requireUser()/requireAdmin()/requireSuperAdmin() in session.ts call
 * next/navigation's redirect() — correct for pages and Server Actions, but
 * wrong here: an API caller (fetch from client JS, curl, a future mobile
 * client) needs a 401/403 JSON body, not an HTTP redirect to /login. These
 * helpers do the same real, server-side session/role/status check —
 * re-verified fresh against the database, not just the JWT's possibly-
 * stale claim — but return a Response instead of throwing a redirect. See
 * docs/architecture.md §3/§10.
 */

type ApiAuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

export async function requireUserForApi(): Promise<ApiAuthResult> {
  const session = await getOptionalUser();
  if (!session) {
    return {
      ok: false,
      response: apiError("Authentication required.", "UNAUTHENTICATED", 401),
    };
  }

  const current = await prisma.user.findUnique({
    where: { id: session.id },
    select: { name: true, email: true, role: true, status: true },
  });
  if (!current || current.status !== "ACTIVE") {
    return {
      ok: false,
      response: apiError(
        current ? "Your account has been deactivated." : "Authentication required.",
        "UNAUTHENTICATED",
        401
      ),
    };
  }

  return { ok: true, user: { id: session.id, name: current.name, email: current.email, role: current.role } };
}

/** ADMIN or SUPER_ADMIN — every existing ADMIN-only API route already calling this now also correctly allows SUPER_ADMIN, with no changes to those routes. */
export async function requireAdminForApi(): Promise<ApiAuthResult> {
  const result = await requireUserForApi();
  if (!result.ok) return result;
  if (result.user.role !== "ADMIN" && result.user.role !== "SUPER_ADMIN") {
    return {
      ok: false,
      response: apiError("Admin access required.", "FORBIDDEN", 403),
    };
  }
  return result;
}

/** SUPER_ADMIN only — user management (list/create/role-change/activate-deactivate) never accepts a plain ADMIN, even via a hand-crafted request. */
export async function requireSuperAdminForApi(): Promise<ApiAuthResult> {
  const result = await requireUserForApi();
  if (!result.ok) return result;
  if (result.user.role !== "SUPER_ADMIN") {
    return {
      ok: false,
      response: apiError("Super Admin access required.", "FORBIDDEN", 403),
    };
  }
  return result;
}
