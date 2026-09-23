"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

/**
 * The real mechanism behind /forgot-password's "ask a Super Admin"
 * guidance — this app has no email service, so there's no token-based
 * reset link to send. A Super Admin sets the new password directly here
 * and shares it with the user out of band (in person, chat, etc.);
 * nothing is emailed or logged.
 */
export function ResetPasswordPanel({ userId, userName }: { userId: string; userName: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccess(false);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Could not reset the password.");
      }
      setSuccess(true);
      setNewPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not reset the password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
        <KeyRound className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        Reset Password
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Sets {userName}&apos;s password directly — share the new password with them yourself; E Sakhi
        doesn&apos;t email it.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
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
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Reset"}
        </Button>
      </form>
      {success && (
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          Password updated successfully. Share it with {userName} directly.
        </p>
      )}
      {errorMessage && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>}
    </section>
  );
}
