import * as z from "zod";
import { PaginationQuerySchema } from "@/lib/validation/pagination";

const CHARGING_MODE_VALUES = ["AC", "DC", "UNKNOWN"] as const;
const VEHICLE_TYPE_VALUES = ["CAR", "SCOOTER", "MOTORCYCLE", "OTHER"] as const;
const CHARGER_AVAILABILITY_VALUES = ["AVAILABLE", "BUSY", "UNAVAILABLE", "UNKNOWN"] as const;

export const ChargerListQuerySchema = PaginationQuerySchema.extend({
  stationId: z.string().trim().min(1).optional(),
  connector: z.string().trim().min(1).max(50).optional(),
  chargingMode: z.enum(CHARGING_MODE_VALUES).optional(),
});

export type ChargerListQuery = z.infer<typeof ChargerListQuerySchema>;

// connectorCodes is validated as "at least one non-empty string" here;
// whether each code actually names a real Connector row is checked in
// charger-service.ts (resolveConnectorIds()) — the same division of
// labor as station.ts's operatorId (shape here, existence in the service).
const connectorCodesSchema = z
  .array(z.string().trim().min(1))
  .min(1, { error: "Select at least one connector." });

export const ChargerCreateSchema = z.object({
  stationId: z.string().trim().min(1, { error: "stationId is required." }),
  plugId: z.string().trim().min(1).max(100).nullable().optional(),
  chargingMode: z.enum(CHARGING_MODE_VALUES).default("UNKNOWN"),
  powerKw: z.coerce.number().min(0).max(1000).nullable().optional(),
  vehicleType: z.enum(VEHICLE_TYPE_VALUES).nullable().optional(),
  availability: z.enum(CHARGER_AVAILABILITY_VALUES).default("UNKNOWN"),
  connectorCodes: connectorCodesSchema,
});

export type ChargerCreateInput = z.infer<typeof ChargerCreateSchema>;

// Partial update — stationId deliberately excluded, same reasoning as
// station.ts's StationUpdateSchema omitting stationId: a charger is
// managed from within its station's admin page, never moved to another
// station via a general field update.
export const ChargerUpdateSchema = z
  .object({
    plugId: z.string().trim().min(1).max(100).nullable(),
    chargingMode: z.enum(CHARGING_MODE_VALUES),
    powerKw: z.coerce.number().min(0).max(1000).nullable(),
    vehicleType: z.enum(VEHICLE_TYPE_VALUES).nullable(),
    availability: z.enum(CHARGER_AVAILABILITY_VALUES),
    connectorCodes: connectorCodesSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    error: "At least one field must be provided to update.",
  });

export type ChargerUpdateInput = z.infer<typeof ChargerUpdateSchema>;
