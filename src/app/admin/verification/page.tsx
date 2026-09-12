import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Search, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Pagination } from "@/components/ui/Pagination";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { VerificationChecklist } from "@/components/ui/VerificationChecklist";
import { requireAdmin } from "@/lib/auth/session";
import { VerificationQueueQuerySchema, VERIFICATION_QUEUE_TABS, type VerificationQueueTab } from "@/lib/validation/admin-verification";
import { listVerificationQueue } from "@/services/admin-verification-service";
import { getAdminDashboardStats } from "@/services/admin-dashboard-service";

export const metadata: Metadata = {
  title: "Verification Queue",
};

const TAB_LABELS: Record<VerificationQueueTab, string> = {
  ATTENTION: "Needs attention",
  NEEDS_REVIEW: "Needs review",
  ASSUMED: "Assumed",
  UNVERIFIED: "Unverified",
  UNKNOWN: "Unknown",
  PARTIALLY_VERIFIED: "Partially verified",
  VERIFIED: "Verified",
  ALL: "All",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function truncate(value: string | null, max = 60): string {
  if (value === null) return "Not recorded";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * The verification workflow queue (Part 13) — a filtered view of stations
 * that need admin attention, not a general station browser (that's
 * /admin/stations, Part 12). Defaults to the master brief's own framing:
 * NEEDS_REVIEW + ASSUMED + UNVERIFIED, the "low confidence" set. Reviewing
 * a station's current state happens right here (the full checklist is
 * rendered inline, no click-through needed just to look); *updating* it
 * links out to the existing admin station form's Verification section
 * (Part 12) rather than a second edit form.
 */
export default async function VerificationQueuePage({
  searchParams,
}: PageProps<"/admin/verification">) {
  // src/proxy.ts already redirects non-admins as a UX shortcut, but this
  // is the real, server-verified check. See docs/architecture.md §3/§10.
  await requireAdmin();

  const rawParams = Object.fromEntries(
    Object.entries(await searchParams).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );
  const parsed = VerificationQueueQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : VerificationQueueQuerySchema.parse({});

  const [{ data: stations, meta }, stats] = await Promise.all([
    listVerificationQueue(query),
    getAdminDashboardStats(),
  ]);

  const countByStatus = new Map(stats.verificationDistribution.map((v) => [v.status, v.count]));
  const tabCounts: Record<VerificationQueueTab, number> = {
    ATTENTION:
      (countByStatus.get("NEEDS_REVIEW") ?? 0) +
      (countByStatus.get("ASSUMED") ?? 0) +
      (countByStatus.get("UNVERIFIED") ?? 0),
    NEEDS_REVIEW: countByStatus.get("NEEDS_REVIEW") ?? 0,
    ASSUMED: countByStatus.get("ASSUMED") ?? 0,
    UNVERIFIED: countByStatus.get("UNVERIFIED") ?? 0,
    UNKNOWN: countByStatus.get("UNKNOWN") ?? 0,
    PARTIALLY_VERIFIED: countByStatus.get("PARTIALLY_VERIFIED") ?? 0,
    VERIFIED: countByStatus.get("VERIFIED") ?? 0,
    ALL: stats.stations.total,
  };

  function tabHref(tab: VerificationQueueTab) {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (query.search) params.set("search", query.search);
    return `/admin/verification?${params.toString()}`;
  }

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();
    params.set("tab", query.tab);
    if (query.search) params.set("search", query.search);
    const clamped = Math.max(1, Math.min(targetPage, meta.totalPages));
    params.set("page", String(clamped));
    return `/admin/verification?${params.toString()}`;
  }

  return (
    <Container className="py-10">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Verification Queue</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {meta.total} station{meta.total === 1 ? "" : "s"} in this view. Reviewing shows each
            station&apos;s current verification state here; use Edit to change it.
          </p>
        </div>
      </div>

      {/* Status tabs — plain links, no client JS needed, same zero-JS
          pattern as Pagination.tsx. */}
      <div className="flex flex-wrap gap-2">
        {VERIFICATION_QUEUE_TABS.map((tab) => (
          <Link
            key={tab}
            href={tabHref(tab)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === query.tab
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {TAB_LABELS[tab]}
            <span className={tab === query.tab ? "text-emerald-100" : "text-slate-500 dark:text-slate-400"}>
              {tabCounts[tab]}
            </span>
          </Link>
        ))}
      </div>

      {/* Search — a plain GET form, no client component needed: the
          browser itself builds ?search=...&tab=... on submit. */}
      <form method="GET" className="mt-4 flex max-w-md items-center gap-2">
        <input type="hidden" name="tab" value={query.tab} />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            name="search"
            defaultValue={query.search ?? ""}
            placeholder="Search by station, city, district, province..."
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Search
        </button>
      </form>

      {stations.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {query.tab === "ATTENTION"
              ? "Nothing needs attention right now"
              : "No stations match this view"}
          </h2>
          <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">
            {query.tab === "ATTENTION"
              ? "No stations are currently NEEDS_REVIEW, ASSUMED, or UNVERIFIED."
              : "Try a different tab or search term."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {stations.map((station) => (
            <li
              key={station.id}
              className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/stations/${station.id}`}
                    className="font-semibold text-slate-900 hover:underline dark:text-white"
                  >
                    {station.stationName}
                  </Link>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                    {station.city}, {station.district}, {station.province} · {station.chargerCount}{" "}
                    charger{station.chargerCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <VerificationBadge status={station.verificationStatus} />
                  {station.assumptionFlag && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Assumption
                    </span>
                  )}
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Source</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {truncate(station.verificationSource)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Last verified</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {station.lastVerified ? dateFormatter.format(station.lastVerified) : "Never"}
                  </dd>
                </div>
              </dl>

              <VerificationChecklist checks={station} className="mt-3" />

              <div className="mt-4">
                <Link
                  href={`/admin/stations/${station.id}/edit#verification`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Review &amp; edit verification
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={meta.page} totalPages={meta.totalPages} buildHref={buildHref} />
    </Container>
  );
}
