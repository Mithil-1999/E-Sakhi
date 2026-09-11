import { Container } from "@/components/ui/Container";

export type Stat = {
  label: string;
  value: string;
};

type StatsSectionProps = {
  /**
   * Real stats, computed from the database. Intentionally optional —
   * there is no database connected yet (that lands in Part 02), so this
   * section must never fall back to invented numbers. When `stats` is
   * omitted, every value renders as a placeholder, not a guess.
   */
  stats?: Stat[];
};

const placeholderStats: Stat[] = [
  { label: "Charging Stations", value: "—" },
  { label: "Chargers / Plugs", value: "—" },
  { label: "Districts Covered", value: "—" },
  { label: "Connector Types", value: "—" },
];

export function StatsSection({ stats }: StatsSectionProps) {
  const displayStats = stats ?? placeholderStats;
  const isPlaceholder = !stats;

  return (
    <section className="border-y border-slate-200 bg-slate-50 py-16 dark:border-slate-800 dark:bg-slate-900/50">
      <Container>
        <div className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
          {displayStats.map((stat) => (
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

        {isPlaceholder && (
          <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-500">
            Live numbers will appear here once the station database is
            connected (Part 02 onward).
          </p>
        )}
      </Container>
    </section>
  );
}
