"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  Locate,
  MapPin,
  Zap,
  Navigation,
  Search,
  Loader2,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  Route as RouteIcon,
  Info,
  BatteryCharging,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SELECTABLE_CONNECTORS } from "@/services/connector-service";
import type { MargMapMarker, MargRouteLine, FlyToTarget } from "@/components/map/MapProvider";
import type {
  MargRouteOption,
  MargCheckpoint,
  MargPlanResult,
  MargGeocodeApiResponse,
  MargPlanApiResponse,
  MargApiErrorResponse,
} from "@/types/marg";
import type { VehicleListItem } from "@/types/vehicle";

// Leaflet touches `window` at import time and cannot be server-rendered —
// loaded client-only, same pattern as MapExplorer.tsx.
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

const NEPAL_CENTER: [number, number] = [28.3949, 84.124];
const NEPAL_ZOOM = 7;
const CUSTOM_RANGE_ID = "__custom_range__";
const NO_VEHICLE_ID = "";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

type PlacePoint = { label: string; latitude: number; longitude: number };

/** Bounding box around every point on a route's geometry — used to fit that route in view. */
function routeBounds(geometry: [number, number][]): [[number, number], [number, number]] {
  const lats = geometry.map((p) => p[0]);
  const lngs = geometry.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

function formatDuration(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

type GeoStatus = "idle" | "locating" | "denied" | "unsupported";

const LOADING_STEPS = ["Finding routes", "Finding EV charging stations", "Analyzing charging opportunities"] as const;

const AVAILABILITY_LABELS: Record<MargCheckpoint["availability"], string> = {
  AVAILABLE: "Available",
  BUSY: "Busy",
  UNAVAILABLE: "Unavailable",
  UNKNOWN: "Status unavailable",
};

const AVAILABILITY_STYLES: Record<MargCheckpoint["availability"], string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  BUSY: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  UNAVAILABLE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  UNKNOWN: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

/**
 * E Sakhi Marg — the EV journey/route planner. Plans against every real
 * alternative route OSRM offers (up to three — src/services/
 * marg-service.ts), lets the visitor compare them, and shows a real,
 * connector-matched charging plan for whichever one they select. All
 * routing/checkpoint logic is computed server-side via POST /api/marg/
 * plan — this component only collects input (including the optional
 * vehicle/battery fields used for range-aware spacing) and renders the
 * real result, including its own honest gaps (no route found, a route
 * with no compatible station, a route a given battery can't fully cover),
 * never a placeholder pretending to be real data.
 */
export function MargPlanner({ vehicles }: { vehicles: VehicleListItem[] }) {
  const [startQuery, setStartQuery] = useState("");
  const [startResults, setStartResults] = useState<PlacePoint[]>([]);
  const [startPoint, setStartPoint] = useState<PlacePoint | null>(null);
  const [startGeoStatus, setStartGeoStatus] = useState<GeoStatus>("idle");

  const [destQuery, setDestQuery] = useState("");
  const [destResults, setDestResults] = useState<PlacePoint[]>([]);
  const [destPoint, setDestPoint] = useState<PlacePoint | null>(null);

  const [connector, setConnector] = useState(SELECTABLE_CONNECTORS[0]?.code ?? "");
  const [chargingMode, setChargingMode] = useState<"" | "AC" | "DC">("");

  // Optional vehicle & battery — entirely optional; when left unset, E
  // Sakhi Marg plans exactly as it always has (evenly-spaced checkpoints).
  const [vehicleId, setVehicleId] = useState<string>(NO_VEHICLE_ID);
  const [customRangeKm, setCustomRangeKm] = useState("");
  const [batteryPercent, setBatteryPercent] = useState("");

  const [planState, setPlanState] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [loadingStep, setLoadingStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [plan, setPlan] = useState<MargPlanResult | null>(null);
  const [viewedRouteId, setViewedRouteId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);

  const startDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const searchPlaces = useCallback(async (query: string): Promise<PlacePoint[]> => {
    const res = await fetch(`/api/marg/geocode?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const body = (await res.json()) as MargGeocodeApiResponse;
    return body.data;
  }, []);

  function handleStartQueryChange(value: string) {
    setStartQuery(value);
    setStartPoint(null);
    if (startDebounce.current) clearTimeout(startDebounce.current);
    if (value.trim().length < 2) {
      setStartResults([]);
      return;
    }
    startDebounce.current = setTimeout(async () => {
      setStartResults(await searchPlaces(value.trim()));
    }, 400);
  }

  function handleDestQueryChange(value: string) {
    setDestQuery(value);
    setDestPoint(null);
    if (destDebounce.current) clearTimeout(destDebounce.current);
    if (value.trim().length < 2) {
      setDestResults([]);
      return;
    }
    destDebounce.current = setTimeout(async () => {
      setDestResults(await searchPlaces(value.trim()));
    }, 400);
  }

  function pickStart(place: PlacePoint) {
    setStartPoint(place);
    setStartQuery(place.label);
    setStartResults([]);
  }

  function pickDest(place: PlacePoint) {
    setDestPoint(place);
    setDestQuery(place.label);
    setDestResults([]);
  }

  const handleUseMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStartGeoStatus("unsupported");
      return;
    }
    setStartGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: PlacePoint = {
          label: "Current location",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setStartPoint(point);
        setStartQuery(point.label);
        setStartResults([]);
        setStartGeoStatus("idle");
      },
      () => setStartGeoStatus("denied"),
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  }, []);

  // Resolved vehicle range for the currently chosen vehicle/custom entry —
  // null whenever there's nothing real to use (no vehicle picked, a
  // picked vehicle with no range on record, or an empty/invalid custom
  // value). Drives whether the battery % field is usable at all.
  const resolvedRangeKm = useMemo(() => {
    if (vehicleId === CUSTOM_RANGE_ID) {
      const n = Number(customRangeKm);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (vehicleId) {
      const v = vehicles.find((x) => x.id === vehicleId);
      return v?.fullRangeKm ?? null;
    }
    return null;
  }, [vehicleId, customRangeKm, vehicles]);

  const batteryPercentNum = batteryPercent.trim() === "" ? null : Number(batteryPercent);
  const canUseRangeAwarePlanning = resolvedRangeKm !== null;

  const canPlan = startPoint !== null && destPoint !== null && connector !== "";

  async function handlePlan() {
    if (!startPoint || !destPoint) return;

    setPlanState("loading");
    setErrorMessage(null);
    setPlan(null);
    setViewedRouteId(null);
    setSelectedRouteId(null);
    setSelectedCheckpointId(null);
    setLoadingStep(0);

    if (loadingTimer.current) clearInterval(loadingTimer.current);
    loadingTimer.current = setInterval(() => {
      setLoadingStep((step) => Math.min(step + 1, LOADING_STEPS.length - 1));
    }, 700);

    try {
      const res = await fetch("/api/marg/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLabel: startPoint.label,
          startLatitude: startPoint.latitude,
          startLongitude: startPoint.longitude,
          destLabel: destPoint.label,
          destLatitude: destPoint.latitude,
          destLongitude: destPoint.longitude,
          connector,
          chargingMode: chargingMode || undefined,
          vehicleId: vehicleId && vehicleId !== CUSTOM_RANGE_ID ? vehicleId : undefined,
          fullRangeKm: vehicleId === CUSTOM_RANGE_ID && resolvedRangeKm ? resolvedRangeKm : undefined,
          currentBatteryPercent:
            canUseRangeAwarePlanning && batteryPercentNum !== null && Number.isFinite(batteryPercentNum)
              ? batteryPercentNum
              : undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as MargApiErrorResponse;
        throw new Error(body.error?.message ?? "Could not plan this journey.");
      }
      const body = (await res.json()) as MargPlanApiResponse;
      setPlan(body.data);
      setPlanState("success");
      const first = body.data.routes[0];
      if (first) {
        setViewedRouteId(first.id);
        setSelectedRouteId(first.id);
        setFlyTo({ bounds: routeBounds(first.geometry) });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not plan this journey.");
      setPlanState("error");
    } finally {
      if (loadingTimer.current) clearInterval(loadingTimer.current);
    }
  }

  useEffect(() => {
    return () => {
      if (loadingTimer.current) clearInterval(loadingTimer.current);
    };
  }, []);

  function viewRoute(route: MargRouteOption) {
    setViewedRouteId(route.id);
    setSelectedCheckpointId(null);
    setFlyTo({ bounds: routeBounds(route.geometry) });
  }

  function selectRoute(route: MargRouteOption) {
    setViewedRouteId(route.id);
    setSelectedRouteId(route.id);
    setSelectedCheckpointId(null);
    setFlyTo({ bounds: routeBounds(route.geometry) });
  }

  function selectCheckpoint(id: string, position: [number, number]) {
    setSelectedCheckpointId(id);
    setFlyTo({ position, zoom: 12 });
  }

  const viewedRoute = useMemo(
    () => plan?.routes.find((r) => r.id === viewedRouteId) ?? null,
    [plan, viewedRouteId]
  );
  const selectedRoute = useMemo(
    () => plan?.routes.find((r) => r.id === selectedRouteId) ?? null,
    [plan, selectedRouteId]
  );

  const margRouteLines: MargRouteLine[] = useMemo(
    () => (plan?.routes ?? []).map((r) => ({ id: r.id, geometry: r.geometry, selected: r.id === viewedRouteId })),
    [plan, viewedRouteId]
  );

  const margMarkers: MargMapMarker[] = useMemo(() => {
    if (!plan || !viewedRoute) return [];
    const list: MargMapMarker[] = [
      {
        id: "start",
        kind: "start",
        position: [plan.start.latitude, plan.start.longitude],
        popup: <div className="text-sm font-medium">📍 {plan.startLabel}</div>,
      },
    ];
    viewedRoute.checkpoints.forEach((cp, index) => {
      list.push({
        id: cp.stationId,
        kind: "checkpoint",
        checkpointIndex: index,
        position: [cp.latitude, cp.longitude],
        popup: <CheckpointPopup checkpoint={cp} index={index} />,
      });
    });
    list.push({
      id: "destination",
      kind: "destination",
      position: [plan.destination.latitude, plan.destination.longitude],
      popup: <div className="text-sm font-medium">🏁 {plan.destLabel}</div>,
    });
    return list;
  }, [plan, viewedRoute]);

  const mapCenter = plan ? ([plan.start.latitude, plan.start.longitude] as [number, number]) : NEPAL_CENTER;
  const mapZoom = plan ? 8 : NEPAL_ZOOM;

  return (
    <div className="grid grid-cols-1 gap-0 lg:h-[calc(100vh-4rem)] lg:grid-cols-[440px_1fr]">
      {/* Map — first in DOM on mobile, second on desktop */}
      <div className="order-first h-[45vh] lg:order-none lg:h-full">
        <StationMap
          markers={[]}
          margMarkers={margMarkers}
          margRoutes={margRouteLines}
          center={mapCenter}
          zoom={mapZoom}
          flyTo={flyTo}
          onMargMarkerClick={(id) => {
            const marker = margMarkers.find((m) => m.id === id);
            if (marker) selectCheckpoint(id, marker.position);
          }}
        />
      </div>

      {/* Journey panel */}
      <div className="order-last overflow-y-auto border-t border-slate-200 bg-white p-5 lg:order-none lg:border-r lg:border-t-0 dark:border-slate-800 dark:bg-slate-950">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <Navigation className="h-6 w-6 text-emerald-600" aria-hidden="true" />
          E Sakhi Marg
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Tell us where you&apos;re going, and E Sakhi finds route options with charging checkpoints along the way.
        </p>

        {planState !== "success" && (
          <div className="mt-6 space-y-4">
            <PlaceField
              id="marg-start"
              label="Starting Point"
              placeholder="Enter starting point"
              example="e.g. Kathmandu"
              query={startQuery}
              results={startResults}
              onChange={handleStartQueryChange}
              onPick={pickStart}
              picked={startPoint}
              extra={
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  <Locate className="h-3.5 w-3.5" aria-hidden="true" />
                  {startGeoStatus === "locating" ? "Locating…" : "Use my current location"}
                </button>
              }
            />
            {startGeoStatus === "denied" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Location permission was denied — search for your starting point instead.
              </p>
            )}
            {startGeoStatus === "unsupported" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Your browser doesn&apos;t support location detection — search for your starting point instead.
              </p>
            )}

            <PlaceField
              id="marg-dest"
              label="Destination"
              placeholder="Where do you want to go?"
              example="e.g. Pokhara"
              query={destQuery}
              results={destResults}
              onChange={handleDestQueryChange}
              onPick={pickDest}
              picked={destPoint}
            />

            <div>
              <label htmlFor="marg-connector" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Connector Type
              </label>
              <select
                id="marg-connector"
                value={connector}
                onChange={(e) => setConnector(e.target.value)}
                className={inputClass}
              >
                {SELECTABLE_CONNECTORS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="marg-mode" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Charging Mode
              </label>
              <select
                id="marg-mode"
                value={chargingMode}
                onChange={(e) => setChargingMode(e.target.value as "" | "AC" | "DC")}
                className={inputClass}
              >
                <option value="">Both (AC or DC)</option>
                <option value="AC">AC Charging</option>
                <option value="DC">DC Fast Charging</option>
              </select>
            </div>

            <VehicleBatteryFields
              vehicles={vehicles}
              vehicleId={vehicleId}
              onVehicleChange={setVehicleId}
              customRangeKm={customRangeKm}
              onCustomRangeChange={setCustomRangeKm}
              batteryPercent={batteryPercent}
              onBatteryChange={setBatteryPercent}
              resolvedRangeKm={resolvedRangeKm}
            />

            <Button
              type="button"
              className="w-full"
              disabled={!canPlan || planState === "loading"}
              onClick={handlePlan}
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              Plan E Sakhi Marg
            </Button>

            {planState === "idle" && (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Plan Your E Sakhi Marg — enter your starting point and destination to see route
                options with EV charging checkpoints along the way.
              </div>
            )}

            {planState === "loading" && <LoadingChecklist step={loadingStep} />}

            {planState === "error" && errorMessage && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        )}

        {planState === "success" && plan && (
          <MargResult
            plan={plan}
            viewedRouteId={viewedRouteId}
            selectedRoute={selectedRoute}
            batteryPercentLabel={canUseRangeAwarePlanning && batteryPercentNum !== null ? batteryPercent : null}
            onViewRoute={viewRoute}
            onSelectRoute={selectRoute}
            selectedCheckpointId={selectedCheckpointId}
            onSelectCheckpoint={selectCheckpoint}
            onPlanAnother={() => {
              setPlanState("idle");
              setPlan(null);
              setViewedRouteId(null);
              setSelectedRouteId(null);
              setSelectedCheckpointId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlaceField({
  id,
  label,
  placeholder,
  example,
  query,
  results,
  onChange,
  onPick,
  picked,
  extra,
}: {
  id: string;
  label: string;
  placeholder: string;
  example: string;
  query: string;
  results: PlacePoint[];
  onChange: (value: string) => void;
  onPick: (place: PlacePoint) => void;
  picked: PlacePoint | null;
  extra?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          id={id}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} pl-9 ${picked ? "border-emerald-400" : ""}`}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{example}</p>
      {extra}
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {results.map((place, i) => (
            <li key={`${place.label}-${i}`}>
              <button
                type="button"
                onClick={() => onPick(place)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Entirely optional — reuses the same "pick a reference vehicle, or enter
 * your own" pattern already used by ChargingCalculatorTool/
 * RecommendationTool, trimmed down to just what range-aware checkpoint
 * spacing needs (a full-charge range + a current battery level). Never
 * required to plan a journey; leaving it alone reproduces E Sakhi Marg's
 * original fixed-spacing behavior exactly.
 */
function VehicleBatteryFields({
  vehicles,
  vehicleId,
  onVehicleChange,
  customRangeKm,
  onCustomRangeChange,
  batteryPercent,
  onBatteryChange,
  resolvedRangeKm,
}: {
  vehicles: VehicleListItem[];
  vehicleId: string;
  onVehicleChange: (id: string) => void;
  customRangeKm: string;
  onCustomRangeChange: (v: string) => void;
  batteryPercent: string;
  onBatteryChange: (v: string) => void;
  resolvedRangeKm: number | null;
}) {
  const pickedVehicle = vehicles.find((v) => v.id === vehicleId);
  const rangeUnknownForPickedVehicle = Boolean(vehicleId) && vehicleId !== CUSTOM_RANGE_ID && !pickedVehicle?.fullRangeKm;

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
        <BatteryCharging className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        Vehicle &amp; Battery <span className="font-normal text-slate-400">(optional)</span>
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Add your vehicle&apos;s range and current battery level to space charging stops around what
        your battery can actually reach. Leave this blank for the standard journey plan.
      </p>

      <label htmlFor="marg-vehicle" className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">
        Vehicle
      </label>
      <select
        id="marg-vehicle"
        value={vehicleId}
        onChange={(e) => onVehicleChange(e.target.value)}
        className={inputClass}
      >
        <option value={NO_VEHICLE_ID}>No vehicle — standard journey plan</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.brand} {v.model}
            {v.fullRangeKm ? ` — ${v.fullRangeKm} km range` : " — range not on record"}
          </option>
        ))}
        <option value={CUSTOM_RANGE_ID}>Custom — enter a full-charge range</option>
      </select>

      {rangeUnknownForPickedVehicle && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          This vehicle&apos;s range isn&apos;t on record — showing the standard journey plan.
        </p>
      )}

      {vehicleId === CUSTOM_RANGE_ID && (
        <div className="mt-3">
          <label htmlFor="marg-custom-range" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Full-charge range (km)
          </label>
          <input
            id="marg-custom-range"
            type="number"
            min={1}
            value={customRangeKm}
            onChange={(e) => onCustomRangeChange(e.target.value)}
            placeholder="e.g. 400"
            className={inputClass}
          />
        </div>
      )}

      {resolvedRangeKm !== null && (
        <div className="mt-3">
          <label htmlFor="marg-battery" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Current battery (%)
          </label>
          <input
            id="marg-battery"
            type="number"
            min={0}
            max={100}
            value={batteryPercent}
            onChange={(e) => onBatteryChange(e.target.value)}
            placeholder="e.g. 65"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Estimated range right now: {batteryPercent.trim() !== "" && Number.isFinite(Number(batteryPercent))
              ? `${Math.round((resolvedRangeKm * Number(batteryPercent)) / 100)} km`
              : "enter a battery level"}
          </p>
        </div>
      )}
    </div>
  );
}

function LoadingChecklist({ step }: { step: number }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" aria-hidden="true" />
        Finding your E Sakhi Marg…
      </p>
      <ul className="space-y-2">
        {LOADING_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2 text-sm">
            {i < step ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : i === step ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-700" aria-hidden="true" />
            )}
            <span className={i <= step ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-600"}>
              {label}…
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckpointPopup({ checkpoint, index }: { checkpoint: MargCheckpoint; index: number }) {
  return (
    <div className="min-w-[180px] text-sm">
      <p className="font-semibold text-slate-900">
        ⚡ Checkpoint {index + 1} — {checkpoint.stationName}
      </p>
      <p className="text-slate-600">{checkpoint.city}, {checkpoint.district}</p>
      <p className="mt-1 text-xs text-slate-500">{checkpoint.distanceFromPreviousKm} km from previous point</p>
    </div>
  );
}

function MargResult({
  plan,
  viewedRouteId,
  selectedRoute,
  batteryPercentLabel,
  onViewRoute,
  onSelectRoute,
  selectedCheckpointId,
  onSelectCheckpoint,
  onPlanAnother,
}: {
  plan: MargPlanResult;
  viewedRouteId: string | null;
  selectedRoute: MargRouteOption | null;
  batteryPercentLabel: string | null;
  onViewRoute: (route: MargRouteOption) => void;
  onSelectRoute: (route: MargRouteOption) => void;
  selectedCheckpointId: string | null;
  onSelectCheckpoint: (id: string, position: [number, number]) => void;
  onPlanAnother: () => void;
}) {
  const connectorLabel = SELECTABLE_CONNECTORS.find((c) => c.code === plan.connector)?.label ?? plan.connector;
  const modeLabel = plan.chargingMode === "AC" ? "AC Charging" : plan.chargingMode === "DC" ? "DC Fast Charging" : "AC or DC";

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Your E Sakhi Marg</h2>
        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
          {plan.startLabel} → {plan.destLabel}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Route Options</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">{plan.routes.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Connector</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">{connectorLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Charging Mode</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">{modeLabel}</dd>
          </div>
          {plan.rangeAware && (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Battery-aware planning</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">On</dd>
            </div>
          )}
        </dl>
        {plan.routes.length === 1 && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Only one route was found between these locations.
          </p>
        )}
        <button
          type="button"
          onClick={onPlanAnother}
          className="mt-3 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Plan another journey
        </button>
      </div>

      {/* Route comparison cards */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Route Options</h3>
        <div className="space-y-3">
          {plan.routes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              connectorLabel={connectorLabel}
              viewed={route.id === viewedRouteId}
              selected={route.id === selectedRoute?.id}
              onView={() => onViewRoute(route)}
              onSelect={() => onSelectRoute(route)}
            />
          ))}
        </div>
      </div>

      {/* Selected route's detail: timeline + charging plan + checkpoint cards */}
      {selectedRoute && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">
              Charging Plan — Route {selectedRoute.ordinal}
            </h3>
            {batteryPercentLabel !== null && (
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                Starting battery: {batteryPercentLabel}%. Each stop below assumes a full charge before
                continuing — E Sakhi Marg doesn&apos;t know how long you&apos;ll actually charge for.
              </p>
            )}
            {selectedRoute.rangeWarning && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{selectedRoute.rangeWarning}</span>
              </div>
            )}
            {!selectedRoute.hasCompatibleStations && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>No compatible EV charging station was found along this route for the selected connector type. The route is shown below regardless.</span>
              </div>
            )}
            {selectedRoute.hasCompatibleStations && selectedRoute.checkpoints.length === 0 && (
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                This journey is short enough that no charging stop was needed — E Sakhi still shows
                the complete route below.
              </p>
            )}
            <ol className="relative space-y-0 border-l-2 border-slate-200 pl-5 dark:border-slate-800">
              <TimelineNode
                icon="📍"
                title="START"
                subtitle={batteryPercentLabel !== null ? `${plan.startLabel} — Battery: ${batteryPercentLabel}%` : plan.startLabel}
              />
              {selectedRoute.checkpoints.map((cp, index) => (
                <TimelineSegment key={cp.stationId} distanceKm={cp.distanceFromPreviousKm}>
                  <TimelineNode
                    icon="⚡"
                    title={`CHARGING STOP ${index + 1}`}
                    subtitle={cp.stationName}
                    selected={selectedCheckpointId === cp.stationId}
                    onClick={() => onSelectCheckpoint(cp.stationId, [cp.latitude, cp.longitude])}
                  />
                </TimelineSegment>
              ))}
              <TimelineSegment distanceKm={selectedRoute.finalLegKm}>
                <TimelineNode icon="🏁" title="DESTINATION" subtitle={plan.destLabel} isLast />
              </TimelineSegment>
            </ol>
          </div>

          {selectedRoute.checkpoints.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                Route {selectedRoute.ordinal} Charging Stations
              </h3>
              <div className="space-y-3">
                {selectedRoute.checkpoints.map((cp, index) => (
                  <CheckpointCard
                    key={cp.stationId}
                    checkpoint={cp}
                    index={index}
                    selected={selectedCheckpointId === cp.stationId}
                    onClick={() => onSelectCheckpoint(cp.stationId, [cp.latitude, cp.longitude])}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RouteCard({
  route,
  connectorLabel,
  viewed,
  selected,
  onView,
  onSelect,
}: {
  route: MargRouteOption;
  connectorLabel: string;
  viewed: boolean;
  selected: boolean;
  onView: () => void;
  onSelect: () => void;
}) {
  const dcAvailable = route.checkpoints.some((cp) => cp.chargingModes.includes("DC"));
  const acAvailable = route.checkpoints.some((cp) => cp.chargingModes.includes("AC"));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onView();
      }}
      className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-colors ${
        viewed
          ? "border-emerald-400 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20"
          : "border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span className="font-semibold text-slate-900 dark:text-white">Route {route.ordinal}</span>
          {route.isFastest && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              Fastest
            </span>
          )}
          {selected && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Selected Route
            </span>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">{route.pathSummary.join(" → ")}</p>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <RouteIcon className="h-3.5 w-3.5" aria-hidden="true" /> {route.totalDistanceKm} km
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {formatDuration(route.durationMin)}
        </span>
        <span className="flex items-center gap-1">
          <Zap className="h-3.5 w-3.5" aria-hidden="true" /> {route.checkpoints.length} charging stop
          {route.checkpoints.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-2">
        {route.hasCompatibleStations ? (
          <ul className="space-y-1 text-xs text-emerald-700 dark:text-emerald-400">
            <li>✓ {route.checkpoints.length} compatible station{route.checkpoints.length === 1 ? "" : "s"} found</li>
            <li>✓ {connectorLabel}</li>
            {dcAvailable && <li>✓ DC charging available</li>}
            {acAvailable && <li>✓ AC charging available</li>}
          </ul>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No compatible EV charging station found along this route.
          </p>
        )}
        {route.rangeWarning && (
          <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Battery range may not cover this whole route.
          </p>
        )}
      </div>

      <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onView}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          View Route
        </button>
        <button
          type="button"
          onClick={onSelect}
          className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${
            selected ? "bg-emerald-700" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {selected ? "Selected" : "Select Route"}
        </button>
      </div>
    </div>
  );
}

function TimelineSegment({ distanceKm, children }: { distanceKm: number; children: ReactNode }) {
  return (
    <li className="relative pb-6 pt-3">
      <span className="absolute -left-[27px] top-0 -translate-y-1/2 rounded-full bg-white px-1.5 text-[11px] font-medium text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        {distanceKm} km
      </span>
      {children}
    </li>
  );
}

function TimelineNode({
  icon,
  title,
  subtitle,
  selected,
  isLast,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  selected?: boolean;
  isLast?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <div
      className={`-ml-[27px] flex items-center gap-2 rounded-lg px-2 py-1.5 ${
        selected ? "bg-emerald-50 dark:bg-emerald-950/40" : ""
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-sm shadow dark:border-slate-950 dark:bg-slate-800">
        {icon}
      </span>
      <span>
        <span className="block text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </span>
        <span className="block text-sm font-medium text-slate-900 dark:text-white">{subtitle}</span>
      </span>
    </div>
  );

  if (!onClick) return isLast ? content : content;

  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {content}
    </button>
  );
}

function CheckpointCard({
  checkpoint,
  index,
  selected,
  onClick,
}: {
  checkpoint: MargCheckpoint;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-xl border p-4 text-left transition-colors ${
        selected
          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
          : "border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-slate-900 dark:text-white">
          ⚡ Checkpoint {index + 1} — {checkpoint.stationName}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${AVAILABILITY_STYLES[checkpoint.availability]}`}>
          {AVAILABILITY_LABELS[checkpoint.availability]}
        </span>
      </div>
      <dl className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {checkpoint.city}, {checkpoint.district}
        </div>
        <div>📏 Distance from previous point: {checkpoint.distanceFromPreviousKm} km</div>
        {checkpoint.detourKm > 0.5 && <div>↪️ Route detour: +{checkpoint.detourKm} km</div>}
        <div>
          🔌 Connector: {checkpoint.connectors.map((c) => c.label).join(", ") || "Not on record"}
        </div>
        <div>⚡ Charging Mode: {checkpoint.chargingModes.join(", ") || "Not on record"}</div>
        <div>⚡ Charging Power: {checkpoint.powerKwMax !== null ? `${checkpoint.powerKwMax} kW` : "Not on record"}</div>
      </dl>
    </button>
  );
}
