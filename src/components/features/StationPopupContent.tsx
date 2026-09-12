import Link from "next/link";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import type { StationListItem } from "@/types/station";

const STATUS_LABELS: Record<StationListItem["status"], string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  UNKNOWN: "Unknown",
};

/**
 * Rendered inside a Leaflet popup (always a white popup chrome regardless
 * of site theme, hence no dark: classes here). Plain React — this file
 * never imports Leaflet; MapProvider.tsx just embeds whatever ReactNode
 * it's given. See docs/architecture.md §6.
 */
export function StationPopupContent({ station }: { station: StationListItem }) {
  const { chargerSummary } = station;
  const connectorText =
    chargerSummary.connectors.length > 0
      ? chargerSummary.connectors.map((c) => c.label).join(", ")
      : "Connector unknown";
  const powerText = chargerSummary.powerKwMax !== null ? `up to ${chargerSummary.powerKwMax} kW` : null;

  return (
    <div className="min-w-[220px] space-y-1.5 text-sm text-slate-700">
      <p className="font-semibold text-slate-900">{station.stationName}</p>
      <p className="text-slate-600">
        {station.operator?.name ?? "Independent"} · {station.city}
      </p>
      <p className="text-slate-600">
        {connectorText}
        {powerText ? ` · ${powerText}` : ""}
      </p>
      <p className="text-slate-600">
        Status: {STATUS_LABELS[station.status]}
        {chargerSummary.count > 0 &&
          ` · ${chargerSummary.count} charger${chargerSummary.count === 1 ? "" : "s"}`}
      </p>
      <VerificationBadge status={station.verificationStatus} />
      <div className="pt-1">
        <Link
          href={`/stations/${station.id}`}
          className="text-sm font-medium text-emerald-600 hover:underline"
        >
          View Details →
        </Link>
      </div>
    </div>
  );
}
