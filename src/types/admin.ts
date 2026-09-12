/**
 * Client-facing admin types — mirror what the admin station/charger
 * mutation endpoints actually send/receive over JSON (dates as ISO
 * strings), kept separate so admin Client Components never import
 * "server-only" service code, even just for types. Same pattern as
 * src/types/station.ts / src/types/vehicle.ts.
 */

import type { StationStatus, VerificationStatus } from "@/types/station";

export type ChargingMode = "AC" | "DC" | "UNKNOWN";
export type VehicleType = "CAR" | "SCOOTER" | "MOTORCYCLE" | "OTHER";
export type ChargerAvailability = "AVAILABLE" | "BUSY" | "UNAVAILABLE" | "UNKNOWN";

export type AdminConnectorRef = { code: string; label: string };

export type AdminChargerItem = {
  id: string;
  stationId: string;
  plugId: string | null;
  chargingMode: ChargingMode;
  powerKw: number | null;
  vehicleType: VehicleType | null;
  availability: ChargerAvailability;
  connectors: AdminConnectorRef[];
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminOperatorOption = { id: string; name: string };

export type AdminStationDetail = {
  id: string;
  stationId: string | null;
  stationName: string;
  operator: { id: string; name: string } | null;
  province: string;
  district: string;
  city: string;
  address: string;
  contact: string | null;
  latitude: number | null;
  longitude: number | null;
  mapUrl: string | null;
  status: StationStatus;
  verificationStatus: VerificationStatus;
  assumptionFlag: boolean;
  verificationSource: string | null;
  lastVerified: string | null;
  locationVerified: boolean;
  connectorVerified: boolean;
  powerVerified: boolean;
  contactVerified: boolean;
  availabilityVerified: boolean;
  chargers: AdminChargerItem[];
  isDeleted: boolean;
};
