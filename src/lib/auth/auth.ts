import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/prisma";
import { LoginSchema } from "@/lib/validation/auth";
import { verifyPassword } from "@/services/auth-service";

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
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = LoginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const passwordMatches = await verifyPassword(password, user.passwordHash);
        if (!passwordMatches) return null;

        // Only the minimum needed to populate the JWT — never the hash.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "USER" | "ADMIN";
      }
      return session;
    },
  },
});
