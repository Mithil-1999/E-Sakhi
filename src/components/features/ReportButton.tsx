"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ReportCreateSchema, REPORT_TYPES } from "@/lib/validation/report";
import type { ReportType } from "@/types/report";

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  WRONG_LOCATION: "Wrong location",
  WRONG_CONNECTOR: "Wrong connector type",
  WRONG_POWER: "Wrong power rating",
  STATION_UNAVAILABLE: "Station unavailable or removed",
  WRONG_CONTACT: "Wrong contact number",
  DUPLICATE_STATION: "Duplicate station",
  OTHER: "Other",
};

const fieldClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

/**
 * Real "Report Incorrect Information" flow (Part 15) — replaces the
 * disabled stub the station detail page (Part 07) has shown since launch.
 * No Modal/Dialog primitive exists anywhere in this codebase
 * (docs/architecture.md §4), so this expands inline in place, the same
 * "no new UI infrastructure for one feature" call already made for the
 * admin soft-delete confirm. A submitted report is never shown back to
 * the reporting user afterward — only an admin triages it, at
 * /admin/reports — so this component's only job after success is a
 * plain thank-you message, not a receipt.
 */
export function ReportButton({ stationId, isLoggedIn }: { stationId: string; isLoggedIn: boolean }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("OTHER");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <Button href={`/login?callbackUrl=${encodeURIComponent(pathname || "/")}`} variant="outline">
        <Flag className="h-4 w-4" aria-hidden="true" />
        Log in to report an issue
      </Button>
    );
  }

  if (submitted) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300">
        Thanks — your report has been submitted for review.
      </p>
    );
  }

  if (!isOpen) {
    return (
      <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
        <Flag className="h-4 w-4" aria-hidden="true" />
        Report Incorrect Information
      </Button>
    );
  }

  function submit() {
    setError(null);
    const parsed = ReportCreateSchema.safeParse({
      reportType,
      description: description.trim() === "" ? null : description.trim(),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid report.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/stations/${stationId}/reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error?.message ?? "Could not submit your report.");
        }
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not submit your report.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">What&apos;s wrong?</label>
      <select
        value={reportType}
        onChange={(e) => setReportType(e.target.value as ReportType)}
        className={fieldClass}
      >
        {REPORT_TYPES.map((t) => (
          <option key={t} value={t}>
            {REPORT_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      <label className="mt-3 block text-xs font-medium text-slate-700 dark:text-slate-200">
        Details (optional)
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        maxLength={1000}
        className={fieldClass}
        placeholder="What did you notice?"
      />

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? "Submitting…" : "Submit report"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
