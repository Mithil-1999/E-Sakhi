import * as z from "zod";
import { PaginationQuerySchema } from "@/lib/validation/pagination";

// Mirrors prisma/schema.prisma's enums. Kept as explicit literal tuples
// (rather than deriving from the Prisma-generated enum object) so this
// file has no runtime dependency on @prisma/client — just the same
// values, which schema.prisma is the source of truth for.
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
  mapUrl: z.url().max(2000).nullable().optional(),
  status: z.enum(STATION_STATUS_VALUES).default("UNKNOWN"),
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
    mapUrl: z.url().max(2000).nullable(),
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
