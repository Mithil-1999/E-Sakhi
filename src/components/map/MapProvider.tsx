"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { useEffect, type ReactNode } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { getStationIcon, getUserPositionIcon, createClusterIcon } from "@/components/map/markerIcons";

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

export type FlyToTarget = {
  position: [number, number];
  zoom?: number;
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
  className?: string;
};

/** Internal — reacts to the `flyTo` prop by panning the live Leaflet map instance. */
function FlyToController({ target }: { target: FlyToTarget | null | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    map.flyTo(target.position, target.zoom ?? map.getZoom(), { duration: 0.75 });
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
    </MapContainer>
  );
}
