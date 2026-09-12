import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ChargingCalculatorTool } from "@/components/features/ChargingCalculatorTool";
import { listVehicles } from "@/services/vehicle-service";

export const metadata: Metadata = {
  title: "Charging Calculator",
  description: "Estimate the energy and time needed to charge your EV at a given charger.",
};

export default async function ChargingCalculatorPage() {
  // Server Component calling the service layer directly, same as /stations
  // (Part 06) — no self-HTTP round trip for data this page only ever
  // needs once, server-side, at load. See docs/architecture.md §4.
  const vehicles = await listVehicles({ vehicleType: "CAR" });

  return (
    <Container className="py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Charging Calculator</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Pick a vehicle (or enter your own specs), a charger, and a target battery level to get
          the energy required and an estimated charging time.
        </p>
      </div>

      <ChargingCalculatorTool vehicles={vehicles} />
    </Container>
  );
}
