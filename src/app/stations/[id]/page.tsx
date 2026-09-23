import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Info,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Star,
  Zap,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { PublicVerificationBadge } from "@/components/ui/PublicVerificationBadge";
import { VerificationChecklist } from "@/components/ui/VerificationChecklist";
import { StarRating } from "@/components/ui/StarRating";
import { StationLocationMap } from "@/components/features/StationLocationMap";
import { FavoriteButton } from "@/components/features/FavoriteButton";
import { ReviewSection } from "@/components/features/ReviewSection";
import { ReportButton } from "@/components/features/ReportButton";
import { getStationById, type StationDetail } from "@/services/station-service";
import { getOptionalUser } from "@/lib/auth/session";
import { isFavorited } from "@/services/favorite-service";
import { listReviewsForStation, getOwnReview } from "@/services/review-service";

const STATUS_STYLES: Record<StationDetail["status"], string> = {
  ACTIVE: "text-emerald-700 dark:text-emerald-400",
  INACTIVE: "text-red-600 dark:text-red-400",
};

const STATUS_LABELS: Record<StationDetail["status"], string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

type ChargerRow = StationDetail["chargers"][number];

const CHARGING_MODE_LABELS: Record<ChargerRow["chargingMode"], string> = {
  AC: "AC",
  DC: "DC",
  UNKNOWN: "Charging mode unknown",
};

const VEHICLE_LABELS: Record<NonNullable<ChargerRow["vehicleType"]>, string> = {
  CAR: "Car",
  SCOOTER: "Scooter",
  MOTORCYCLE: "Motorcycle",
  OTHER: "Other vehicle",
};

const AVAILABILITY_LABELS: Record<ChargerRow["availability"], string> = {
  AVAILABLE: "Available",
  BUSY: "Busy",
  UNAVAILABLE: "Unavailable",
  UNKNOWN: "Availability unknown",
};

const AVAILABILITY_STYLES: Record<ChargerRow["availability"], string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  BUSY: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  UNAVAILABLE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  UNKNOWN: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * `Station.mapUrl` is validated leniently (Part 16, `src/lib/validation/
 * station.ts`) — it's documented as "raw source URL/description," not
 * guaranteed to be an actual link (e.g. `EVNP-0448`'s legacy value is the
 * literal string `"Listed"`, `docs/data-model.md §8.4`). Rendering that as
 * a clickable `<a href="Listed">` would be a broken, confusing link, not
 * a "somewhat working" one — so this only renders an anchor for a value
 * that's actually `http(s)`, and shows anything else as plain text
 * instead, same "don't imply more than the data supports" rule as every
 * other honesty check on this page.
 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Public page — never shows a soft-deleted station, regardless of who's
// viewing (matches /stations' list page rule; see src/services/
// station-service.ts). Wrapped in React's cache() so generateMetadata and
// the page component share one DB round trip instead of two — see
// node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md
// ("Memoizing data requests").
const getStation = cache((id: string) => getStationById(id, false));

export async function generateMetadata({
  params,
}: PageProps<"/stations/[id]">): Promise<Metadata> {
  const { id } = await params;
  const station = await getStation(id);
  if (!station) {
    return { title: "Station not found" };
  }
  return {
    title: station.stationName,
    description: `${station.stationName} — EV charging station in ${station.city}, ${station.district}, ${station.province}.`,
  };
}

export default async function StationDetailPage({ params }: PageProps<"/stations/[id]">) {
  const { id } = await params;
  const station = await getStation(id);
  if (!station) {
    notFound();
  }

  const user = await getOptionalUser();
  const [favorited, reviews, ownReview] = await Promise.all([
    user ? isFavorited(user.id, station.id) : Promise.resolve(false),
    listReviewsForStation(station.id),
    user ? getOwnReview(user.id, station.id) : Promise.resolve(null),
  ]);

  const hasCoordinates = station.latitude !== null && station.longitude !== null;
  const navigateHref = hasCoordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`
    : null;

  const linkClass =
    "inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

  return (
    <Container className="py-10">
      <Link
        href="/map"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Map
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{station.stationName}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {station.operator?.name ?? "Independent"}
            {station.stationId ? ` · ${station.stationId}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-semibold ${STATUS_STYLES[station.status]}`}>
            {STATUS_LABELS[station.status]}
          </span>
          <PublicVerificationBadge status={station.verificationStatus} />
        </div>
      </div>

      {station.assumptionFlag && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          This record was compiled from a best-guess/aggregated source rather than independently
          confirmed field-by-field — see the verification status below.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Location */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <MapPin className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Location
            </h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{station.address}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {station.city}, {station.district}, {station.province}
            </p>

            <div className="mt-4">
              {hasCoordinates ? (
                <StationLocationMap
                  latitude={station.latitude as number}
                  longitude={station.longitude as number}
                  stationName={station.stationName}
                />
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                  Location unavailable — no confirmed coordinates are on record for this station
                  yet.
                </div>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Coordinates</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {hasCoordinates ? `${station.latitude}, ${station.longitude}` : "Unknown"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Location verified</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {station.locationVerified ? "Yes" : "No"}
                </dd>
              </div>
              {station.mapUrl && (
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Source map link</dt>
                  <dd>
                    {isHttpUrl(station.mapUrl) ? (
                      <a
                        href={station.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        Open (search link, not a pin)
                      </a>
                    ) : (
                      <span className="font-medium text-slate-900 dark:text-white" title="Not a usable link — recorded as-is from the source data.">
                        {station.mapUrl}
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Chargers */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <Zap className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Chargers ({station.chargerSummary.count})
            </h2>
            {station.chargers.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No chargers on record for this station.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {station.chargers.map((charger) => (
                  <li
                    key={charger.id}
                    className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {charger.connectors.length > 0
                          ? charger.connectors.map((c) => c.label).join(", ")
                          : "Connector unknown"}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${AVAILABILITY_STYLES[charger.availability]}`}
                      >
                        {AVAILABILITY_LABELS[charger.availability]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {CHARGING_MODE_LABELS[charger.chargingMode]} ·{" "}
                      {charger.powerKw !== null ? `${charger.powerKw} kW` : "Power unknown"} ·{" "}
                      {charger.vehicleType ? VEHICLE_LABELS[charger.vehicleType] : "Vehicle type unknown"}
                    </p>
                    {charger.plugId && (
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        Plug ID: {charger.plugId}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Verification */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Verification
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Status</dt>
                <dd className="mt-0.5">
                  <PublicVerificationBadge status={station.verificationStatus} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Source</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {station.verificationSource ?? "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Last verified</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {station.lastVerified ? dateFormatter.format(station.lastVerified) : "Never"}
                </dd>
              </div>
            </dl>
            <VerificationChecklist checks={station} className="mt-4" />
          </section>
        </div>

        <div className="space-y-6">
          {/* Actions */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Actions</h2>
            <div className="mt-4 flex flex-col gap-3">
              {navigateHref ? (
                <a
                  href={navigateHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${linkClass} bg-emerald-600 text-white hover:bg-emerald-700`}
                >
                  <Navigation className="h-4 w-4" aria-hidden="true" />
                  Navigate
                </a>
              ) : (
                <Button type="button" disabled title="No confirmed coordinates on record yet for this station">
                  <Navigation className="h-4 w-4" aria-hidden="true" />
                  Navigate
                </Button>
              )}

              {station.contact ? (
                <a
                  href={`tel:${station.contact}`}
                  className={`${linkClass} border border-slate-300 text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:text-white dark:hover:bg-slate-800`}
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Call {station.contact}
                </a>
              ) : (
                <Button type="button" variant="outline" disabled title="No contact number on record for this station">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Call
                </Button>
              )}

              <FavoriteButton stationId={station.id} initialFavorited={favorited} isLoggedIn={user !== null} />

              <ReportButton stationId={station.id} isLoggedIn={user !== null} />
            </div>
          </section>

          {/* Operator */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Operator</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Name</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {station.operator?.name ?? "Independent / not recorded"}
                </dd>
              </div>
              {station.operator?.website && (
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Website</dt>
                  <dd>
                    <a
                      href={station.operator.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      {station.operator.website}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Rating */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <Star className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Rating
            </h2>
            {station.rating.count > 0 && station.rating.average !== null ? (
              <div className="mt-2">
                <StarRating value={station.rating.average} />
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {station.rating.average.toFixed(1)}
                  </span>{" "}
                  / 5 · {station.rating.count} review{station.rating.count === 1 ? "" : "s"}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No reviews yet — be the first to leave one below.
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="mt-6">
        <ReviewSection
          stationId={station.id}
          initialReviews={reviews}
          initialOwnReview={ownReview}
          isLoggedIn={user !== null}
        />
      </div>
    </Container>
  );
}
