import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/**
 * Data Access Layer for auth — the single place every Server Component,
 * Server Action, and Route Handler goes to check who's signed in and
 * what they're allowed to do. Proxy (src/proxy.ts) does an *optimistic*
 * pass for UX (redirecting obviously-unauthenticated requests early),
 * but it is not a substitute for these checks: Server Actions are not
 * separate routes Proxy's matcher necessarily covers, so every
 * sensitive action must call one of these itself. See
 * docs/architecture.md §3 and §10.
 */

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: "USER" | "ADMIN";
};

/** Returns the signed-in user, or null. Does not redirect. */
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

/** Returns the signed-in user, or redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getOptionalUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Returns the signed-in ADMIN user, or redirects. Never trust the client's claim of being an admin — this re-checks the server-side session on every call. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    redirect("/profile");
  }
  return user;
}
