import type { Metadata } from "next";
import { MargPlanner } from "@/components/features/MargPlanner";
import { listVehicles } from "@/services/vehicle-service";

export const metadata: Metadata = {
  title: "E Sakhi Marg",
  description:
    "Plan an EV journey across Nepal — enter your starting point and destination and get multiple route options with real charging checkpoints along the way.",
};

export default async function MargPage() {
  // Server Component calling the service layer directly, same pattern as
  // /recommendations and /charging-calculator — powers the optional
  // "vehicle & battery" section's reference-vehicle presets.
  const vehicles = await listVehicles({ vehicleType: "CAR" });

  return <MargPlanner vehicles={vehicles} />;
}
