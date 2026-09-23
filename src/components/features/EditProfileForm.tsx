"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

/**
 * Self-service profile editing (name/email/phone only) — every role gets
 * this, including Member. PATCH /api/profile never accepts role or
 * status; those are Super-Admin-only fields with their own endpoints.
 */
export function EditProfileForm({
  initialName,
  initialEmail,
  initialPhone,
}: {
  initialName: string;
  initialEmail: string;
  initialPhone: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccess(false);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Could not save your changes.");
      }
      setSuccess(true);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save your changes.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="profile-name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Name
        </label>
        <input id="profile-name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="profile-email" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Email
        </label>
        <input
          id="profile-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="profile-phone" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Phone Number
        </label>
        <input
          id="profile-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Not set"
          className={inputClass}
        />
      </div>

      {success && <p className="text-sm text-emerald-700 dark:text-emerald-400">Profile updated successfully.</p>}
      {errorMessage && <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>}

      <Button type="submit" variant="outline" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}
