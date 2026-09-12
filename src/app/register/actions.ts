"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/auth";
import { registerUser } from "@/services/auth-service";

export type RegisterFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    }
  | undefined;

export async function registerAction(
  _prevState: RegisterFormState,
  formData: FormData
): Promise<RegisterFormState> {
  // Deliberately does NOT read a "role" field from formData — registration
  // always creates a USER. See src/services/auth-service.ts.
  const result = await registerUser({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  try {
    // Log the new user in immediately so they land on /profile signed in.
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/profile",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Account was created but the immediate sign-in failed for some
      // reason — send them to log in manually rather than fail silently.
      return {
        error: "Account created. Please log in.",
      };
    }
    throw error; // Next's redirect() throws too — let it propagate.
  }

  return undefined;
}
