import Link from "next/link";
import { MapPin, Zap } from "lucide-react";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { FavoriteButton } from "@/components/features/FavoriteButton";
import type { StationListItem } from "@/types/station";

const STATUS_STYLES: Record<StationListItem["status"], string> = {
  ACTIVE: "text-emerald-700 dark:text-emerald-400",
  INACTIVE: "text-red-600 dark:text-red-400",
  UNKNOWN: "text-slate-500 dark:text-slate-400",
};

const STATUS_LABELS: Record<StationListItem["status"], string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  UNKNOWN: "Status unknown",
};

export type StationCardFavoriteState = {
  isLoggedIn: boolean;
  isFavorited: boolean;
  onToggled?: (favorited: boolean) => void;
};

/**
 * One station's result card — used by the /stations list (Part 06) and
 * /my-favorites (Part 10). Every field it shows comes from GET
 * /api/stations (src/services/station-service.ts); nothing here is
 * hard-coded, per docs/architecture.md's rule that station data always
 * comes from the API.
 *
 * `favorite` is optional — omit it and the card renders with no favorite
 * control at all (rather than a broken/fake one) for any caller that
 * hasn't resolved favorite state for its stations. When provided, the
 * toggle button sits *outside* the <Link> (a sibling in a relative
 * wrapper), not nested inside it — a <button> inside an <a> is invalid
 * HTML and would double-fire navigation on click.
 */
export function StationCard({
  station,
  favorite,
}: {
  station: StationListItem;
  favorite?: StationCardFavoriteState;
}) {
  const { chargerSummary } = station;
  const connectorText =
    chargerSummary.connectors.length > 0
      ? chargerSummary.connectors.map((c) => c.label).join(", ")
      : "Connector unknown";

  return (
    <div className="relative">
      {favorite && (
        // Pinned to the card's outer corner (negative offset), clear of
        // the verification badge that already lives inside the header row
        // below — see the component doc comment above for why this sits
        // outside the <Link> entirely rather than overlapping it.
        <div className="absolute -right-2 -top-2 z-10">
          <FavoriteButton
            stationId={station.id}
            initialFavorited={favorite.isFavorited}
            isLoggedIn={favorite.isLoggedIn}
            variant="icon"
            onToggled={favorite.onToggled}
          />
        </div>
      )}
      <Link
        href={`/stations/${station.id}`}
        className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900 dark:text-white">
              {station.stationName}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {station.city}, {station.district}
              </span>
            </p>
          </div>
          <VerificationBadge status={station.verificationStatus} className="shrink-0" />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Operator</dt>
            <dd className="truncate font-medium text-slate-900 dark:text-white">
              {station.operator?.name ?? "Independent"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Status</dt>
            <dd className={`font-medium ${STATUS_STYLES[station.status]}`}>
              {STATUS_LABELS[station.status]}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500 dark:text-slate-400">Chargers</dt>
            <dd className="flex items-center gap-1 font-medium text-slate-900 dark:text-white">
              <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="truncate">
                {chargerSummary.count > 0
                  ? `${chargerSummary.count} · ${connectorText}${
                      chargerSummary.powerKwMax !== null ? ` · up to ${chargerSummary.powerKwMax} kW` : ""
                    }`
                  : "No chargers on record"}
              </span>
            </dd>
          </div>
        </dl>
      </Link>
    </div>
  );
}
