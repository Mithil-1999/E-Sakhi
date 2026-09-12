import "server-only";
import { getOptionalUser, type SessionUser } from "@/lib/auth/session";
import { apiError } from "@/lib/api/response";

/**
 * Auth helpers for Route Handlers specifically.
 *
 * requireUser()/requireAdmin() in session.ts call next/navigation's
 * redirect() — correct for pages and Server Actions, but wrong here: an
 * API caller (fetch from client JS, curl, a future mobile client) needs a
 * 401/403 JSON body, not an HTTP redirect to /login. These helpers do the
 * same real, server-side session/role check but return a Response instead
 * of throwing a redirect — see docs/architecture.md §3/§10.
 */

type ApiAuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

export async function requireUserForApi(): Promise<ApiAuthResult> {
  const user = await getOptionalUser();
  if (!user) {
    return {
      ok: false,
      response: apiError("Authentication required.", "UNAUTHENTICATED", 401),
    };
  }
  return { ok: true, user };
}

export async function requireAdminForApi(): Promise<ApiAuthResult> {
  const result = await requireUserForApi();
  if (!result.ok) return result;
  if (result.user.role !== "ADMIN") {
    return {
      ok: false,
      response: apiError("Admin access required.", "FORBIDDEN", 403),
    };
  }
  return result;
}
