"use client";

import { useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { NEPAL_PROVINCES } from "@/lib/config/nepal-provinces";
import { SELECTABLE_CONNECTORS } from "@/services/connector-service";
import { POWER_BUCKETS } from "@/lib/config/power-buckets";

export type StationFilterValues = {
  search: string;
  province: string;
  connector: string;
  chargingMode: string;
  powerBucket: string;
  vehicleType: string;
  status: string;
  availability: string;
};

const CHARGING_MODES = ["AC", "DC"] as const;
const STATUSES = ["ACTIVE", "INACTIVE"] as const;
const VEHICLE_TYPES = ["CAR", "SCOOTER", "MOTORCYCLE", "OTHER"] as const;
const AVAILABILITIES = ["AVAILABLE", "BUSY", "UNAVAILABLE", "UNKNOWN"] as const;

const VEHICLE_LABELS: Record<(typeof VEHICLE_TYPES)[number], string> = {
  CAR: "Car",
  SCOOTER: "Scooter",
  MOTORCYCLE: "Motorcycle",
  OTHER: "Other",
};

const AVAILABILITY_LABELS: Record<(typeof AVAILABILITIES)[number], string> = {
  AVAILABLE: "Available",
  BUSY: "Busy",
  UNAVAILABLE: "Unavailable",
  UNKNOWN: "Unknown",
};

const DEBOUNCE_MS = 400;

const selectClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

/**
 * URL-driven — every change navigates to a new `?...` query string, which
 * re-renders the Server Component page (src/app/stations/page.tsx) with
 * fresh, server-side-filtered results. No client-side station fetching
 * happens here (contrast with the map's client-fetch approach in Part
 * 05 — this page follows docs/architecture.md §4's "server-side
 * filtering/pagination" rule instead, appropriate for a page whose whole
 * job is a filtered list rather than an interactive viewport).
 *
 * The search input is intentionally uncontrolled (`defaultValue` +
 * `key`) rather than synced from the `currentFilters` prop via an
 * effect — this project's stricter set-state-in-effect lint rule (see
 * docs/architecture.md's Part 05 notes) flags exactly that pattern, and
 * `key`-based reset is the idiomatic alternative anyway.
 */
export function StationFilterPanel({ currentFilters }: { currentFilters: StationFilterValues }) {
  const router = useRouter();
  const pathname = usePathname();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasActiveFilters = Object.values(currentFilters).some((v) => v !== "");

  function navigate(next: Partial<StationFilterValues>) {
    const merged = { ...currentFilters, ...next };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    params.set("page", "1"); // any filter change resets pagination
    router.push(`${pathname}?${params.toString()}`);
  }

  function setImmediate<K extends keyof StationFilterValues>(key: K, value: string) {
    navigate({ [key]: value } as Partial<StationFilterValues>);
  }

  function setDebounced(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate({ search: value }), DEBOUNCE_MS);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <label htmlFor="station-search" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Search
        </label>
        <input
          key={currentFilters.search}
          id="station-search"
          type="text"
          placeholder="Station, city, district, province, or operator..."
          defaultValue={currentFilters.search}
          onChange={(e) => setDebounced(e.target.value)}
          className={selectClass}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="f-province" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Province
          </label>
          <select
            id="f-province"
            value={currentFilters.province}
            onChange={(e) => setImmediate("province", e.target.value)}
            className={selectClass}
          >
            <option value="">All provinces</option>
            {NEPAL_PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-connector" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Connector
          </label>
          <select
            id="f-connector"
            value={currentFilters.connector}
            onChange={(e) => setImmediate("connector", e.target.value)}
            className={selectClass}
          >
            <option value="">All connectors</option>
            {SELECTABLE_CONNECTORS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-mode" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Charging mode
          </label>
          <select
            id="f-mode"
            value={currentFilters.chargingMode}
            onChange={(e) => setImmediate("chargingMode", e.target.value)}
            className={selectClass}
          >
            <option value="">AC or DC</option>
            {CHARGING_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-power" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Power
          </label>
          <select
            id="f-power"
            value={currentFilters.powerBucket}
            onChange={(e) => setImmediate("powerBucket", e.target.value)}
            className={selectClass}
          >
            <option value="">Any power</option>
            {POWER_BUCKETS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-vehicle" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Vehicle
          </label>
          <select
            id="f-vehicle"
            value={currentFilters.vehicleType}
            onChange={(e) => setImmediate("vehicleType", e.target.value)}
            className={selectClass}
          >
            <option value="">Any vehicle</option>
            {VEHICLE_TYPES.map((v) => (
              <option key={v} value={v}>
                {VEHICLE_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-status" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Station status
          </label>
          <select
            id="f-status"
            value={currentFilters.status}
            onChange={(e) => setImmediate("status", e.target.value)}
            className={selectClass}
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "ACTIVE" ? "Active" : "Inactive"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-availability" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Availability
          </label>
          <select
            id="f-availability"
            value={currentFilters.availability}
            onChange={(e) => setImmediate("availability", e.target.value)}
            className={selectClass}
          >
            <option value="">Any availability</option>
            {AVAILABILITIES.map((a) => (
              <option key={a} value={a}>
                {AVAILABILITY_LABELS[a]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            No real-time source is connected yet — nearly every charger is
            &quot;Unknown&quot; today.
          </p>
        </div>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="mt-4 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
