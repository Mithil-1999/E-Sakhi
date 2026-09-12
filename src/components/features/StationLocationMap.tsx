"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time and cannot be server-rendered —
// same client-only dynamic import used by MapExplorer.tsx (Part 05). This
// reuses the single StationMap wrapper rather than a second Leaflet
// integration — see docs/architecture.md §6.
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

const DETAIL_ZOOM = 16;

/**
 * A single-marker map centered on one station's own location. Only ever
 * rendered by the caller when `latitude`/`longitude` are real, non-null
 * values — see src/app/stations/[id]/page.tsx, which shows an honest
 * "Location unavailable" message instead when they aren't. This component
 * never invents or falls back to a default coordinate.
 */
export function StationLocationMap({
  latitude,
  longitude,
  stationName,
}: {
  latitude: number;
  longitude: number;
  stationName: string;
}) {
  const position: [number, number] = [latitude, longitude];

  return (
    <div className="h-64 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 sm:h-80">
      <StationMap
        markers={[{ id: "station", position, popup: <span className="font-medium">{stationName}</span> }]}
        center={position}
        zoom={DETAIL_ZOOM}
      />
    </div>
  );
}
