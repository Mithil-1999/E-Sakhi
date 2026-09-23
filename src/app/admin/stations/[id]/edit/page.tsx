import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { AdminStationForm } from "@/components/features/admin/AdminStationForm";
import { AdminChargerManager } from "@/components/features/admin/AdminChargerManager";
import { VerificationLogTable } from "@/components/features/admin/VerificationLogTable";
import { requireAdmin } from "@/lib/auth/session";
import { getStationById } from "@/services/station-service";
import { listOperators } from "@/services/operator-service";
import { getVerificationLogForStation } from "@/services/admin-verification-service";
import type { AdminStationDetail } from "@/types/admin";

export const metadata: Metadata = {
  title: "Edit Station",
};

export default async function EditStationPage({ params }: PageProps<"/admin/stations/[id]/edit">) {
  // src/proxy.ts already redirects non-admins as a UX shortcut, but this
  // is the real, server-verified check. See docs/architecture.md §3/§10.
  await requireAdmin();

  const { id } = await params;

  // includeDeleted: true — an admin managing stations needs to be able to
  // open a soft-deleted one (from the "Show soft-deleted" list toggle) to
  // see its state, even though AdminStationForm then disables editing it.
  const [station, { data: operators }, verificationLog] = await Promise.all([
    getStationById(id, true),
    listOperators({ page: 1, pageSize: 100 }),
    getVerificationLogForStation(id),
  ]);

  if (!station) {
    notFound();
  }

  // The service layer returns real Date objects; the admin form/charger
  // manager are Client Components typed against src/types/admin.ts's
  // client-facing shape (ISO strings) — serialize here, same pattern as
  // every other Server->Client handoff in this app (e.g. /stations/page.tsx).
  const clientStation: AdminStationDetail = {
    id: station.id,
    stationId: station.stationId,
    stationName: station.stationName,
    operator: station.operator ? { id: station.operator.id, name: station.operator.name } : null,
    province: station.province,
    district: station.district,
    city: station.city,
    address: station.address,
    contact: station.contact,
    latitude: station.latitude,
    longitude: station.longitude,
    mapUrl: station.mapUrl,
    status: station.status,
    verificationStatus: station.verificationStatus,
    assumptionFlag: station.assumptionFlag,
    verificationSource: station.verificationSource,
    lastVerified: station.lastVerified ? station.lastVerified.toISOString() : null,
    locationVerified: station.locationVerified,
    connectorVerified: station.connectorVerified,
    powerVerified: station.powerVerified,
    contactVerified: station.contactVerified,
    availabilityVerified: station.availabilityVerified,
    isDeleted: station.isDeleted,
    chargers: station.chargers.map((charger) => ({
      id: charger.id,
      stationId: station.id,
      plugId: charger.plugId,
      chargingMode: charger.chargingMode,
      powerKw: charger.powerKw,
      vehicleType: charger.vehicleType,
      availability: charger.availability,
      connectors: charger.connectors,
      isDeleted: false,
      // Not selected by stationDetailInclude (it already filters to
      // non-deleted chargers) — these two are unused by the charger
      // manager UI, placeholder timestamps are harmless.
      createdAt: station.createdAt.toISOString(),
      updatedAt: station.updatedAt.toISOString(),
    })),
  };

  return (
    <Container className="max-w-3xl py-10">
      <Link
        href="/admin/stations"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Manage Stations
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">
        Edit {clientStation.stationName}
      </h1>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Created by: {station.createdBy?.name ?? "Not on record (seeded before audit tracking)"}
        {" · "}
        Last updated by: {station.updatedBy?.name ?? "Not on record"}
      </p>

      <div className="mt-6 space-y-6">
        <AdminStationForm
          mode="edit"
          station={clientStation}
          operators={operators.map((o) => ({ id: o.id, name: o.name }))}
        />

        {!clientStation.isDeleted && (
          <AdminChargerManager stationId={clientStation.id} initialChargers={clientStation.chargers} />
        )}

        {/* Full history for this one station — the admin dashboard's
            (Part 11) feed is platform-wide and capped at 15; this is
            everything on record for this station, via the verification
            queue (Part 13). */}
        <section
          id="history"
          className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <History className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Verification history
          </h2>
          <VerificationLogTable rows={verificationLog} emptyMessage="No verification changes have been logged for this station yet." />
        </section>
      </div>
    </Container>
  );
}
