import type { VerificationStatus } from "@/types/station";

/**
 * The one place verification-status colors/labels are defined — reused
 * wherever station data is shown (map popup now; station cards/details
 * in later parts). Per docs/architecture.md §5, this must never be
 * hidden or buried, so every station surface renders it, not just this
 * component existing somewhere unused.
 */

const LABELS: Record<VerificationStatus, string> = {
  VERIFIED: "Verified",
  PARTIALLY_VERIFIED: "Partially Verified",
  UNVERIFIED: "Unverified",
  NEEDS_REVIEW: "Needs Review",
  UNKNOWN: "Unknown",
  ASSUMED: "Assumed",
};

const STYLES: Record<VerificationStatus, string> = {
  VERIFIED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  PARTIALLY_VERIFIED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  UNVERIFIED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  NEEDS_REVIEW: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  UNKNOWN: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  ASSUMED: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export function VerificationBadge({
  status,
  className = "",
}: {
  status: VerificationStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]} ${className}`}
    >
      {LABELS[status]}
    </span>
  );
}
