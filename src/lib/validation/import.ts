import * as z from "zod";

/**
 * The Apply request's shape — see docs/data-import.md §3. Deliberately
 * does NOT define any verification field, coordinate field, or charger
 * availability anywhere in this file: Zod's default behavior of
 * stripping unknown object keys means even a hand-crafted request that
 * includes one of those is silently ignored, not merely rejected. This
 * is the concrete mechanism behind docs/data-import.md §2's "structural,
 * not conventional" guarantee.
 */

const STATION_STATUS_VALUES = ["ACTIVE", "INACTIVE", "UNKNOWN"] as const;
const VERIFICATION_STATUS_VALUES = [
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNVERIFIED",
  "NEEDS_REVIEW",
  "UNKNOWN",
  "ASSUMED",
] as const;
const CHARGING_MODE_VALUES = ["AC", "DC", "UNKNOWN"] as const;

// mapUrl is intentionally lenient (no z.url()) — matches prisma/seed.ts's
// original leniency toward this column. station.ts's admin manual-edit
// schemas used to be stricter here (z.url()); Part 16 aligned them with
// this same leniency after that split blocked EVNP-0448's admin edit form
// entirely (docs/data-model.md §8.4's garbled mapUrl value). See
// docs/data-import.md §4.
const ImportStationDataSchema = z.object({
  stationName: z.string().trim().min(1).max(200),
  operatorName: z.string().trim().min(1).max(200).nullable(),
  province: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(500),
  contact: z.string().trim().max(100).nullable(),
  mapUrl: z.string().trim().max(2000).nullable(),
  status: z.enum(STATION_STATUS_VALUES),
});

const ImportChargerEntrySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    externalPlugId: z.string().trim().min(1).nullable(),
    chargingMode: z.enum(CHARGING_MODE_VALUES),
    powerKw: z.number().min(0).max(1000).nullable(),
    connectorCodes: z.array(z.string().trim().min(1)).min(1),
  }),
  z.object({
    action: z.literal("update"),
    chargerDbId: z.string().trim().min(1),
    externalPlugId: z.string().trim().min(1).nullable(),
    chargingMode: z.enum(CHARGING_MODE_VALUES),
    powerKw: z.number().min(0).max(1000).nullable(),
    connectorCodes: z.array(z.string().trim().min(1)).min(1),
  }),
]);

export const ImportApplyEntrySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    externalStationId: z.string().trim().min(1),
    // A brand-new station has no existing admin verification to protect,
    // so (only here) an initial classification is part of the payload —
    // see docs/data-import.md §5.
    station: ImportStationDataSchema.extend({
      verificationStatus: z.enum(VERIFICATION_STATUS_VALUES),
      assumptionFlag: z.boolean(),
      verificationSource: z.string().trim().min(1).max(500),
    }),
    chargers: z.array(ImportChargerEntrySchema),
  }),
  z.object({
    action: z.literal("update"),
    stationDbId: z.string().trim().min(1),
    externalStationId: z.string().trim().min(1),
    station: ImportStationDataSchema,
    chargers: z.array(ImportChargerEntrySchema),
  }),
]);

export const ImportApplyRequestSchema = z.object({
  entries: z.array(ImportApplyEntrySchema).min(1).max(500),
});

export type ImportApplyEntry = z.infer<typeof ImportApplyEntrySchema>;
export type ImportApplyRequest = z.infer<typeof ImportApplyRequestSchema>;
