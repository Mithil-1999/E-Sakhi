import type { DefaultSession } from "next-auth";

/**
 * Augments Auth.js's built-in types with the fields our jwt/session
 * callbacks actually put on the token and session (src/lib/auth/auth.ts).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "SUPER_ADMIN" | "ADMIN" | "USER";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "SUPER_ADMIN" | "ADMIN" | "USER";
    /** "Remember me" — only ever read once, inside the jwt callback, to size that token's expiry; never persisted anywhere else. */
    remember?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "SUPER_ADMIN" | "ADMIN" | "USER";
  }
}
