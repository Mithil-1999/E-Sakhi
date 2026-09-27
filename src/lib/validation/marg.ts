import * as z from "zod";

/**
 * E Sakhi Marg — the EV journey/route planner. Its own validation file
 * (not station.ts/charger.ts) since its inputs (coordinates + labels for
 * a start/destination pair, plus a journey-level connector/mode choice)
 * are a genuinely different shape from a station list filter.
 */

export const MargGeocodeQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
});

export type MargGeocodeQuery = z.infer<typeof MargGeocodeQuerySchema>;

// "Both" (AC or DC) is expressed as chargingMode being omitted entirely —
// same "empty = no filter" convention as every other filter in this app
// (see StationFilterPanel.tsx/MapFilterPanel.tsx) — never a fabricated
// third enum value that doesn't exist in the database.
export const MargPlanSchema = z.object({
  startLabel: z.string().trim().min(1).max(200),
  startLatitude: z.coerce.number().min(-90).max(90),
  startLongitude: z.coerce.number().min(-180).max(180),
  destLabel: z.string().trim().min(1).max(200),
  destLatitude: z.coerce.number().min(-90).max(90),
  destLongitude: z.coerce.number().min(-180).max(180),
  connector: z.string().trim().min(1).max(50),
  chargingMode: z.enum(["AC", "DC"]).optional(),
  // Battery-aware planning is entirely optional — all three fields are
  // optional and, when omitted, E Sakhi Marg behaves exactly as before
  // (evenly-spaced checkpoints). vehicleId reuses a real Vehicle row's
  // fullRangeKm; fullRangeKm lets a guest without a matching preset type
  // their own manufacturer-published range instead. Never both required —
  // resolution/fallback happens in the service layer, not here.
  vehicleId: z.string().trim().min(1).optional(),
  fullRangeKm: z.coerce.number().positive().max(2000).optional(),
  currentBatteryPercent: z.coerce.number().min(0).max(100).optional(),
});

export type MargPlanInput = z.infer<typeof MargPlanSchema>;
