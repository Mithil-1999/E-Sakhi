import Link from "next/link";
import { labelForField } from "@/services/admin-dashboard-service";

/**
 * Shared VerificationLog table — extracted from the admin dashboard's
 * "recent activity" feed (Part 11) so the verification queue's per-station
 * history (Part 13) renders it identically instead of a second table.
 * A plain Server Component (no "use client"): both call sites are Server
 * Components themselves, so real `Date` objects pass straight through,
 * same as Pagination.tsx.
 */

export type VerificationLogRow = {
  id: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  admin: { name: string | null } | null;
  station?: { id: string; stationName: string };
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function truncate(value: string | null, max = 40): string {
  if (value === null) return "(none)";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function VerificationLogTable({
  rows,
  emptyMessage = "No verification changes have been logged yet.",
}: {
  rows: VerificationLogRow[];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{emptyMessage}</p>;
  }

  const showStation = rows.some((r) => r.station);

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {showStation && <th className="pb-2 pr-4 font-medium">Station</th>}
            <th className="pb-2 pr-4 font-medium">Field</th>
            <th className="pb-2 pr-4 font-medium">Change</th>
            <th className="pb-2 pr-4 font-medium">Admin</th>
            <th className="pb-2 font-medium">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((entry) => (
            <tr key={entry.id}>
              {showStation && (
                <td className="max-w-[160px] truncate py-2 pr-4">
                  {entry.station ? (
                    <Link
                      href={`/stations/${entry.station.id}`}
                      className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      {entry.station.stationName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              )}
              <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
                {labelForField(entry.fieldChanged)}
              </td>
              <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                <span className="line-through">{truncate(entry.oldValue)}</span>{" "}
                <span aria-hidden="true">→</span> {truncate(entry.newValue)}
              </td>
              <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                {entry.admin?.name ?? "Unknown admin"}
              </td>
              <td className="whitespace-nowrap py-2 text-slate-500 dark:text-slate-400">
                {dateFormatter.format(entry.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
