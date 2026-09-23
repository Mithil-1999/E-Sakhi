"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

/** Self-service password change — requires the caller's real current password (verified server-side, PATCH /api/profile/password). Every role, including Member, gets this. */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccess(false);

    if (newPassword !== confirmNewPassword) {
      setErrorMessage("New password and confirmation don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Could not change your password.");
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not change your password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const type = showPasswords ? "text" : "password";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="current-password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Current Password
        </label>
        <input
          id="current-password"
          type={type}
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="new-password-self" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          New Password
        </label>
        <div className="relative">
          <input
            id="new-password-self"
            type={type}
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
          >
            {showPasswords ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor="confirm-new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Confirm New Password
        </label>
        <input
          id="confirm-new-password"
          type={type}
          required
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      {success && <p className="text-sm text-emerald-700 dark:text-emerald-400">Password changed successfully.</p>}
      {errorMessage && <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>}

      <Button type="submit" variant="outline" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Change Password"}
      </Button>
    </form>
  );
}
