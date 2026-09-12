"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { Award, Battery, Gauge, Locate, MapPin, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { CANONICAL_CONNECTORS } from "@/services/connector-service";
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
const SELECTABLE_CONNECTORS = CANONICAL_CONNECTORS.filter((c) => c.code !== "UNKNOWN");

type GeoStatus = "idle" | "locating" | "denied" | "unsupported";

function formatPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * The recommendation tool — a client-interactive "find my best station"
 * form, not a shareable search view, same local-state choice
 * ChargingCalculatorTool.tsx makes for the same reason (docs/
 * architecture.md §4). All ranking happens server-side in
 * src/services/recommendation-engine.ts; this component only collects
 * input and renders the result honestly, including its own gaps.
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

  async function handleSubmit() {
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
    if (userPosition) {
      params.set("latitude", String(userPosition.latitude));
      params.set("longitude", String(userPosition.longitude));
    }

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
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
            Leaving AC/DC power blank still ranks by connector compatibility — charging speed just
            won&apos;t be able to tell stations apart.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your location</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Optional — without it, distance can&apos;t rank results (and today, no seeded station has
            a confirmed location anyway; see the summary once you search).
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
              Location permission was denied — you can still get recommendations, just without
              distance ranking.
            </p>
          )}
          {geoStatus === "unsupported" && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Your browser doesn&apos;t support location detection.
            </p>
          )}
        </section>

        <Button type="button" className="w-full" onClick={handleSubmit} disabled={isLoading}>
          <Zap className="h-4 w-4" aria-hidden="true" />
          {isLoading ? "Finding stations…" : "Find recommended stations"}
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
            <Award className="h-6 w-6" aria-hidden="true" />
            Set your vehicle above and search to see ranked stations.
          </div>
        )}

        {meta && (
          <p className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {meta.stationsEligible} of {meta.stationsConsidered} stations can charge this vehicle
            (right connector, not confirmed unavailable, not confirmed inactive).{" "}
            {meta.stationsWithKnownDistance} have a confirmed location, {meta.stationsWithKnownRating}{" "}
            have at least one review, and {meta.stationsWithKnownAvailability} have known
            real-time-shaped availability — the rest rank on charging compatibility/speed and
            verification status alone, stated honestly rather than guessed.
          </p>
        )}

        {results && results.length === 0 && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No stations in today&apos;s dataset can charge this vehicle right now — try a different
            connector.
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
    </div>
  );
}

function RecommendationResultCard({ rank, station }: { rank: number; station: RecommendedStation }) {
  const { factors } = station;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
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
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatPercent(station.score)}
          </p>
          <VerificationBadge status={station.verificationStatus} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
        <FactorChip
          icon={<Zap className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Power"
          value={
            factors.power.effectivePowerKw !== null
              ? `${factors.power.effectivePowerKw} kW`
              : "Unknown"
          }
        />
        <FactorChip
          icon={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Distance"
          value={factors.distance.distanceKm !== null ? `${factors.distance.distanceKm} km` : "Unknown"}
        />
        <FactorChip
          icon={<Star className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Rating"
          value={factors.rating.count > 0 ? `${factors.rating.average}/5 (${factors.rating.count})` : "No reviews"}
        />
        <FactorChip
          icon={<Award className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Verified"
          value={formatPercent(factors.verification.score)}
        />
        <FactorChip
          icon={<Battery className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Availability"
          value={
            factors.availability.status === "UNKNOWN"
              ? "Unknown"
              : factors.availability.status.charAt(0) + factors.availability.status.slice(1).toLowerCase()
          }
        />
      </div>

      {factors.power.connectors.length > 0 && (
        <p className="mt-3 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
          Best match: {factors.power.connectors.map((c) => c.label).join(", ")} charger
          {factors.power.limitingFactor && (
            <> — limited by the {factors.power.limitingFactor}</>
          )}
        </p>
      )}
    </div>
  );
}

function FactorChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800">
      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 font-medium text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
