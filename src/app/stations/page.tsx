import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { StationCard } from "@/components/features/StationCard";
import { StationFilterPanel, type StationFilterValues } from "@/components/features/StationFilterPanel";
import { StationListQuerySchema } from "@/lib/validation/station";
import { listStations } from "@/services/station-service";
import { getOptionalUser } from "@/lib/auth/session";
import { listFavoriteStationIds } from "@/services/favorite-service";

export const metadata: Metadata = {
  title: "Find Chargers",
  description: "Search and filter EV charging stations across Nepal.",
};

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

export default async function StationsPage({ searchParams }: PageProps<"/stations">) {
  const rawParams = normalizeSearchParams(await searchParams);

  // Malformed query params (a hand-edited URL, a stale bookmark) degrade
  // to "show everything" rather than an error page — this is a search
  // page, not an API; a bad filter value shouldn't block browsing.
  const parsed = StationListQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : StationListQuerySchema.parse({});

  // Public page — never includes soft-deleted stations, regardless of
  // who's viewing. See src/services/station-service.ts.
  const { data: stations, meta } = await listStations(query, false);
  const filterValues = toFilterValues(rawParams);

  const user = await getOptionalUser();
  const favoriteIds = user ? await listFavoriteStationIds(user.id) : null;

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      if (filterValues[key]) params.set(key, filterValues[key]);
    }
    const clamped = Math.max(1, Math.min(targetPage, meta.totalPages));
    params.set("page", String(clamped));
    return `/stations?${params.toString()}`;
  }

  return (
    <Container className="py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Find Chargers</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {meta.total} station{meta.total === 1 ? "" : "s"} match your filters.
        </p>
      </div>

      <StationFilterPanel currentFilters={filterValues} />

      {stations.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <SearchX className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            No stations match these filters
          </h2>
          <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Try clearing a filter or two — some combinations (like a specific
            connector plus a power range) may not exist yet in this dataset.
          </p>
          <Button href="/stations" variant="outline" className="mt-2">
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stations.map((station) => (
              // The service layer returns real Date objects; StationCard is
              // typed against src/types/station.ts's client-facing shape
              // (ISO strings) so it stays reusable from a client fetch too —
              // serialize here to match what GET /api/stations actually
              // sends over the wire.
              <StationCard
                key={station.id}
                station={{
                  ...station,
                  createdAt: station.createdAt.toISOString(),
                  updatedAt: station.updatedAt.toISOString(),
                }}
                favorite={{
                  isLoggedIn: user !== null,
                  isFavorited: favoriteIds?.has(station.id) ?? false,
                }}
              />
            ))}
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} buildHref={buildHref} />
        </>
      )}
    </Container>
  );
}
