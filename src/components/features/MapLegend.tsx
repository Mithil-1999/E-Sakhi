/**
 * Explains the two marker colors MapProvider.tsx renders — emerald for an
 * exactly-geocoded station, amber for one that fell back to a related
 * place's coordinate (CoordinateSource.APPROXIMATE, see
 * docs/data-model.md §10). Kept as its own small component (rather than
 * inline in MapExplorer.tsx) since it's a self-contained, static piece of
 * UI with no state of its own.
 */
export function MapLegend() {
  return (
    <div className="rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur dark:bg-slate-950/95 dark:text-slate-300">
      <p className="mb-1 font-medium text-slate-900 dark:text-white">Legend</p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
          <span>Verified location</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-600" aria-hidden="true" />
          <span>Approximate location</span>
        </div>
      </div>
    </div>
  );
}
