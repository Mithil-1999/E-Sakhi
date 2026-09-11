import { Hero } from "@/components/features/Hero";
import { FeatureSection } from "@/components/features/FeatureSection";
import { StatsSection } from "@/components/features/StatsSection";
import { AboutSection } from "@/components/features/AboutSection";

export default function Home() {
  return (
    <>
      <Hero />
      <FeatureSection />
      <StatsSection />
      <AboutSection />
    </>
  );
}
