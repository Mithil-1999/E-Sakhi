import * as z from "zod";
import { PaginationQuerySchema } from "@/lib/validation/pagination";
import { POWER_BUCKET_IDS } from "@/lib/config/power-buckets";

// Mirrors prisma/schema.prisma's enums. Kept as explicit literal tuples
// (rather than deriving from the Prisma-generated enum object) so this
// file has no runtime dependency on @prisma/client — just the same
// values, which schema.prisma is the source of truth for.
// Simplified to two values by product decision — StationStatus.UNKNOWN
// still exists in prisma/schema.prisma (so no data/enum migration is
// forced), but the app no longer sets, filters by, or displays it; every
// station is ACTIVE unless explicitly INACTIVE. See mapStationStatus()
// in src/services/excel-station-parser.ts.
const STATION_STATUS_VALUES = ["ACTIVE", "INACTIVE"] as const;
const VERIFICATION_STATUS_VALUES = [
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNVERIFIED",
  "NEEDS_REVIEW",
  "UNKNOWN",
  "ASSUMED",
] as const;
const CHARGING_MODE_VALUES = ["AC", "DC", "UNKNOWN"] as const;
const VEHICLE_TYPE_VALUES = ["CAR", "SCOOTER", "MOTORCYCLE", "OTHER"] as const;
// "Unknown" is deliberately excluded from this filter's own accepted
// values (unlike the Prisma-level ChargerAvailability enum, which keeps
// it as a legitimate admin data-entry state — see src/lib/validation/
// charger.ts). This is the public /stations "Availability" filter only.
const CHARGER_AVAILABILITY_VALUES = ["AVAILABLE", "BUSY", "UNAVAILABLE"] as const;

export const StationListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  province: z.string().trim().min(1).max(100).optional(),
  district: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  operatorId: z.string().trim().min(1).optional(),
  status: z.enum(STATION_STATUS_VALUES).optional(),
  verificationStatus: z.enum(VERIFICATION_STATUS_VALUES).optional(),
  connector: z.string().trim().min(1).max(50).optional(),
  chargingMode: z.enum(CHARGING_MODE_VALUES).optional(),
  // Added in Part 06 — deliberately deferred by Part 04's own comments,
  // which only wired the connector/chargingMode filters it needed for
  // the map. All three narrow to stations with at least one charger
  // matching the condition (same "some charger" semantics as connector/
  // chargingMode above — see buildStationWhere in station-service.ts).
  powerBucket: z.enum(POWER_BUCKET_IDS).optional(),
  vehicleType: z.enum(VEHICLE_TYPE_VALUES).optional(),
  availability: z.enum(CHARGER_AVAILABILITY_VALUES).optional(),
  // Admin-only in effect: a non-admin caller passing this is simply
  // ignored by the route handler rather than rejected — see
  // src/app/api/stations/route.ts.
  includeDeleted: z.coerce.boolean().default(false),
});

export type StationListQuery = z.infer<typeof StationListQuerySchema>;

const latitudeSchema = z.coerce.number().min(-90).max(90).nullable().optional();
const longitudeSchema = z.coerce.number().min(-180).max(180).nullable().optional();

export const StationCreateSchema = z.object({
  stationId: z.string().trim().min(1).max(100).optional(),
  stationName: z.string().trim().min(1, { error: "Station name is required." }).max(200),
  operatorId: z.string().trim().min(1).optional(),
  province: z.string().trim().min(1, { error: "Province is required." }).max(100),
  district: z.string().trim().min(1, { error: "District is required." }).max(100),
  city: z.string().trim().min(1, { error: "City is required." }).max(100),
  address: z.string().trim().min(1, { error: "Address is required." }).max(500),
  contact: z.string().trim().max(100).nullable().optional(),
  // Coordinates are never invented — if omitted, latitude/longitude stay
  // NULL. See docs/architecture.md §6 and docs/data-model.md.
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  // Intentionally lenient (no z.url()) — matches src/lib/validation/
  // import.ts's mapUrl and docs/data-model.md §4's own definition of the
  // field ("raw source URL/description," never guaranteed to be a valid
  // URL). This used to be z.url() here specifically, a stricter rule for
  // a human typing a fresh value; Part 16 removed that split after it
  // turned into a real bug: EVNP-0448's legacy mapUrl value ("Listed", a
  // garbled source row — see docs/data-model.md §8.4) failed z.url() on
  // every full-state resend from AdminStationForm.tsx, permanently
  // blocking that station's admin edit form from saving *any* field, not
  // just mapUrl. See docs/architecture.md §4.
  mapUrl: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(STATION_STATUS_VALUES).default("ACTIVE"),
  verificationStatus: z.enum(VERIFICATION_STATUS_VALUES).default("UNKNOWN"),
  assumptionFlag: z.boolean().default(false),
  verificationSource: z.string().trim().max(500).nullable().optional(),
});

export type StationCreateInput = z.infer<typeof StationCreateSchema>;

// Partial update — every field optional, but the set of fields a PUT is
// allowed to touch deliberately excludes stationId (external/source
// identity, not editable after creation), and is_deleted/deleted_at/
// deleted_by (soft-delete state changes only through DELETE, never
// smuggled into a general field update).
export const StationUpdateSchema = z
  .object({
    stationName: z.string().trim().min(1).max(200),
    operatorId: z.string().trim().min(1).nullable(),
    province: z.string().trim().min(1).max(100),
    district: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1).max(500),
    contact: z.string().trim().max(100).nullable(),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    // See StationCreateSchema's mapUrl comment above — intentionally not
    // z.url(), fixed in Part 16.
    mapUrl: z.string().trim().max(2000).nullable(),
    status: z.enum(STATION_STATUS_VALUES),
    verificationStatus: z.enum(VERIFICATION_STATUS_VALUES),
    assumptionFlag: z.boolean(),
    verificationSource: z.string().trim().max(500).nullable(),
    lastVerified: z.iso.datetime().nullable(),
    locationVerified: z.boolean(),
    connectorVerified: z.boolean(),
    powerVerified: z.boolean(),
    contactVerified: z.boolean(),
    availabilityVerified: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    error: "At least one field must be provided to update.",
  });

export type StationUpdateInput = z.infer<typeof StationUpdateSchema>;
