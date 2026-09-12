import type { Metadata } from "next";
import Link from "next/link";
import {
  Battery,
  Flag,
  Heart,
  MapPin,
  Plug,
  Shield,
  ShieldCheck,
  Star,
  Users as UsersIcon,
  Zap,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { requireAdmin } from "@/lib/auth/session";
import {
  getAdminDashboardStats,
  getRecentVerificationActivity,
  labelForField,
} from "@/services/admin-dashboard-service";

export const metadata: Metadata = {
  title: "Admin",
};

const STATION_STATUS_LABELS: Record<"ACTIVE" | "INACTIVE" | "UNKNOWN", string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  UNKNOWN: "Unknown",
};

const STATION_STATUS_STYLES: Record<"ACTIVE" | "INACTIVE" | "UNKNOWN", string> = {
  ACTIVE: "bg-emerald-500",
  INACTIVE: "bg-red-500",
  UNKNOWN: "bg-slate-400",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function truncate(value: string | null, max = 40): string {
  if (value === null) return "(none)";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * The admin overview/reporting landing page (Part 11) — read-only,
 * computed fresh from the live database on every request. Deliberately
 * does not manage anything: creating/editing stations through a UI is
 * Part 12, and a dedicated verification-approval workflow is Part 13.
 * This page only reports what's true right now.
 */
export default async function AdminPage() {
  // src/proxy.ts already redirects non-admins away from /admin/** as a UX
  // shortcut, but this is the real, server-verified authorization check —
  // never rely on the proxy redirect alone. See docs/architecture.md §3/§10.
  const admin = await requireAdmin();

  const [stats, recentActivity] = await Promise.all([
    getAdminDashboardStats(),
    getRecentVerificationActivity(15),
  ]);

  const statCards = [
    { label: "Stations", value: stats.stations.total, icon: MapPin, href: "/admin/stations" },
    { label: "Chargers", value: stats.chargers.total, icon: Plug },
    { label: "Operators", value: stats.operators, icon: Zap },
    { label: "Connectors", value: stats.connectors, icon: Battery },
    { label: "Users", value: stats.users.total, icon: UsersIcon },
    { label: "Favorites", value: stats.favorites, icon: Heart },
    { label: "Reviews", value: stats.reviews, icon: Star },
    { label: "Reports", value: stats.reports.total, icon: Flag },
  ];

  const maxVerificationCount = Math.max(1, ...stats.verificationDistribution.map((v) => v.count));

  return (
    <Container className="py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Signed in as {admin.name ?? admin.email}. Every number below is computed live from the
              database, not cached or hard-coded.
            </p>
          </div>
        </div>
        <Link
          href="/admin/stations"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Manage Stations
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map((card) => {
          const CardIcon = card.icon;
          const content = (
            <>
              <CardIcon className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
            </>
          );
          const className =
            "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
          return card.href ? (
            <Link key={card.label} href={card.href} className={`${className} transition-shadow hover:shadow-md`}>
              {content}
            </Link>
          ) : (
            <div key={card.label} className={className}>
              {content}
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Station status + honesty stats */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Station status</h2>
          <ul className="mt-4 space-y-2">
            {stats.stations.byStatus.map((s) => (
              <li key={s.status} className="flex items-center gap-3 text-sm">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATION_STATUS_STYLES[s.status]}`} />
                <span className="w-16 shrink-0 text-slate-600 dark:text-slate-400">
                  {STATION_STATUS_LABELS[s.status]}
                </span>
                <span className="font-medium text-slate-900 dark:text-white">{s.count}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
            <div className="flex items-center justify-between">
              <dt className="text-slate-600 dark:text-slate-400">Confirmed coordinates</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {stats.stations.withCoordinates} of {stats.stations.total}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600 dark:text-slate-400">Soft-deleted stations</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{stats.stations.deleted}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600 dark:text-slate-400">Soft-deleted chargers</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{stats.chargers.deleted}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600 dark:text-slate-400">Admin accounts</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {stats.users.admins} of {stats.users.total}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600 dark:text-slate-400">Pending reports</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{stats.reports.pending}</dd>
            </div>
          </dl>
        </section>

        {/* Verification distribution */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Verification status distribution
          </h2>
          <ul className="mt-4 space-y-3">
            {stats.verificationDistribution.map((v) => (
              <li key={v.status}>
                <div className="flex items-center justify-between text-sm">
                  <VerificationBadge status={v.status} />
                  <span className="font-medium text-slate-900 dark:text-white">
                    {v.count}{" "}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      ({stats.stations.total > 0 ? Math.round((v.count / stats.stations.total) * 100) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(v.count / maxVerificationCount) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Recent verification activity */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Recent verification activity
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Every verification-field change made through <code>PUT /api/stations/[id]</code> is logged
          here automatically — see docs/architecture.md §4/§5. A full verification workflow (approving
          NEEDS_REVIEW stations, bulk actions) arrives in Part 13; this is a read-only feed.
        </p>

        {recentActivity.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            No verification changes have been logged yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Station</th>
                  <th className="pb-2 pr-4 font-medium">Field</th>
                  <th className="pb-2 pr-4 font-medium">Change</th>
                  <th className="pb-2 pr-4 font-medium">Admin</th>
                  <th className="pb-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentActivity.map((entry) => (
                  <tr key={entry.id}>
                    <td className="max-w-[160px] truncate py-2 pr-4">
                      <Link
                        href={`/stations/${entry.station.id}`}
                        className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        {entry.station.stationName}
                      </Link>
                    </td>
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
        )}
      </section>
    </Container>
  );
}
