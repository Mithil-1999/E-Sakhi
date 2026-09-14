import type { LucideIcon } from "lucide-react";
import { MapPinned, BatteryCharging, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    icon: MapPinned,
    title: "Explore on a map",
    description:
      "Browse EV charging stations across Nepal on an interactive map, and search or filter by connector, power, and location.",
  },
  {
    icon: BatteryCharging,
    title: "Plan your charge",
    description:
      "Select your vehicle, enter your current and target battery percentage, and see the energy you'll need and an estimated charging time.",
  },
  {
    icon: Sparkles,
    title: "Smart recommendations",
    description:
      "Compare stations ranked by compatibility, distance, charging power, and rating — not just which one is nearest.",
  },
];

export function FeatureSection() {
  return (
    <section aria-labelledby="features-heading" className="py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="features-heading"
            className="text-3xl font-bold text-slate-900 dark:text-white"
          >
            Everything you need to charge with confidence
          </h2>
          <p className="mt-4 text-slate-600 dark:text-slate-300">
            E Sakhi brings station discovery, compatibility checks, and
            charging estimates into one place.
          </p>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
