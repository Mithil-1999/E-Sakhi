import * as z from "zod";

export const VEHICLE_TYPE_VALUES = ["CAR", "SCOOTER", "MOTORCYCLE", "OTHER"] as const;

export const VehicleListQuerySchema = z.object({
  vehicleType: z.enum(VEHICLE_TYPE_VALUES).optional(),
});

export type VehicleListQuery = z.infer<typeof VehicleListQuerySchema>;
