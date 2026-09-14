import { Container } from "@/components/ui/Container";

export type Stat = {
  label: string;
  value: string;
};

type StatsSectionProps = {
  /** Real stats, computed fresh from the database — see getPublicStats(). */
  stats: Stat[];
};

export function StatsSection({ stats }: StatsSectionProps) {
  return (
    <section className="border-y border-slate-200 bg-slate-50 py-16 dark:border-slate-800 dark:bg-slate-900/50">
      <Container>
        <div className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
