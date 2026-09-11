import type { Metadata } from "next";
import { MapPinned } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Map",
};

export default function MapPage() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        <MapPinned className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Interactive map — coming soon
      </h1>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
        The interactive charging-station map is being built in a later part
        of E Sakhi&apos;s development. Once the station database is
        connected, you&apos;ll be able to browse stations across Nepal here.
      </p>
      <Button href="/" variant="outline" className="mt-2">
        Back to home
      </Button>
    </Container>
  );
}
