import type { Metadata } from "next";
import Link from "next/link";
import { Flag } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Pagination } from "@/components/ui/Pagination";
import { ReportQueueList } from "@/components/features/admin/ReportQueueList";
import { requireAdmin } from "@/lib/auth/session";
import { ReportQueueQuerySchema, REPORT_QUEUE_TABS, type ReportQueueTab } from "@/lib/validation/admin-report";
import { listReportQueue } from "@/services/report-service";
import { getAdminDashboardStats } from "@/services/admin-dashboard-service";

export const metadata: Metadata = {
  title: "Reports",
};

const TAB_LABELS: Record<ReportQueueTab, string> = {
  PENDING: "Pending",
  REVIEWING: "Reviewing",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  ALL: "All",
};

/**
 * The report triage queue (Part 15) — what finally gives admins a way to
 * act on the "Report Incorrect Information" submissions ReportButton.tsx
 * collects, and what populates `/admin`'s "Reports"/"Pending reports"
 * stat cards for real. Tabs mirror /admin/verification's own pattern
 * (plain `?tab=...` links, no client JS for navigation), but unlike that
 * queue — which only reviews inline and links out to Part 12's edit form
 * for the one thing it can change — this page's actual status-change
 * mutation happens right here, via the Client Component ReportQueueList.
 */
export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  // src/proxy.ts already redirects non-admins as a UX shortcut, but this
  // is the real, server-verified check. See docs/architecture.md §3/§10.
  await requireAdmin();

  const rawParams = Object.fromEntries(
    Object.entries(await searchParams).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))
  );
  const parsed = ReportQueueQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : ReportQueueQuerySchema.parse({});

  const [{ data: reports, meta }, stats] = await Promise.all([
    listReportQueue(query),
    getAdminDashboardStats(),
  ]);

  const countByStatus = new Map(stats.reportStatusDistribution.map((r) => [r.status, r.count]));
  const tabCounts: Record<ReportQueueTab, number> = {
    PENDING: countByStatus.get("PENDING") ?? 0,
    REVIEWING: countByStatus.get("REVIEWING") ?? 0,
    RESOLVED: countByStatus.get("RESOLVED") ?? 0,
    REJECTED: countByStatus.get("REJECTED") ?? 0,
    ALL: stats.reports.total,
  };

  function tabHref(tab: ReportQueueTab) {
    return `/admin/reports?tab=${tab}`;
  }

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();
    params.set("tab", query.tab);
    const clamped = Math.max(1, Math.min(targetPage, meta.totalPages));
    params.set("page", String(clamped));
    return `/admin/reports?${params.toString()}`;
  }

  return (
    <Container className="py-10">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          <Flag className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {meta.total} report{meta.total === 1 ? "" : "s"} in this view — user-submitted
            &quot;Report Incorrect Information&quot; issues, oldest first.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {REPORT_QUEUE_TABS.map((tab) => (
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

      <ReportQueueList initialReports={reports} tab={query.tab} />

      <Pagination page={meta.page} totalPages={meta.totalPages} buildHref={buildHref} />
    </Container>
  );
}
