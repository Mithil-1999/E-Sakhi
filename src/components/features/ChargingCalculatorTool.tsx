"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Locate, MapPin, Search, X, Zap } from "lucide-react";
import {
  calculateChargingEstimate,
  CHARGING_ESTIMATE_CAVEAT,
  type ChargingMode,
} from "@/services/charging-calculator";
import { Button } from "@/components/ui/Button";
import type { VehicleListItem } from "@/types/vehicle";
import type { ApiListResponse, ApiErrorResponse, StationListItem, NearbyStationItem } from "@/types/station";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

const CUSTOM_VEHICLE_ID = "__custom__";

const CHARGER_MODE_LABELS: Record<ChargingMode, string> = {
  DC: "DC (fast charging)",
  AC: "AC (standard charging)",
  UNKNOWN: "Not sure / unknown",
};

type StationChargerOption = {
  id: string;
  chargingMode: ChargingMode;
  powerKw: number | null;
  connectors: { code: string; label: string }[];
};

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return "less than a minute";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

function connectorText(connectors: { label: string }[]): string {
  return connectors.length > 0 ? connectors.map((c) => c.label).join(", ") : "Connector unknown";
}

/**
 * The charging calculator — a client-interactive tool, not a shareable
 * search view (no URL-driven state, per docs/architecture.md §4's "only
 * reach for local state when the surface has a good independent reason to
 * be client-rendered" guidance). All charging math is delegated to
 * src/services/charging-calculator.ts; this component only collects
 * input and renders the result.
 */
export function ChargingCalculatorTool({ vehicles }: { vehicles: VehicleListItem[] }) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(CUSTOM_VEHICLE_ID);
  const [batteryInput, setBatteryInput] = useState("");
  const [acInput, setAcInput] = useState("");
  const [dcInput, setDcInput] = useState("");
  const [fullRangeInput, setFullRangeInput] = useState("");
  const [currentPercent, setCurrentPercent] = useState("20");
  const [targetPercent, setTargetPercent] = useState("80");

  const [chargerMode, setChargerMode] = useState<ChargingMode>("DC");
  const [chargerPowerInput, setChargerPowerInput] = useState("");

  // "Sourced from a real station" state — set only via the search below;
  // cleared by "Use manual entry instead" (never fake-populated).
  const [sourcedStationName, setSourcedStationName] = useState<string | null>(null);

  const [stationQuery, setStationQuery] = useState("");
  const [stationResults, setStationResults] = useState<StationListItem[]>([]);
  const [stationSearchError, setStationSearchError] = useState<string | null>(null);
  const [loadingChargersFor, setLoadingChargersFor] = useState<string | null>(null);
  const [stationChargers, setStationChargers] = useState<StationChargerOption[] | null>(null);
  const [stationChargersOf, setStationChargersOf] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nearest-station finder — same geolocation pattern as
  // RecommendationTool.tsx, but a simple distance-only lookup
  // (GET /api/stations/nearby) rather than full vehicle-aware ranking.
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "denied" | "unsupported">("idle");
  const [nearbyStations, setNearbyStations] = useState<NearbyStationItem[] | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  function applyVehiclePreset(id: string) {
    setSelectedVehicleId(id);
    if (id === CUSTOM_VEHICLE_ID) return;
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) return;
    setBatteryInput(String(vehicle.batteryCapacityKwh));
    setAcInput(vehicle.maxAcPowerKw !== null ? String(vehicle.maxAcPowerKw) : "");
    setDcInput(vehicle.maxDcPowerKw !== null ? String(vehicle.maxDcPowerKw) : "");
    setFullRangeInput(vehicle.fullRangeKm !== null ? String(vehicle.fullRangeKm) : "");
  }

  const handleFindNearby = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeoStatus("unsupported");
      return;
    }
    setGeoStatus("locating");
    setNearbyError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setGeoStatus("idle");
        try {
          const params = new URLSearchParams({
            latitude: String(position.coords.latitude),
            longitude: String(position.coords.longitude),
            limit: "5",
          });
          const res = await fetch(`/api/stations/nearby?${params.toString()}`);
          if (!res.ok) {
            const body = (await res.json()) as ApiErrorResponse;
            throw new Error(body.error?.message ?? "Could not find nearby stations.");
          }
          const body = (await res.json()) as { data: NearbyStationItem[] };
          setNearbyStations(body.data);
        } catch (error) {
          setNearbyStations(null);
          setNearbyError(error instanceof Error ? error.message : "Could not find nearby stations.");
        }
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  }, []);

  // Debounced, event-driven (never inside a useEffect) real-station search —
  // reuses GET /api/stations, same endpoint as /stations and /map.
  function handleStationQueryChange(value: string) {
    setStationQuery(value);
    setStationSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setStationResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stations?search=${encodeURIComponent(value.trim())}&pageSize=5`);
        if (!res.ok) {
          const body = (await res.json()) as ApiErrorResponse;
          throw new Error(body.error?.message ?? "Search failed.");
        }
        const body = (await res.json()) as ApiListResponse<StationListItem>;
        setStationResults(body.data);
      } catch (error) {
        setStationResults([]);
        setStationSearchError(error instanceof Error ? error.message : "Search failed.");
      }
    }, 350);
  }

  async function handlePickStation(station: StationListItem) {
    setStationQuery("");
    setStationResults([]);
    setLoadingChargersFor(station.id);
    setStationChargers(null);
    setStationChargersOf(station.stationName);
    try {
      const res = await fetch(`/api/stations/${station.id}`);
      if (!res.ok) throw new Error("Could not load this station's chargers.");
      const body = (await res.json()) as { data: { chargers: StationChargerOption[] } };
      setStationChargers(body.data.chargers);
    } catch {
      setStationChargers([]);
    } finally {
      setLoadingChargersFor(null);
    }
  }

  function handlePickCharger(charger: StationChargerOption, stationName: string) {
    setChargerMode(charger.chargingMode);
    setChargerPowerInput(charger.powerKw !== null ? String(charger.powerKw) : "");
    setSourcedStationName(`${stationName} — ${connectorText(charger.connectors)}`);
    setStationChargers(null);
    setStationChargersOf(null);
  }

  function handleUseManualCharger() {
    setSourcedStationName(null);
    setStationChargers(null);
    setStationChargersOf(null);
  }

  const result = useMemo(() => {
    return calculateChargingEstimate({
      vehicle: {
        batteryCapacityKwh: Number(batteryInput.trim()),
        maxAcPowerKw: parseOptionalNumber(acInput),
        maxDcPowerKw: parseOptionalNumber(dcInput),
        fullRangeKm: parseOptionalNumber(fullRangeInput),
      },
      charger: {
        chargingMode: chargerMode,
        powerKw: parseOptionalNumber(chargerPowerInput),
      },
      currentPercent: Number(currentPercent.trim()),
      targetPercent: Number(targetPercent.trim()),
    });
  }, [
    batteryInput,
    acInput,
    dcInput,
    fullRangeInput,
    chargerMode,
    chargerPowerInput,
    currentPercent,
    targetPercent,
  ]);

  const errorFor = (field: string) =>
    !result.ok ? result.errors.find((e) => e.field === field)?.message : undefined;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        {/* Vehicle */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your vehicle</h2>

          <label htmlFor="vehicle-preset" className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Pick a reference vehicle, or enter your own specs
          </label>
          <select
            id="vehicle-preset"
            value={selectedVehicleId}
            onChange={(e) => applyVehiclePreset(e.target.value)}
            className={inputClass}
          >
            <option value={CUSTOM_VEHICLE_ID}>Custom vehicle (enter your own specs)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.brand} {v.model} — {v.batteryCapacityKwh} kWh
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Reference specs from public manufacturer data — actual figures can vary by trim/year.
            Only cars are catalogued today; for a scooter, motorcycle, or any other car, use
            &quot;Custom vehicle&quot; and enter its real specs below.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="battery-kwh" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Battery capacity (kWh)
              </label>
              <input
                id="battery-kwh"
                type="number"
                min="0"
                step="0.1"
                value={batteryInput}
                onChange={(e) => {
                  setSelectedVehicleId(CUSTOM_VEHICLE_ID);
                  setBatteryInput(e.target.value);
                }}
                className={inputClass}
                placeholder="e.g. 40.5"
              />
              {errorFor("batteryCapacityKwh") && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errorFor("batteryCapacityKwh")}</p>
              )}
            </div>
            <div>
              <label htmlFor="max-ac" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Max AC power (kW)
              </label>
              <input
                id="max-ac"
                type="number"
                min="0"
                step="0.1"
                value={acInput}
                onChange={(e) => {
                  setSelectedVehicleId(CUSTOM_VEHICLE_ID);
                  setAcInput(e.target.value);
                }}
                className={inputClass}
                placeholder="Unknown"
              />
            </div>
            <div>
              <label htmlFor="max-dc" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Max DC power (kW)
              </label>
              <input
                id="max-dc"
                type="number"
                min="0"
                step="0.1"
                value={dcInput}
                onChange={(e) => {
                  setSelectedVehicleId(CUSTOM_VEHICLE_ID);
                  setDcInput(e.target.value);
                }}
                className={inputClass}
                placeholder="Unknown"
              />
            </div>
            <div>
              <label htmlFor="full-range" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Full range (km)
              </label>
              <input
                id="full-range"
                type="number"
                min="0"
                step="1"
                value={fullRangeInput}
                onChange={(e) => {
                  setSelectedVehicleId(CUSTOM_VEHICLE_ID);
                  setFullRangeInput(e.target.value);
                }}
                className={inputClass}
                placeholder="Unknown"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Optional — manufacturer-published full-charge range. Adds a km estimate below.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="current-pct" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Current battery %
              </label>
              <input
                id="current-pct"
                type="number"
                min="0"
                max="100"
                value={currentPercent}
                onChange={(e) => setCurrentPercent(e.target.value)}
                className={inputClass}
              />
              {errorFor("currentPercent") && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errorFor("currentPercent")}</p>
              )}
            </div>
            <div>
              <label htmlFor="target-pct" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Target battery %
              </label>
              <input
                id="target-pct"
                type="number"
                min="0"
                max="100"
                value={targetPercent}
                onChange={(e) => setTargetPercent(e.target.value)}
                className={inputClass}
              />
              {errorFor("targetPercent") && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errorFor("targetPercent")}</p>
              )}
            </div>
          </div>
        </section>

        {/* Charger */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Charger</h2>

          {sourcedStationName ? (
            <div className="mt-3 flex items-start justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              <span>
                Using a real charger from <span className="font-medium">{sourcedStationName}</span>.
              </span>
              <button
                type="button"
                onClick={handleUseManualCharger}
                className="shrink-0 text-xs font-medium underline"
              >
                Use manual entry instead
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <label htmlFor="station-search" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Search a real station to use its charger, or enter manually below
              </label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="station-search"
                  type="text"
                  value={stationQuery}
                  onChange={(e) => handleStationQueryChange(e.target.value)}
                  placeholder="Station, city, or operator..."
                  className={`${inputClass} pl-9`}
                />
              </div>
              {stationSearchError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{stationSearchError}</p>
              )}
              {stationResults.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {stationResults.map((station) => (
                    <li key={station.id}>
                      <button
                        type="button"
                        onClick={() => handlePickStation(station)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="font-medium text-slate-900 dark:text-white">{station.stationName}</span>
                        <span className="ml-1 text-slate-500 dark:text-slate-400">
                          — {station.city}, {station.district}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {stationChargersOf && (
                <div className="mt-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      Chargers at {stationChargersOf}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setStationChargers(null);
                        setStationChargersOf(null);
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  {loadingChargersFor && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Loading chargers…</p>
                  )}
                  {!loadingChargersFor && stationChargers?.length === 0 && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No chargers on record for this station.
                    </p>
                  )}
                  {!loadingChargersFor && stationChargers && stationChargers.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {stationChargers.map((charger) => (
                        <li key={charger.id}>
                          <button
                            type="button"
                            onClick={() => handlePickCharger(charger, stationChargersOf)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-left text-xs hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-900/20"
                          >
                            <span>{connectorText(charger.connectors)}</span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {charger.chargingMode} ·{" "}
                              {charger.powerKw !== null ? `${charger.powerKw} kW` : "Power unknown"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="charger-mode" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Charging mode
              </label>
              <select
                id="charger-mode"
                value={chargerMode}
                disabled={!!sourcedStationName}
                onChange={(e) => setChargerMode(e.target.value as ChargingMode)}
                className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {(Object.keys(CHARGER_MODE_LABELS) as ChargingMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {CHARGER_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="charger-power" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Charger power (kW)
              </label>
              <input
                id="charger-power"
                type="number"
                min="0"
                step="0.1"
                value={chargerPowerInput}
                disabled={!!sourcedStationName}
                onChange={(e) => setChargerPowerInput(e.target.value)}
                className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                placeholder="Unknown"
              />
            </div>
          </div>
        </section>

        {/* Nearest station */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Nearest station</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Find the closest stations to your current location — straight-line distance, using
            stations with a confirmed map location only.
          </p>
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={handleFindNearby}>
            <Locate className="h-4 w-4" aria-hidden="true" />
            {geoStatus === "locating" ? "Locating…" : "Find stations near me"}
          </Button>
          {geoStatus === "denied" && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Location permission was denied — allow location access to use this.
            </p>
          )}
          {geoStatus === "unsupported" && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Your browser doesn&apos;t support location detection.
            </p>
          )}
          {nearbyError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{nearbyError}</p>
          )}
          {nearbyStations && nearbyStations.length === 0 && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              No station with a confirmed location was found.
            </p>
          )}
          {nearbyStations && nearbyStations.length > 0 && (
            <ul className="mt-3 space-y-2">
              {nearbyStations.map((station) => (
                <li key={station.id}>
                  <a
                    href={`/stations/${station.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-900/20"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                      <span className="truncate">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {station.stationName}
                        </span>
                        <span className="ml-1 text-slate-500 dark:text-slate-400">
                          — {station.city}, {station.district}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-400">
                      {station.distanceKm} km
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Result */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Zap className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Estimate
          </h2>

          {!result.ok ? (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Fix the highlighted field{result.errors.length === 1 ? "" : "s"} above to see an estimate.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Energy required</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {result.data.energyRequiredKwh} kWh
                </p>
              </div>

              {result.data.range ? (
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Estimated range</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">
                        {result.data.range.currentRangeKm} km
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Now</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        +{result.data.range.rangeAddedKm} km
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Added</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">
                        {result.data.range.targetRangeKm} km
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">At target</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Based on this vehicle&apos;s manufacturer-published full-charge range — real range
                    varies with driving style, terrain, and climate control use.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Add this vehicle&apos;s full-charge range (km) above to also see a km estimate.
                </p>
              )}

              {result.data.note ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  {result.data.note}
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Estimated charging time</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {formatMinutes(result.data.estimatedMinutes as number)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Effective charging power</p>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {result.data.effectivePowerKw} kW
                      <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                        (limited by the {result.data.limitingFactor === "vehicle" ? "vehicle" : "charger"})
                      </span>
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{CHARGING_ESTIMATE_CAVEAT}</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
