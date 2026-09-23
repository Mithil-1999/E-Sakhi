import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { Container } from "@/components/ui/Container";
import { LoginForm } from "@/components/features/LoginForm";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrlParam = params?.callbackUrl;
  const callbackUrl = Array.isArray(callbackUrlParam) ? callbackUrlParam[0] : callbackUrlParam;
  const deactivated = params?.deactivated === "1";

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">Welcome Back</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Log in to find chargers and manage your account.
          </p>
        </div>
        {deactivated && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            You were signed out because this account is no longer active. Contact a Super Admin if
            this is unexpected.
          </p>
        )}
        <div className="mt-6">
          <LoginForm callbackUrl={callbackUrl} />
        </div>
      </div>
    </Container>
  );
}
