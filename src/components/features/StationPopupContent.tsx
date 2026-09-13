import Link from "next/link";
import { PublicVerificationBadge } from "@/components/ui/PublicVerificationBadge";
import type { StationListItem } from "@/types/station";

const STATUS_LABELS: Record<StationListItem["status"], string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
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
    <div className="min-w-[240px] space-y-1.5 text-sm text-slate-700">
      <p className="font-semibold text-slate-900">{station.stationName}</p>
      <p className="text-slate-600">{station.address}</p>
      <p className="text-slate-600">
        {station.operator?.name ?? "Independent"} · {station.city}, {station.district}
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
      {station.latitude !== null && station.longitude !== null && (
        <p className="font-mono text-xs text-slate-500">
          {station.latitude.toFixed(6)}, {station.longitude.toFixed(6)}
        </p>
      )}
      <PublicVerificationBadge status={station.verificationStatus} />
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
