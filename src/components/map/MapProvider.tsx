"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { useEffect, type ReactNode } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import {
  getStationIcon,
  getUserPositionIcon,
  createClusterIcon,
  getMargStartIcon,
  getMargCheckpointIcon,
  getMargDestinationIcon,
} from "@/components/map/markerIcons";

/**
 * E Sakhi's map wrapper — see docs/architecture.md §6. This is the ONLY
 * file in the app that imports `leaflet`/`react-leaflet`/
 * `react-leaflet-cluster` directly. Everything else (the /map page, the
 * station popup content, filters) talks to this component through the
 * plain-data props below, so the tile/map provider could be swapped
 * later without touching feature code.
 *
 * Rendered exclusively via `next/dynamic(..., { ssr: false })` from a
 * Client Component — Leaflet touches `window` at import time and cannot
 * be server-rendered. See the consuming code in
 * src/components/features/MapExplorer.tsx.
 */

const DEFAULT_TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export type StationMapMarker = {
  id: string;
  /** [latitude, longitude] — always real coordinates from the database, never invented. */
  position: [number, number];
  /** Plain React content for the marker's popup — built by the caller, no Leaflet API needed. */
  popup: ReactNode;
};

export type FlyToTarget =
  | { position: [number, number]; zoom?: number; bounds?: undefined }
  /** Fits the whole route/area in view at once (e.g. an E Sakhi Marg journey's full start→destination extent) rather than centering on one point. */
  | { bounds: [[number, number], [number, number]]; position?: undefined; zoom?: undefined };

/**
 * A single stop on an E Sakhi Marg journey — the start, a numbered
 * charging checkpoint, or the destination, each rendered with its own
 * distinct icon (see markerIcons.ts) rather than the standard clustered
 * station marker. Deliberately a separate prop from `markers` (never
 * mixed into the same `MarkerClusterGroup`) since a route's few stops
 * should never cluster together or with unrelated station pins.
 */
export type MargMapMarker = {
  id: string;
  kind: "start" | "checkpoint" | "destination";
  /** 0-based position among checkpoints only — ignored for "start"/"destination". */
  checkpointIndex?: number;
  position: [number, number];
  popup: ReactNode;
};

export type StationMapProps = {
  markers: StationMapMarker[];
  center: [number, number];
  zoom: number;
  onMarkerClick?: (id: string) => void;
  /** The visitor's own location (geolocation feature), rendered as a distinct marker. */
  userPosition?: [number, number] | null;
  /** Set to pan/zoom the map imperatively (e.g. "use my location", "reset view"). */
  flyTo?: FlyToTarget | null;
  /** E Sakhi Marg's start/checkpoint/destination stops — see MargMapMarker. */
  margMarkers?: MargMapMarker[];
  /** E Sakhi Marg's computed driving route, real road-following geometry — never a straight line. */
  margRoute?: [number, number][] | null;
  onMargMarkerClick?: (id: string) => void;
  className?: string;
};

/** Internal — reacts to the `flyTo` prop by panning the live Leaflet map instance. */
function FlyToController({ target }: { target: FlyToTarget | null | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    if (target.bounds) {
      map.flyToBounds(target.bounds, { padding: [40, 40], duration: 0.75 });
    } else {
      map.flyTo(target.position, target.zoom ?? map.getZoom(), { duration: 0.75 });
    }
  }, [target, map]);

  return null;
}

export function StationMap({
  markers,
  center,
  zoom,
  onMarkerClick,
  userPosition,
  flyTo,
  margMarkers,
  margRoute,
  onMargMarkerClick,
  className,
}: StationMapProps) {
  const stationIcon = getStationIcon();

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={className ?? "h-full w-full"}
      scrollWheelZoom
    >
      <TileLayer
        url={DEFAULT_TILE_URL}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      <FlyToController target={flyTo} />

      <MarkerClusterGroup iconCreateFunction={createClusterIcon} maxClusterRadius={50}>
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={marker.position}
            icon={stationIcon}
            eventHandlers={onMarkerClick ? { click: () => onMarkerClick(marker.id) } : undefined}
          >
            {/* Keeps popups from opening underneath the feature UI's
                fixed top overlay (status banner, location buttons) —
                see MapExplorer.tsx's z-[650] comment. */}
            <Popup autoPanPaddingTopLeft={[20, 130]} autoPanPaddingBottomRight={[20, 20]}>
              {marker.popup}
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>

      {userPosition && <Marker position={userPosition} icon={getUserPositionIcon()} />}

      {margRoute && margRoute.length > 1 && (
        <Polyline positions={margRoute} pathOptions={{ color: "#059669", weight: 4, opacity: 0.85 }} />
      )}

      {margMarkers?.map((marker) => (
        <Marker
          key={marker.id}
          position={marker.position}
          icon={
            marker.kind === "start"
              ? getMargStartIcon()
              : marker.kind === "destination"
                ? getMargDestinationIcon()
                : getMargCheckpointIcon(marker.checkpointIndex ?? 0)
          }
          eventHandlers={onMargMarkerClick ? { click: () => onMargMarkerClick(marker.id) } : undefined}
        >
          <Popup autoPanPaddingTopLeft={[20, 130]} autoPanPaddingBottomRight={[20, 20]}>
            {marker.popup}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
