"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { LoginSchema } from "@/lib/validation/auth";

export type LoginFormState = { error?: string } | undefined;

/** Where a just-signed-in user lands when no callbackUrl was given — role-aware, per the RBAC upgrade's login-redirection requirement. Super Admin and Admin share the same /admin shell (role-aware inside it — see src/app/admin/layout.tsx); a plain Member goes to their own dashboard. */
function defaultDestinationFor(role: "SUPER_ADMIN" | "ADMIN" | "USER"): string {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "/admin";
  return "/dashboard";
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Please enter a valid email and password." };
  }

  const callbackUrl = (formData.get("callbackUrl") as string) || null;
  const remember = formData.get("remember") === "on";

  try {
    // redirect:false — sign in without Auth.js's own redirect, so this
    // action can pick the destination itself (callbackUrl, else role-based).
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      remember: String(remember),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          // Deliberately the same message for "wrong password," "no such
          // account," and "deactivated account" — never confirm to an
          // unauthenticated caller which case it was.
          return { error: "Invalid email or password." };
        default:
          return { error: "Something went wrong. Please try again." };
      }
    }
    throw error;
  }

  // Read the role directly from the database rather than calling auth()
  // here — the just-set session cookie from signIn() above isn't reliably
  // visible to a fresh auth() call within the same server action
  // execution, so relying on it silently redirected every successful
  // login to the Member default. This is authoritative and just as fast.
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { role: true },
  });
  redirect(callbackUrl || defaultDestinationFor(user?.role ?? "USER"));
}
