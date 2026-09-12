import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { RecommendationTool } from "@/components/features/RecommendationTool";
import { listVehicles } from "@/services/vehicle-service";

export const metadata: Metadata = {
  title: "Recommended Stations",
  description: "Find the best-fit EV charging stations for your vehicle — not just the nearest one.",
};

export default async function RecommendationsPage() {
  // Server Component calling the service layer directly, same as
  // /charging-calculator (Part 08) — one server-side load, no self-HTTP
  // round trip. See docs/architecture.md §4.
  const vehicles = await listVehicles({ vehicleType: "CAR" });

  return (
    <Container className="py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Recommended Stations</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Ranked by whether a station can actually charge your vehicle, how fast, how close, its
          rating, and how well-verified its data is — not just distance. See{" "}
          <Link
            href="https://github.com/Mithil-1999/E-Sakhi/blob/main/docs/recommendation-engine.md"
            className="text-emerald-600 hover:underline dark:text-emerald-400"
          >
            how this ranking works
          </Link>
          .
        </p>
      </div>

      <RecommendationTool vehicles={vehicles} />
    </Container>
  );
}
