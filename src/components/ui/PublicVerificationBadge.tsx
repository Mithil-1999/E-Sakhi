import type { VerificationStatus } from "@/types/station";
import { VerificationBadge } from "@/components/ui/VerificationBadge";

/**
 * Public-facing wrapper around VerificationBadge — renders nothing for
 * ASSUMED specifically, everywhere a visitor (not an admin) sees a
 * station. Deliberately does NOT change VerificationBadge itself: the
 * admin dashboard, verification queue, and admin station edit form still
 * need to see every real status including ASSUMED to actually manage it
 * — that's the whole point of the verification workflow (Part 13). This
 * wrapper only affects the visitor-facing surfaces that import it
 * (StationCard, StationPopupContent, the station detail page,
 * RecommendationTool) — every other real status (VERIFIED,
 * PARTIALLY_VERIFIED, UNVERIFIED, NEEDS_REVIEW, UNKNOWN) still renders
 * normally, unchanged.
 */
export function PublicVerificationBadge({
  status,
  className = "",
}: {
  status: VerificationStatus;
  className?: string;
}) {
  if (status === "ASSUMED") return null;
  return <VerificationBadge status={status} className={className} />;
}
