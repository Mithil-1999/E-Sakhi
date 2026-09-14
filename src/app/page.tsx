import { Hero } from "@/components/features/Hero";
import { FeatureSection } from "@/components/features/FeatureSection";
import { StatsSection, type Stat } from "@/components/features/StatsSection";
import { AboutSection } from "@/components/features/AboutSection";
import { getPublicStats } from "@/services/station-service";

export default async function Home() {
  const stats = await getPublicStats();

  const displayStats: Stat[] = [
    { label: "Charging Stations", value: stats.stationCount.toLocaleString() },
    { label: "Chargers / Plugs", value: stats.chargerCount.toLocaleString() },
    { label: "Districts Covered", value: stats.districtCount.toLocaleString() },
    { label: "Connector Types", value: stats.connectorTypeCount.toLocaleString() },
  ];

  return (
    <>
      <Hero />
      <FeatureSection />
      <StatsSection stats={displayStats} />
      <AboutSection />
    </>
  );
}
