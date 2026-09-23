"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { Battery, Locate, MapPin, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SELECTABLE_CONNECTORS } from "@/services/connector-service";
import type { VehicleListItem } from "@/types/vehicle";
import type {
  RecommendationApiResponse,
  RecommendationApiError,
  RecommendedStation,
  RecommendationMeta,
} from "@/types/recommendation";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

const CUSTOM_VEHICLE_ID = "__custom__";

type GeoStatus = "idle" | "locating" | "denied" | "unsupported";

/**
 * The recommendation tool — a client-interactive "find stations near me"
 * form, not a shareable search view, same local-state choice
 * ChargingCalculatorTool.tsx makes for the same reason (docs/
 * architecture.md §4). All filtering/sorting happens server-side in
 * src/services/recommendation-engine.ts; this component only collects
 * input and renders the real result. Range-and-distance model: no
 * rating, no verification status, and no computed score/percentage
 * anywhere here (see docs/recommendation-engine.md for the rewrite).
 */
export function RecommendationTool({ vehicles }: { vehicles: VehicleListItem[] }) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(CUSTOM_VEHICLE_ID);
  const [connectorCode, setConnectorCode] = useState<string>(SELECTABLE_CONNECTORS[0]?.code ?? "");
  const [acInput, setAcInput] = useState("");
  const [dcInput, setDcInput] = useState("");

  const [userPosition, setUserPosition] = useState<{ latitude: number; longitude: number } | null>(
    null
  );
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [rangeKmInput, setRangeKmInput] = useState("10");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [results, setResults] = useState<RecommendedStation[] | null>(null);
  const [meta, setMeta] = useState<RecommendationMeta | null>(null);

  function applyVehiclePreset(id: string) {
    setSelectedVehicleId(id);
    if (id === CUSTOM_VEHICLE_ID) return;
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) return;
    if (vehicle.connectors[0]) setConnectorCode(vehicle.connectors[0].code);
    setAcInput(vehicle.maxAcPowerKw !== null ? String(vehicle.maxAcPowerKw) : "");
    setDcInput(vehicle.maxDcPowerKw !== null ? String(vehicle.maxDcPowerKw) : "");
  }

  const handleUseMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeoStatus("unsupported");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setGeoStatus("idle");
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!userPosition) {
      setErrorMessage("Set your location above, then search — distance can't be measured without it.");
      return;
    }
    const rangeKm = Number(rangeKmInput.trim());
    if (!Number.isFinite(rangeKm) || rangeKm <= 0) {
      setErrorMessage("Enter a search range greater than 0 km.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    if (selectedVehicleId !== CUSTOM_VEHICLE_ID) {
      params.set("vehicleId", selectedVehicleId);
    } else {
      params.set("connector", connectorCode);
      if (acInput.trim()) params.set("maxAcPowerKw", acInput.trim());
      if (dcInput.trim()) params.set("maxDcPowerKw", dcInput.trim());
    }
    params.set("latitude", String(userPosition.latitude));
    params.set("longitude", String(userPosition.longitude));
    params.set("rangeKm", String(rangeKm));

    try {
      const res = await fetch(`/api/recommendations?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json()) as RecommendationApiError;
        throw new Error(body.error?.message ?? "Could not load recommendations.");
      }
      const body = (await res.json()) as RecommendationApiResponse;
      setResults(body.data);
      setMeta(body.meta);
    } catch (error) {
      setResults(null);
      setMeta(null);
      setErrorMessage(error instanceof Error ? error.message : "Could not load recommendations.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your vehicle</h2>

          <label htmlFor="rec-vehicle-preset" className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Pick a reference vehicle, or enter your own
          </label>
          <select
            id="rec-vehicle-preset"
            value={selectedVehicleId}
            onChange={(e) => applyVehiclePreset(e.target.value)}
            className={inputClass}
          >
            <option value={CUSTOM_VEHICLE_ID}>Custom vehicle (enter your own)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.brand} {v.model}
              </option>
            ))}
          </select>

          <div className="mt-4">
            <label htmlFor="rec-connector" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Connector
            </label>
            <select
              id="rec-connector"
              value={connectorCode}
              disabled={selectedVehicleId !== CUSTOM_VEHICLE_ID}
              onChange={(e) => setConnectorCode(e.target.value)}
              className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {SELECTABLE_CONNECTORS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rec-ac" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Max AC power (kW)
              </label>
              <input
                id="rec-ac"
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
              <label htmlFor="rec-dc" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Max DC power (kW)
              </label>
              <input
                id="rec-dc"
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
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Leaving AC/DC power blank still filters by connector compatibility — charging speed just
            won&apos;t be shown for this vehicle.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your location</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Required — stations are found by real distance from here, within the range you set below.
          </p>
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={handleUseMyLocation}>
            <Locate className="h-4 w-4" aria-hidden="true" />
            {geoStatus === "locating"
              ? "Locating…"
              : userPosition
                ? "Location set — use again to refresh"
                : "Use my location"}
          </Button>
          {geoStatus === "denied" && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Location permission was denied — location is required to search by range.
            </p>
          )}
          {geoStatus === "unsupported" && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Your browser doesn&apos;t support location detection.
            </p>
          )}

          <div className="mt-4">
            <label htmlFor="rec-range" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Search Range
            </label>
            <div className="relative mt-1">
              <input
                id="rec-range"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={rangeKmInput}
                onChange={(e) => setRangeKmInput(e.target.value)}
                className={`${inputClass} pr-10`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                km
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              How far you&apos;re willing to travel to charge — e.g. 5, 10, 20, or 100 km.
            </p>
          </div>
        </section>

        <Button type="submit" className="w-full" disabled={isLoading}>
          <Search className="h-4 w-4" aria-hidden="true" />
          {isLoading ? "Finding stations…" : "Find Stations"}
        </Button>
      </div>

      <div>
        {errorMessage && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {errorMessage}
          </p>
        )}

        {!errorMessage && !results && !isLoading && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <MapPin className="h-6 w-6" aria-hidden="true" />
            Set your vehicle, location, and search range above, then find stations near you.
          </div>
        )}

        {meta && (
          <p className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {meta.stationsCompatible} of {meta.stationsConsidered} stations can charge this vehicle
            (right connector, not confirmed unavailable, not confirmed inactive, with a confirmed
            location). {meta.stationsWithinRange} of those are within {meta.rangeKm} km.
          </p>
        )}

        {results && results.length === 0 && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <MapPin className="h-6 w-6" aria-hidden="true" />
            <p>
              No suitable charging stations were found within {meta?.rangeKm ?? rangeKmInput} km.
            </p>
            <p className="text-xs">Try increasing your search range, or a different connector.</p>
          </div>
        )}

        <ol className="space-y-4">
          {results?.map((station, index) => (
            <li key={station.id}>
              <RecommendationResultCard rank={index + 1} station={station} />
            </li>
          ))}
        </ol>
      </div>
    </form>
  );
}

function RecommendationResultCard({ rank, station }: { rank: number; station: RecommendedStation }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {rank}
        </span>
        <div>
          <Link
            href={`/stations/${station.id}`}
            className="font-semibold text-slate-900 hover:underline dark:text-white"
          >
            {station.stationName}
          </Link>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {station.operator?.name ?? "Independent"} · {station.city}, {station.district}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <FactorChip
          icon={<Zap className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Power"
          value={station.power.effectivePowerKw !== null ? `Up to ${station.power.effectivePowerKw} kW` : "Unknown"}
        />
        <FactorChip
          icon={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Distance"
          value={`${station.distanceKm} km`}
        />
        <FactorChip
          icon={<Battery className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Availability"
          value={station.availability === "OPEN" ? "Open" : "Closed"}
          valueClassName={
            station.availability === "OPEN"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-slate-500 dark:text-slate-400"
          }
        />
      </div>
    </div>
  );
}

function FactorChip({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800">
      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <p className={`mt-0.5 font-medium text-slate-900 dark:text-white ${valueClassName ?? ""}`}>{value}</p>
    </div>
  );
}
