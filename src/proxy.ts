import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";

/**
 * Route protection — optimistic pass only (reads the JWT session cookie,
 * no database hit). This file is named `proxy.ts`, not `middleware.ts`:
 * Next.js 16 renamed the middleware file convention to Proxy (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * It lives at src/proxy.ts, next to src/app, per that doc's placement rule.
 *
 * IMPORTANT: this is a UX convenience, not the security boundary. Server
 * Actions are not necessarily covered by Proxy's matcher, so every
 * sensitive Server Action/Route Handler must independently call
 * requireUser()/requireAdmin() from src/lib/auth/session.ts — see
 * docs/architecture.md §3/§10.
 */

const PROTECTED_PREFIXES = ["/profile", "/admin", "/dashboard", "/my-favorites"];
const AUTH_PAGES = new Set(["/login", "/register"]);

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = Boolean(req.auth?.user);
  const role = req.auth?.user?.role;
  const isAdminOrAbove = role === "ADMIN" || role === "SUPER_ADMIN";

  const isProtected = matchesPrefix(pathname, PROTECTED_PREFIXES);
  const isAdminRoute = matchesPrefix(pathname, ["/admin"]);
  // User management is Super Admin only — a strict subset of /admin's own
  // protection below, checked separately since a plain ADMIN legitimately
  // passes the /admin check but must still be turned away from this one.
  const isSuperAdminRoute = matchesPrefix(pathname, ["/admin/users"]);

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && !isAdminOrAbove) {
    // Authenticated but not an admin (or not authenticated at all, which
    // the isProtected check above already sent to /login) — send non-admins
    // somewhere sane rather than exposing that the route exists.
    return NextResponse.redirect(new URL(isLoggedIn ? "/profile" : "/login", req.nextUrl));
  }

  if (isSuperAdminRoute && role !== "SUPER_ADMIN") {
    // An authenticated plain ADMIN (already past the check above) trying a
    // Super-Admin-only URL directly — sent back to the dashboard they do
    // have, not just bounced to /login.
    return NextResponse.redirect(new URL("/admin", req.nextUrl));
  }

  if (AUTH_PAGES.has(pathname) && isLoggedIn) {
    return NextResponse.redirect(new URL(isAdminOrAbove ? "/admin" : "/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
