/**
 * Charging time/energy calculator — pure math, no database access. Kept in
 * `src/services/*` per docs/architecture.md §2 ("React components render
 * and collect input... business logic lives in src/services/"), even
 * though the calculator page (Part 08) calls this directly from a Client
 * Component rather than through a Route Handler — it has no session/DB
 * dependency, so unlike station-service.ts etc. it does not need (and
 * deliberately does not import) "server-only".
 */

export type ChargingMode = "AC" | "DC" | "UNKNOWN";

/**
 * Just the part of a vehicle's spec that determines charging speed — split
 * out from CalculatorVehicleInput so getEffectiveChargingPowerKw() can be
 * reused (Part 09's recommendation engine, `src/services/
 * recommendation-engine.ts`) without needing a battery capacity, which
 * only the time/energy estimate below needs.
 */
export type VehiclePowerProfile = {
  /** Vehicle's own max AC acceptance rate, kW — null if not on record. */
  maxAcPowerKw: number | null;
  /** Vehicle's own max DC acceptance rate, kW — null if not on record. */
  maxDcPowerKw: number | null;
};

export type CalculatorVehicleInput = VehiclePowerProfile & {
  /** Usable battery capacity, kWh. */
  batteryCapacityKwh: number;
  /**
   * Manufacturer-published full-charge range, km — null/omitted if not on
   * record. Powers the optional range estimate below only; the energy/time
   * estimate never depends on it.
   */
  fullRangeKm?: number | null;
};

export type CalculatorChargerInput = {
  chargingMode: ChargingMode;
  /** Charger's own max output, kW — null if not on record. */
  powerKw: number | null;
};

export type EffectivePowerResult =
  | { ok: true; effectivePowerKw: number; limitingFactor: "vehicle" | "charger" }
  | { ok: false; reason: "mode_unknown" | "vehicle_max_unknown" | "charger_power_unknown" };

/**
 * The core "how fast can this vehicle actually charge here" rule, shared
 * by the time estimate below and the recommendation engine's power score:
 * min(vehicle's max acceptance for the charger's mode, charger's max
 * output) — never invented when either side isn't on record.
 */
export function getEffectiveChargingPowerKw(
  vehicle: VehiclePowerProfile,
  charger: CalculatorChargerInput
): EffectivePowerResult {
  if (charger.chargingMode === "UNKNOWN") {
    return { ok: false, reason: "mode_unknown" };
  }

  const vehicleMaxKw = charger.chargingMode === "AC" ? vehicle.maxAcPowerKw : vehicle.maxDcPowerKw;
  if (vehicleMaxKw === null) {
    return { ok: false, reason: "vehicle_max_unknown" };
  }
  if (charger.powerKw === null) {
    return { ok: false, reason: "charger_power_unknown" };
  }

  return {
    ok: true,
    effectivePowerKw: Math.min(vehicleMaxKw, charger.powerKw),
    limitingFactor: vehicleMaxKw <= charger.powerKw ? "vehicle" : "charger",
  };
}

export type CalculatorInput = {
  vehicle: CalculatorVehicleInput;
  charger: CalculatorChargerInput;
  /** Current battery level, 0-100. */
  currentPercent: number;
  /** Target battery level, 0-100, must be greater than currentPercent. */
  targetPercent: number;
};

export type CalculatorFieldError = { field: string; message: string };

export type ChargingEstimate = {
  /** Energy needed to go from currentPercent to targetPercent. Always computable from battery capacity alone. */
  energyRequiredKwh: number;
  /** min(vehicle's max acceptance, charger's max output) for the charger's mode — null if either side is unknown. */
  effectivePowerKw: number | null;
  /** Estimated minutes at a constant effectivePowerKw — null whenever effectivePowerKw is null. */
  estimatedMinutes: number | null;
  /** Which side caps the charging speed, when known. */
  limitingFactor: "vehicle" | "charger" | null;
  /** Set whenever effectivePowerKw/estimatedMinutes couldn't be computed, explaining why — never silently left blank. */
  note: string | null;
  /**
   * Range estimate derived from vehicle.fullRangeKm (assumes range scales
   * linearly with battery %, same simplifying assumption as the constant-
   * power time estimate above) — null whenever fullRangeKm isn't on
   * record, never guessed from battery capacity alone.
   */
  range: { currentRangeKm: number; rangeAddedKm: number; targetRangeKm: number } | null;
};

/**
 * This is a simplified, constant-power estimate. Real charging sessions —
 * especially DC fast charging — taper well before 100%, so an actual
 * session is often slower than this number above roughly 80% battery.
 * Always shown alongside a result; see ChargingCalculatorTool.tsx.
 */
export const CHARGING_ESTIMATE_CAVEAT =
  "This is a simplified estimate that assumes constant charging power for the whole session. Real charging — especially DC fast charging — usually slows down above about 80% battery, so an actual session may take longer than shown.";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function calculateChargingEstimate(
  input: CalculatorInput
): { ok: true; data: ChargingEstimate } | { ok: false; errors: CalculatorFieldError[] } {
  const { vehicle, charger, currentPercent, targetPercent } = input;
  const errors: CalculatorFieldError[] = [];

  if (!Number.isFinite(currentPercent) || currentPercent < 0 || currentPercent > 100) {
    errors.push({ field: "currentPercent", message: "Enter a battery level between 0 and 100." });
  }
  if (!Number.isFinite(targetPercent) || targetPercent < 0 || targetPercent > 100) {
    errors.push({ field: "targetPercent", message: "Enter a battery level between 0 and 100." });
  }
  if (
    errors.length === 0 &&
    Number.isFinite(currentPercent) &&
    Number.isFinite(targetPercent) &&
    targetPercent <= currentPercent
  ) {
    errors.push({ field: "targetPercent", message: "Target must be higher than the current battery level." });
  }
  if (!Number.isFinite(vehicle.batteryCapacityKwh) || vehicle.batteryCapacityKwh <= 0) {
    errors.push({ field: "batteryCapacityKwh", message: "Enter a battery capacity greater than 0." });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const energyRequiredKwh = round(
    (vehicle.batteryCapacityKwh * (targetPercent - currentPercent)) / 100,
    2
  );

  const range =
    vehicle.fullRangeKm != null && vehicle.fullRangeKm > 0
      ? {
          currentRangeKm: round((vehicle.fullRangeKm * currentPercent) / 100, 1),
          rangeAddedKm: round((vehicle.fullRangeKm * (targetPercent - currentPercent)) / 100, 1),
          targetRangeKm: round((vehicle.fullRangeKm * targetPercent) / 100, 1),
        }
      : null;

  const effective = getEffectiveChargingPowerKw(vehicle, charger);

  if (!effective.ok) {
    const note =
      effective.reason === "mode_unknown"
        ? "This charger's charging mode (AC or DC) isn't on record, so charging speed and time can't be estimated."
        : effective.reason === "vehicle_max_unknown"
          ? `This vehicle's maximum ${charger.chargingMode} charging power isn't on record, so charging speed and time can't be estimated.`
          : "This charger's power rating isn't on record, so charging time can't be estimated.";

    return {
      ok: true,
      data: { energyRequiredKwh, effectivePowerKw: null, estimatedMinutes: null, limitingFactor: null, note, range },
    };
  }

  const estimatedMinutes =
    effective.effectivePowerKw > 0
      ? Math.round((energyRequiredKwh / effective.effectivePowerKw) * 60)
      : null;

  return {
    ok: true,
    data: {
      energyRequiredKwh,
      effectivePowerKw: round(effective.effectivePowerKw, 2),
      estimatedMinutes,
      limitingFactor: estimatedMinutes === null ? null : effective.limitingFactor,
      note: null,
      range,
    },
  };
}
