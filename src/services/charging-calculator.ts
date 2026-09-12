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

export type CalculatorVehicleInput = {
  /** Usable battery capacity, kWh. */
  batteryCapacityKwh: number;
  /** Vehicle's own max AC acceptance rate, kW — null if not on record. */
  maxAcPowerKw: number | null;
  /** Vehicle's own max DC acceptance rate, kW — null if not on record. */
  maxDcPowerKw: number | null;
};

export type CalculatorChargerInput = {
  chargingMode: ChargingMode;
  /** Charger's own max output, kW — null if not on record. */
  powerKw: number | null;
};

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

  // Never invented: a charger whose AC/DC mode isn't on record can't be
  // matched against a vehicle's max power for "the right" mode.
  if (charger.chargingMode === "UNKNOWN") {
    return {
      ok: true,
      data: {
        energyRequiredKwh,
        effectivePowerKw: null,
        estimatedMinutes: null,
        limitingFactor: null,
        note: "This charger's charging mode (AC or DC) isn't on record, so charging speed and time can't be estimated.",
      },
    };
  }

  const vehicleMaxKw = charger.chargingMode === "AC" ? vehicle.maxAcPowerKw : vehicle.maxDcPowerKw;

  if (vehicleMaxKw === null) {
    return {
      ok: true,
      data: {
        energyRequiredKwh,
        effectivePowerKw: null,
        estimatedMinutes: null,
        limitingFactor: null,
        note: `This vehicle's maximum ${charger.chargingMode} charging power isn't on record, so charging speed and time can't be estimated.`,
      },
    };
  }

  if (charger.powerKw === null) {
    return {
      ok: true,
      data: {
        energyRequiredKwh,
        effectivePowerKw: null,
        estimatedMinutes: null,
        limitingFactor: null,
        note: "This charger's power rating isn't on record, so charging time can't be estimated.",
      },
    };
  }

  const effectivePowerKw = Math.min(vehicleMaxKw, charger.powerKw);
  const limitingFactor: "vehicle" | "charger" = vehicleMaxKw <= charger.powerKw ? "vehicle" : "charger";
  const estimatedMinutes =
    effectivePowerKw > 0 ? Math.round((energyRequiredKwh / effectivePowerKw) * 60) : null;

  return {
    ok: true,
    data: {
      energyRequiredKwh,
      effectivePowerKw: round(effectivePowerKw, 2),
      estimatedMinutes,
      limitingFactor: estimatedMinutes === null ? null : limitingFactor,
      note: null,
    },
  };
}
