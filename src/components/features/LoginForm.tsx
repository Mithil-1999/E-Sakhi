"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { loginAction, type LoginFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/Button";

const initialState: LoginFormState = undefined;

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-5" noValidate>
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative mt-1">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          name="remember"
          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700"
        />
        Remember me
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {pending ? "Logging in…" : "Log in"}
      </Button>

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
          Create one
        </Link>
      </p>
    </form>
  );
}
