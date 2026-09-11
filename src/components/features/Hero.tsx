import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

export function Hero() {
  return (
    <section className="border-b border-slate-200 bg-gradient-to-b from-emerald-50 to-white dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
      <Container className="flex flex-col items-center py-20 text-center sm:py-28">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl dark:text-white">
          E Sakhi
        </h1>
        <p className="mt-3 text-xl font-semibold text-emerald-600 sm:text-2xl dark:text-emerald-400">
          Find. Charge. Go.
        </p>
        <p className="mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          Find EV charging stations across Nepal and get smart charging
          recommendations based on your vehicle and battery level.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Button href="/stations" variant="primary">
            Find Chargers
          </Button>
          <Button href="/map" variant="outline">
            Explore Map
          </Button>
        </div>
      </Container>
    </section>
  );
}
