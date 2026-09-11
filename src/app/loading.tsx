export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <span
        className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"
        aria-hidden="true"
      />
      <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
    </div>
  );
}
