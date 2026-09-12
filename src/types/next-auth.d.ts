import type { DefaultSession } from "next-auth";

/**
 * Augments Auth.js's built-in types with the fields our jwt/session
 * callbacks actually put on the token and session (src/lib/auth/auth.ts).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "USER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "USER" | "ADMIN";
  }
}
