"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type RegisterFormState } from "@/app/register/actions";
import { Button } from "@/components/ui/Button";

const initialState: RegisterFormState = undefined;

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initialState);

  return (
    <form action={action} className="space-y-5" noValidate>
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Name
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
        />
        {state?.fieldErrors?.name && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{state.fieldErrors.name[0]}</p>
        )}
      </div>

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
        {state?.fieldErrors?.email && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          At least 8 characters, with a letter and a number.
        </p>
        {state?.fieldErrors?.password && (
          <ul className="mt-1 space-y-0.5 text-sm text-red-600 dark:text-red-400">
            {state.fieldErrors.password.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        )}
      </div>

      {state?.error && !state.fieldErrors && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
          Log in
        </Link>
      </p>
    </form>
  );
}
