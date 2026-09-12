import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Pagination } from "@/components/ui/Pagination";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import {
  StationFilterPanel,
  type StationFilterValues,
} from "@/components/features/StationFilterPanel";
import { StationListQuerySchema } from "@/lib/validation/station";
import { listStations } from "@/services/station-service";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Manage Stations",
};

const STATUS_LABELS: Record<"ACTIVE" | "INACTIVE" | "UNKNOWN", string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  UNKNOWN: "Unknown",
};

// Same filter keys StationFilterPanel already reads/writes — reused as-is
// (it navigates via usePathname(), so it works unmodified on /admin/stations).
const FILTER_KEYS: (keyof StationFilterValues)[] = [
  "search",
  "province",
  "connector",
  "chargingMode",
  "powerBucket",
  "vehicleType",
  "status",
  "availability",
];

function normalizeSearchParams(
  raw: Record<string, string | string[] | undefined>
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined) normalized[key] = single;
  }
  return normalized;
}

function toFilterValues(query: Record<string, string>): StationFilterValues {
  const values = {} as StationFilterValues;
  for (const key of FILTER_KEYS) {
    values[key] = query[key] ?? "";
  }
  return values;
}

export default async function AdminStationsPage({
  searchParams,
}: PageProps<"/admin/stations">) {
  // src/proxy.ts already redirects non-admins as a UX shortcut, but this
  // is the real, server-verified check. See docs/architecture.md §3/§10.
  await requireAdmin();

  const rawParams = normalizeSearchParams(await searchParams);
  const parsed = StationListQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : StationListQuerySchema.parse({});

  // Unlike the public /stations page, an admin can opt into seeing
  // soft-deleted stations — the ?includeDeleted=true toggle below, backed
  // by the same field StationListQuerySchema/GET /api/stations already
  // define (there it's ignored for non-admins; here we ARE the admin, so
  // the query's own value is trusted directly).
  const { data: stations, meta } = await listStations(query, query.includeDeleted);
  const filterValues = toFilterValues(rawParams);

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      if (filterValues[key]) params.set(key, filterValues[key]);
    }
    if (query.includeDeleted) params.set("includeDeleted", "true");
    const clamped = Math.max(1, Math.min(targetPage, meta.totalPages));
    params.set("page", String(clamped));
    return `/admin/stations?${params.toString()}`;
  }

  const toggleDeletedHref = (() => {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      if (filterValues[key]) params.set(key, filterValues[key]);
    }
    if (!query.includeDeleted) params.set("includeDeleted", "true");
    return `/admin/stations?${params.toString()}`;
  })();

  return (
    <Container className="py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manage Stations</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {meta.total} station{meta.total === 1 ? "" : "s"} match your filters
            {query.includeDeleted ? " (including soft-deleted)" : ""}.
          </p>
        </div>
        <Link
          href="/admin/stations/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Station
        </Link>
      </div>

      <StationFilterPanel currentFilters={filterValues} />

      <div className="mt-4">
        <Link
          href={toggleDeletedHref}
          className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          {query.includeDeleted ? "Hide soft-deleted stations" : "Show soft-deleted stations"}
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr className="text-xs text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className="px-4 py-3 font-medium">Chargers</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Verification</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
            {stations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No stations match these filters.
                </td>
              </tr>
            ) : (
              stations.map((station) => (
                <tr key={station.id} className={station.isDeleted ? "opacity-60" : undefined}>
                  <td className="max-w-[220px] px-4 py-3">
                    <div className="truncate font-medium text-slate-900 dark:text-white">
                      {station.stationName}
                      {station.isDeleted && (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                          Deleted
                        </span>
                      )}
                    </div>
                    {station.stationId && (
                      <div className="text-xs text-slate-400 dark:text-slate-500">{station.stationId}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {station.city}, {station.district}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {station.operator?.name ?? "Independent"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {station.chargerSummary.count}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {STATUS_LABELS[station.status]}
                  </td>
                  <td className="px-4 py-3">
                    <VerificationBadge status={station.verificationStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/stations/${station.id}/edit`}
                      className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={meta.page} totalPages={meta.totalPages} buildHref={buildHref} />
    </Container>
  );
}
