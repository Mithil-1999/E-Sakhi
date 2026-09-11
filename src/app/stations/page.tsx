import type { Metadata } from "next";
import { BatteryCharging } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Find Chargers",
};

export default function StationsPage() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        <BatteryCharging className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Station search — coming soon
      </h1>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
        Searching and filtering charging stations will be available once the
        station database and API are connected in a later part of E
        Sakhi&apos;s development.
      </p>
      <Button href="/" variant="outline" className="mt-2">
        Back to home
      </Button>
    </Container>
  );
}
