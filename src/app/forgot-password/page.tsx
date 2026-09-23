import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Forgot password",
};

/**
 * E Sakhi has no email service configured — a "reset link sent to your
 * email" flow would be fake (an email that's never actually sent). Rather
 * than pretend, this page states the real, working path: a Super Admin
 * can set a new password for any account from /admin/users/[id] (see
 * src/app/admin/users/[id]/page.tsx), which the affected person is then
 * given out of band (in person, chat, etc.). If a real email/SMS
 * provider is added later, this page is the one place to replace with an
 * actual token-based reset flow.
 */
export default function ForgotPasswordPage() {
  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-center">
          <Logo />
          <span className="mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            <KeyRound className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Forgot your password?</h1>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          E Sakhi doesn&apos;t have automated email password resets set up yet — self-service reset
          links aren&apos;t available. Instead, ask a Super Admin to reset your password for you from
          the User Management panel; they&apos;ll share the new password with you directly.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          ← Back to log in
        </Link>
      </div>
    </Container>
  );
}
