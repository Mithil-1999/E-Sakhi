import Link from "next/link";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import type { StationListItem } from "@/types/station";

const STATUS_LABELS: Record<StationListItem["status"], string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  UNKNOWN: "Unknown",
};

/**
 * Coordinate-precision label shown in the popup — a different axis from
 * the record's overall VerificationBadge (which covers station/contact/
 * connector/power data generally). "Verified"/"Approximate" here are
 * this feature's own vocabulary for CoordinateSource, not the
 * VerificationStatus enum's VERIFIED value — never conflate the two; see
 * docs/data-model.md §10.
 */
const COORDINATE_STATUS: Record<
  StationListItem["coordinateSource"],
  { label: string; className: string }
> = {
  EXACT: { label: "Verified", className: "bg-emerald-100 text-emerald-800" },
  APPROXIMATE: { label: "Approximate", className: "bg-amber-100 text-amber-800" },
  UNKNOWN: { label: "Coordinates unavailable", className: "bg-slate-100 text-slate-600" },
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
  const coordStatus = COORDINATE_STATUS[station.coordinateSource];

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
      <div className="flex flex-wrap items-center gap-1.5">
        <VerificationBadge status={station.verificationStatus} />
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${coordStatus.className}`}
        >
          {coordStatus.label}
        </span>
      </div>
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
