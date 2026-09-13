"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Filter, Locate, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MapFilterPanel, EMPTY_MAP_FILTERS, type MapFilters } from "@/components/features/MapFilterPanel";
import { StationPopupContent } from "@/components/features/StationPopupContent";
import type { StationMapMarker, FlyToTarget } from "@/components/map/MapProvider";
import type { ApiListResponse, ApiErrorResponse, StationListItem } from "@/types/station";

// Leaflet touches `window` at import time and cannot be server-rendered —
// loaded client-only. See src/components/map/MapProvider.tsx.
const StationMap = dynamic(
  () => import("@/components/map/MapProvider").then((mod) => mod.StationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        Loading map…
      </div>
    ),
  }
);

// Nepal's approximate geographic centroid — the map's default viewport,
// not a station location, so this isn't the "never invent coordinates"
// rule being broken.
const NEPAL_CENTER: [number, number] = [28.3949, 84.124];
const NEPAL_ZOOM = 7;
const FOUND_ZOOM = 13;

const MAX_PAGE_SIZE = 100;
const MAX_PAGES_TO_FETCH = 20; // safety cap; 460 seeded stations = 5 pages today

function buildQueryParams(filters: MapFilters, page: number): URLSearchParams {
  const params = new URLSearchParams({ page: String(page), pageSize: String(MAX_PAGE_SIZE) });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.province) params.set("province", filters.province);
  if (filters.connector) params.set("connector", filters.connector);
  if (filters.chargingMode) params.set("chargingMode", filters.chargingMode);
  if (filters.status) params.set("status", filters.status);
  return params;
}

async function fetchAllStations(
  filters: MapFilters,
  signal: AbortSignal
): Promise<{ stations: StationListItem[]; total: number }> {
  const firstRes = await fetch(`/api/stations?${buildQueryParams(filters, 1)}`, { signal });
  if (!firstRes.ok) {
    const body = (await firstRes.json()) as ApiErrorResponse;
    throw new Error(body.error?.message ?? "Failed to load stations.");
  }
  const first = (await firstRes.json()) as ApiListResponse<StationListItem>;

  const pagesToFetch = Math.min(first.meta.totalPages, MAX_PAGES_TO_FETCH);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pagesToFetch - 1) }, (_, i) =>
      fetch(`/api/stations?${buildQueryParams(filters, i + 2)}`, { signal }).then((res) =>
        res.json()
      )
    )
  );

  const stations = [
    ...first.data,
    ...(rest as ApiListResponse<StationListItem>[]).flatMap((r) => r.data),
  ];
  return { stations, total: first.meta.total };
}

export function MapExplorer() {
  const [filters, setFilters] = useState<MapFilters>(EMPTY_MAP_FILTERS);
  const [stations, setStations] = useState<StationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // isPending drives the loading indicator — React 19's useTransition tracks
  // this itself rather than a manually-set "loading" state, which keeps the
  // fetch effect free of a synchronous setState-at-effect-start (flagged by
  // this project's react-hooks/set-state-in-effect lint rule).
  const [isPending, startTransition] = useTransition();

  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "denied" | "unsupported">(
    "idle"
  );

  useEffect(() => {
    const controller = new AbortController();

    startTransition(async () => {
      try {
        const { stations: fetched, total: fetchedTotal } = await fetchAllStations(
          filters,
          controller.signal
        );
        if (controller.signal.aborted) return;
        setStations(fetched);
        setTotal(fetchedTotal);
        setErrorMessage(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load stations.");
      }
    });

    return () => controller.abort();
  }, [filters]);

  const stationsWithLocation = useMemo(
    () => stations.filter((s) => s.latitude !== null && s.longitude !== null),
    [stations]
  );

  const markers: StationMapMarker[] = useMemo(
    () =>
      stationsWithLocation.map((station) => ({
        id: station.id,
        position: [station.latitude as number, station.longitude as number],
        popup: <StationPopupContent station={station} />,
      })),
    [stationsWithLocation]
  );

  const handleUseMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeoStatus("unsupported");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        setUserPosition(coords);
        setFlyTo({ position: coords, zoom: FOUND_ZOOM });
        setGeoStatus("idle");
      },
      () => {
        // Permission denied or another geolocation failure — never block
        // the map, just offer the manual fallback below.
        setGeoStatus("denied");
      },
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  }, []);

  const handleResetView = useCallback(() => {
    setFlyTo({ position: NEPAL_CENTER, zoom: NEPAL_ZOOM });
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      {/* Filter panel — sidebar on desktop, collapsible drawer on mobile */}
      <div className="border-b border-slate-200 bg-white p-4 md:hidden dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((open) => !open)}
          className="flex w-full items-center justify-between text-sm font-medium text-slate-900 dark:text-white"
          aria-expanded={mobileFiltersOpen}
          aria-controls="map-filters-mobile"
        >
          <span className="inline-flex items-center gap-2">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filters
          </span>
          {mobileFiltersOpen ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {Object.values(filters).some((v) => v !== "") ? "Active" : "None"}
            </span>
          )}
        </button>
        {mobileFiltersOpen && (
          <div id="map-filters-mobile" className="mt-4">
            <MapFilterPanel filters={filters} onChange={setFilters} />
          </div>
        )}
      </div>

      <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4 md:block dark:border-slate-800 dark:bg-slate-950">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filters
        </h2>
        <MapFilterPanel filters={filters} onChange={setFilters} />
      </aside>

      {/* Map area */}
      <div className="relative flex-1">
        {/* z-[650]: between Leaflet's marker pane (600) and popup pane (700) —
            see MapProvider's Popup `autoPanPadding` — so an open popup always
            paints above this overlay instead of being hidden underneath it. */}
        <div className="absolute inset-x-0 top-0 z-[650] flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur dark:bg-slate-950/95 dark:text-slate-300">
            {isPending && stations.length === 0 && !errorMessage && "Loading stations…"}
            {errorMessage && <span className="text-red-600 dark:text-red-400">{errorMessage}</span>}
            {!errorMessage && (stations.length > 0 || !isPending) && (
              <>
                {isPending && <span className="italic">Updating… </span>}
                <span className="font-medium text-slate-900 dark:text-white">{total}</span>{" "}
                station{total === 1 ? "" : "s"} match your filters ·{" "}
                <span className="font-medium text-slate-900 dark:text-white">
                  {stationsWithLocation.length}
                </span>{" "}
                {stationsWithLocation.length === 1 ? "has" : "have"} a location shown on the map
                {stationsWithLocation.length === 0 && total > 0 && (
                  <>
                    {" "}
                    — no coordinates are on record for these stations yet. As locations are
                    found, they&apos;ll appear here.
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur dark:bg-slate-950/95"
              onClick={handleUseMyLocation}
            >
              <Locate className="h-4 w-4" aria-hidden="true" />
              {geoStatus === "locating" ? "Locating…" : "Use my location"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur dark:bg-slate-950/95"
              onClick={handleResetView}
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Nepal view
            </Button>
          </div>
        </div>

        {(geoStatus === "denied" || geoStatus === "unsupported") && (
          <div className="absolute inset-x-3 top-16 z-[650] rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-sm dark:bg-amber-900/40 dark:text-amber-300">
            {geoStatus === "denied"
              ? "Location permission was denied — you can still browse and zoom the map manually, or use \"Nepal view\" to recenter."
              : "Your browser doesn't support location detection — browse and zoom the map manually instead."}
          </div>
        )}

        <StationMap
          markers={markers}
          center={NEPAL_CENTER}
          zoom={NEPAL_ZOOM}
          userPosition={userPosition}
          flyTo={flyTo}
        />
      </div>
    </div>
  );
}
