/**
 * Client-facing vehicle types — mirror the shape GET /api/vehicles and
 * src/services/vehicle-service.ts actually return, kept separate so
 * client components never import "server-only" code, even just for
 * types. See src/types/station.ts for the same pattern.
 */

export type VehicleType = "CAR" | "SCOOTER" | "MOTORCYCLE" | "OTHER";

export type VehicleConnectorRef = { code: string; label: string };

export type VehicleListItem = {
  id: string;
  brand: string;
  model: string;
  vehicleType: VehicleType;
  batteryCapacityKwh: number;
  maxDcPowerKw: number | null;
  maxAcPowerKw: number | null;
  /** Manufacturer-published full-charge range, km — null if not on record. */
  fullRangeKm: number | null;
  connectors: VehicleConnectorRef[];
};
