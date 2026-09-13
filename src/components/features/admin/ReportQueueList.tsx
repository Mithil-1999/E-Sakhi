"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, MapPin, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AdminReportItem, ReportStatus, ReportType } from "@/types/report";
import type { ReportQueueTab } from "@/lib/validation/admin-report";

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  WRONG_LOCATION: "Wrong location",
  WRONG_CONNECTOR: "Wrong connector type",
  WRONG_POWER: "Wrong power rating",
  STATION_UNAVAILABLE: "Station unavailable or removed",
  WRONG_CONTACT: "Wrong contact number",
  DUPLICATE_STATION: "Duplicate station",
  OTHER: "Other",
};

const STATUS_STYLES: Record<ReportStatus, string> = {
  PENDING: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  REVIEWING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  RESOLVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  REJECTED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/**
 * Real admin triage (Part 15) for reports filed through
 * ReportButton.tsx/POST /api/stations/[id]/reports — a status change here
 * is the one mutation this queue needs, so (unlike /admin/verification,
 * which only links out to Part 12's edit form) it's a Client Component:
 * PATCH /api/reports/[id], then update local state in place, no full page
 * reload — the exact fetch-then-filter-local-array pattern
 * AdminChargerManager.tsx (Part 12) and MyFavoritesList.tsx (Part 10)
 * already use. A report moved to a status outside the current tab is
 * dropped from view (it now belongs on a different tab); on the "All"
 * tab it's simply updated in place instead.
 */
export function ReportQueueList({
  initialReports,
  tab,
}: {
  initialReports: AdminReportItem[];
  tab: ReportQueueTab;
}) {
  const [reports, setReports] = useState(initialReports);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(id: string, status: ReportStatus) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Could not update this report.");

      const updated = body.data as { id: string; status: ReportStatus; resolvedAt: string | null };
      setReports((prev) =>
        tab === "ALL"
          ? prev.map((r) => (r.id === id ? { ...r, status: updated.status, resolvedAt: updated.resolvedAt } : r))
          : prev.filter((r) => r.id !== id)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this report.");
    } finally {
      setPendingId(null);
    }
  }

  if (reports.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Nothing here</h2>
        <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">
          {tab === "PENDING" ? "No reports are waiting for review." : "No reports match this view."}
        </p>
      </div>
    );
  }

  return (
    <>
      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <ul className="mt-6 space-y-4">
        {reports.map((report) => (
          <li
            key={report.id}
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/stations/${report.station.id}`}
                  className="font-semibold text-slate-900 hover:underline dark:text-white"
                >
                  {report.station.stationName}
                </Link>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {report.station.city}, {report.station.district}, {report.station.province}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[report.status]}`}
              >
                {report.status}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Issue</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {REPORT_TYPE_LABELS[report.reportType]}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Reported by</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {report.user.name ?? "Unknown user"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Submitted</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {dateFormatter.format(new Date(report.createdAt))}
                </dd>
              </div>
            </dl>

            {report.description && (
              <p className="mt-3 rounded-md bg-slate-50 p-2.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {report.description}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {report.status !== "REVIEWING" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendingId === report.id}
                  onClick={() => changeStatus(report.id, "REVIEWING")}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  Mark reviewing
                </Button>
              )}
              {report.status !== "RESOLVED" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendingId === report.id}
                  onClick={() => changeStatus(report.id, "RESOLVED")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  Resolve
                </Button>
              )}
              {report.status !== "REJECTED" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendingId === report.id}
                  onClick={() => changeStatus(report.id, "REJECTED")}
                >
                  <XCircle className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                  Reject
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
