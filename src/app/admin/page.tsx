import type { Metadata } from "next";
import Link from "next/link";
import {
  Battery,
  FileSpreadsheet,
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
import { VerificationLogTable } from "@/components/features/admin/VerificationLogTable";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminDashboardStats, getRecentVerificationActivity } from "@/services/admin-dashboard-service";

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

/**
 * The admin overview/reporting landing page (Part 11) — read-only,
 * computed fresh from the live database on every request. Deliberately
 * does not manage anything itself: creating/editing stations through a UI
 * is Part 12 (`/admin/stations`), and the verification-approval workflow
 * is Part 13 (`/admin/verification`) — this page only reports and links
 * out to both.
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
    { label: "Reports", value: stats.reports.total, icon: Flag, href: "/admin/reports" },
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
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/import"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Import Data
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Verification Queue
          </Link>
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
          >
            <Flag className="h-4 w-4" aria-hidden="true" />
            Reports
            {stats.reports.pending > 0 && (
              <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {stats.reports.pending}
              </span>
            )}
          </Link>
          <Link
            href="/admin/stations"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Manage Stations
          </Link>
        </div>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Recent verification activity
          </h2>
          <Link
            href="/admin/verification"
            className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Open verification queue →
          </Link>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Every verification-field change made through <code>PUT /api/stations/[id]</code> is logged
          here automatically — see docs/architecture.md §4/§5. This feed is platform-wide and capped
          at the latest 15; the verification queue shows a station&apos;s full history.
        </p>

        <VerificationLogTable rows={recentActivity} />
      </section>
    </Container>
  );
}
