import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Server-renderable pagination — plain links, no client JS required, so
 * it works with a fully server-rendered list page (docs/architecture.md
 * §4's "server-side filtering/pagination" rule). `buildHref` gets just
 * the target page number and returns the full URL, so the caller decides
 * how other query params are preserved.
 */
export function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, page + 2);
  const pageNumbers = Array.from(
    { length: windowEnd - windowStart + 1 },
    (_, i) => windowStart + i
  );

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 py-8">
      <PageLink
        href={buildHref(page - 1)}
        disabled={page <= 1}
        ariaLabel="Previous page"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </PageLink>

      {windowStart > 1 && (
        <>
          <PageLink href={buildHref(1)}>1</PageLink>
          {windowStart > 2 && <span className="px-1 text-slate-400">…</span>}
        </>
      )}

      {pageNumbers.map((n) => (
        <PageLink key={n} href={buildHref(n)} current={n === page}>
          {n}
        </PageLink>
      ))}

      {windowEnd < totalPages && (
        <>
          {windowEnd < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}
          <PageLink href={buildHref(totalPages)}>{totalPages}</PageLink>
        </>
      )}

      <PageLink
        href={buildHref(page + 1)}
        disabled={page >= totalPages}
        ariaLabel="Next page"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  current,
  disabled,
  ariaLabel,
  children,
}: {
  href: string;
  current?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors";

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={ariaLabel}
        className={`${base} cursor-not-allowed text-slate-300 dark:text-slate-700`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={current ? "page" : undefined}
      className={`${base} ${
        current
          ? "bg-emerald-600 text-white"
          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </Link>
  );
}
