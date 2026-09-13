import L from "leaflet";

/**
 * Custom divIcon-based markers — avoids Leaflet's default marker image
 * assets entirely (a well-known bundler-path gotcha) and matches E Sakhi's
 * brand (see src/components/ui/Logo.tsx: emerald-600 badge + lightning
 * bolt). Internal to the map wrapper — see MapProvider.tsx.
 */

// Lucide's "zap" icon path — same mark used in the site logo.
const ZAP_PATH =
  "M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z";

const EMERALD = "#059669";
const BLUE = "#2563eb";

let stationIcon: L.DivIcon | null = null;

/** The standard station marker — one shared instance, since it never varies. Every station renders identically regardless of CoordinateSource — that distinction is kept in the data/API but deliberately not exposed visually. */
export function getStationIcon(): L.DivIcon {
  stationIcon ??= L.divIcon({
    className: "e-sakhi-marker",
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${EMERALD};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="${ZAP_PATH}"/></svg>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
  return stationIcon;
}

let userIcon: L.DivIcon | null = null;

/** "You are here" marker for the geolocation feature. */
export function getUserPositionIcon(): L.DivIcon {
  userIcon ??= L.divIcon({
    className: "e-sakhi-user-marker",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${BLUE};border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,0.25);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  return userIcon;
}

/** Cluster bubble — count badge in the same brand color as the station marker. */
export function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 100 ? 42 : 48;
  return L.divIcon({
    className: "e-sakhi-cluster",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${EMERALD};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-family:inherit;font-size:${count < 100 ? 13 : 11}px;">
      ${count}
    </div>`,
    iconSize: [size, size],
  });
}
