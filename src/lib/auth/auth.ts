import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/prisma";
import { LoginSchema } from "@/lib/validation/auth";
import { verifyPassword } from "@/services/auth-service";

// "Remember me" unchecked keeps a session usable for a day; checked, 30
// days — both real, different token expiries (see the jwt callback below),
// not a cosmetic checkbox. `session.maxAge` below is the ceiling used when
// remember=true; the jwt callback shortens it for remember=false by
// setting a nearer token.exp directly.
const REMEMBERED_SESSION_SECONDS = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_SESSION_SECONDS = 60 * 60 * 24; // 1 day

/**
 * Auth.js (NextAuth v5) configuration — see docs/architecture.md §3.
 *
 * No database adapter is used: Credentials + JWT session is the whole
 * story here (no OAuth providers), so the standard Account/Session/
 * VerificationToken tables Auth.js ships for adapters aren't needed —
 * User.password_hash/role (prisma/schema.prisma) is all the persistence
 * this requires. The session itself lives in a signed, httpOnly JWT
 * cookie carrying only userId and role, never the password hash or
 * other PII, per the architecture's session-payload rule.
 *
 * A deactivated account (User.status !== "ACTIVE") is rejected right here
 * at sign-in — but a JWT already issued before deactivation stays
 * technically valid until it expires; the real, immediate enforcement is
 * requireUser()'s fresh database check on every subsequent authenticated
 * request (src/lib/auth/session.ts), not this one-time gate alone.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: REMEMBERED_SESSION_SECONDS },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember me", type: "text" },
      },
      async authorize(rawCredentials) {
        const parsed = LoginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        if (user.status !== "ACTIVE") return null;

        const passwordMatches = await verifyPassword(password, user.passwordHash);
        if (!passwordMatches) return null;

        // Only the minimum needed to populate the JWT — never the hash.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          remember: rawCredentials?.remember === "true",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only defined right after a successful authorize() call.
      if (user) {
        token.id = user.id;
        token.role = user.role;
        if (!user.remember) {
          token.exp = Math.floor(Date.now() / 1000) + DEFAULT_SESSION_SECONDS;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "SUPER_ADMIN" | "ADMIN" | "USER";
      }
      return session;
    },
  },
});
