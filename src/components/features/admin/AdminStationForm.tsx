"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NEPAL_PROVINCES } from "@/lib/config/nepal-provinces";
import { StationCreateSchema, StationUpdateSchema } from "@/lib/validation/station";
import type { AdminOperatorOption, AdminStationDetail } from "@/types/admin";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

const STATUS_OPTIONS = ["UNKNOWN", "ACTIVE", "INACTIVE"] as const;
const VERIFICATION_OPTIONS = [
  "UNKNOWN",
  "ASSUMED",
  "UNVERIFIED",
  "NEEDS_REVIEW",
  "PARTIALLY_VERIFIED",
  "VERIFIED",
] as const;

type FormState = {
  stationId: string;
  stationName: string;
  operatorId: string;
  province: string;
  district: string;
  city: string;
  address: string;
  contact: string;
  latitude: string;
  longitude: string;
  mapUrl: string;
  status: (typeof STATUS_OPTIONS)[number];
  verificationStatus: (typeof VERIFICATION_OPTIONS)[number];
  assumptionFlag: boolean;
  verificationSource: string;
  lastVerified: string;
  locationVerified: boolean;
  connectorVerified: boolean;
  powerVerified: boolean;
  contactVerified: boolean;
  availabilityVerified: boolean;
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  // "2026-01-02T03:04:05.000Z" -> "2026-01-02T03:04", what <input
  // type="datetime-local"> expects. Loses seconds/timezone precision,
  // which is fine for a "roughly when" verification timestamp.
  return iso.slice(0, 16);
}

function emptyForm(): FormState {
  return {
    stationId: "",
    stationName: "",
    operatorId: "",
    province: "",
    district: "",
    city: "",
    address: "",
    contact: "",
    latitude: "",
    longitude: "",
    mapUrl: "",
    status: "UNKNOWN",
    verificationStatus: "UNKNOWN",
    assumptionFlag: false,
    verificationSource: "",
    lastVerified: "",
    locationVerified: false,
    connectorVerified: false,
    powerVerified: false,
    contactVerified: false,
    availabilityVerified: false,
  };
}

function formFromStation(station: AdminStationDetail): FormState {
  return {
    stationId: station.stationId ?? "",
    stationName: station.stationName,
    operatorId: station.operator?.id ?? "",
    province: station.province,
    district: station.district,
    city: station.city,
    address: station.address,
    contact: station.contact ?? "",
    latitude: station.latitude !== null ? String(station.latitude) : "",
    longitude: station.longitude !== null ? String(station.longitude) : "",
    mapUrl: station.mapUrl ?? "",
    status: station.status,
    verificationStatus: station.verificationStatus,
    assumptionFlag: station.assumptionFlag,
    verificationSource: station.verificationSource ?? "",
    lastVerified: toDatetimeLocal(station.lastVerified),
    locationVerified: station.locationVerified,
    connectorVerified: station.connectorVerified,
    powerVerified: station.powerVerified,
    contactVerified: station.contactVerified,
    availabilityVerified: station.availabilityVerified,
  };
}

/** "" -> null (clear the field); anything else -> the trimmed string. Blank always means "clear," since this form always resends the full current value, never a diff. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

type AdminStationFormProps =
  | { mode: "create"; station?: undefined; operators: AdminOperatorOption[] }
  | { mode: "edit"; station: AdminStationDetail; operators: AdminOperatorOption[] };

/**
 * Create/edit station form (Part 12) — a controlled form posting to the
 * already-existing POST/PUT /api/stations endpoints (Part 04), validated
 * client-side with the exact same Zod schemas those routes use
 * (src/lib/validation/station.ts is safe to import from a Client
 * Component — no "server-only" — per docs/architecture.md §1's "shared
 * Zod schemas between client forms and server handlers" rule). Server
 * validation is still the real authority; this is instant UX feedback,
 * not a second source of truth.
 */
export function AdminStationForm(props: AdminStationFormProps) {
  const { mode, operators } = props;
  const router = useRouter();

  const [form, setForm] = useState<FormState>(
    mode === "edit" ? formFromStation(props.station) : emptyForm()
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccessMessage(null);
  }

  function buildPayload() {
    // StationCreateSchema's operatorId is optional but NOT nullable
    // (undefined = "no operator"); StationUpdateSchema's is nullable
    // (null = "disconnect the current operator") — same field, two
    // different "empty" representations depending on mode, so this can't
    // be a shared blankToNull() call the way contact/mapUrl/etc. are.
    const operatorId: string | null | undefined =
      form.operatorId === "" ? (mode === "create" ? undefined : null) : form.operatorId;

    const base = {
      stationName: form.stationName,
      operatorId,
      province: form.province,
      district: form.district,
      city: form.city,
      address: form.address,
      contact: blankToNull(form.contact),
      latitude: blankToNull(form.latitude),
      longitude: blankToNull(form.longitude),
      mapUrl: blankToNull(form.mapUrl),
      status: form.status,
      verificationStatus: form.verificationStatus,
      assumptionFlag: form.assumptionFlag,
      verificationSource: blankToNull(form.verificationSource),
    };

    if (mode === "create") {
      return { ...base, stationId: blankToNull(form.stationId) ?? undefined };
    }

    return {
      ...base,
      lastVerified: form.lastVerified === "" ? null : new Date(form.lastVerified).toISOString(),
      locationVerified: form.locationVerified,
      connectorVerified: form.connectorVerified,
      powerVerified: form.powerVerified,
      contactVerified: form.contactVerified,
      availabilityVerified: form.availabilityVerified,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setFieldErrors({});

    const payload = buildPayload();
    const schema = mode === "create" ? StationCreateSchema : StationUpdateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in errors)) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      setFormError("Fix the highlighted fields and try again.");
      return;
    }

    setIsSaving(true);
    try {
      const res =
        mode === "create"
          ? await fetch("/api/stations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsed.data),
            })
          : await fetch(`/api/stations/${props.station.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsed.data),
            });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error?.message ?? "Save failed.");
      }

      if (mode === "create") {
        // Chargers can only be added once the station exists — send the
        // admin straight to its edit page to continue there.
        router.push(`/admin/stations/${body.data.id}/edit`);
        return;
      }

      setSuccessMessage("Saved.");
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (mode !== "edit") return;
    if (
      !window.confirm(
        `Soft-delete "${props.station.stationName}"? Its chargers will be soft-deleted too. This can be reversed only directly in the database.`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/stations/${props.station.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Delete failed.");
      router.push("/admin/stations");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Delete failed.");
      setIsDeleting(false);
    }
  }

  const isDeletedStation = mode === "edit" && props.station.isDeleted;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isDeletedStation && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          This station is soft-deleted. You can still view its fields below, but saving is disabled
          — the API refuses updates to a deleted station (see PUT /api/stations/[id]).
        </p>
      )}

      <fieldset disabled={isDeletedStation} className="space-y-6 disabled:opacity-60">
        {/* Core fields */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Station details</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {mode === "create" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  External station ID (optional)
                </label>
                <input
                  value={form.stationId}
                  onChange={(e) => set("stationId", e.target.value)}
                  className={inputClass}
                  placeholder="Leave blank for an admin-created station"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Station name
              </label>
              <input
                value={form.stationName}
                onChange={(e) => set("stationName", e.target.value)}
                className={inputClass}
              />
              {fieldErrors.stationName && <FieldError message={fieldErrors.stationName} />}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Operator
              </label>
              <select
                value={form.operatorId}
                onChange={(e) => set("operatorId", e.target.value)}
                className={inputClass}
              >
                <option value="">Independent / none</option>
                {operators.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Province
              </label>
              <select
                value={form.province}
                onChange={(e) => set("province", e.target.value)}
                className={inputClass}
              >
                <option value="">Select a province</option>
                {NEPAL_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {fieldErrors.province && <FieldError message={fieldErrors.province} />}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">District</label>
              <input value={form.district} onChange={(e) => set("district", e.target.value)} className={inputClass} />
              {fieldErrors.district && <FieldError message={fieldErrors.district} />}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">City</label>
              <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputClass} />
              {fieldErrors.city && <FieldError message={fieldErrors.city} />}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Address</label>
              <input value={form.address} onChange={(e) => set("address", e.target.value)} className={inputClass} />
              {fieldErrors.address && <FieldError message={fieldErrors.address} />}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Contact (optional)
              </label>
              <input value={form.contact} onChange={(e) => set("contact", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Station status
              </label>
              <select value={form.status} onChange={(e) => set("status", e.target.value as FormState["status"])} className={inputClass}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Location — coordinates never invented */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Location</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Leave latitude/longitude blank unless you have a real, confirmed coordinate — never
            estimate or guess one. A blank value is saved as unknown, not a fabricated 0,0.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Latitude (optional)
              </label>
              <input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => set("latitude", e.target.value)}
                className={inputClass}
                placeholder="Unknown"
              />
              {fieldErrors.latitude && <FieldError message={fieldErrors.latitude} />}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Longitude (optional)
              </label>
              <input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => set("longitude", e.target.value)}
                className={inputClass}
                placeholder="Unknown"
              />
              {fieldErrors.longitude && <FieldError message={fieldErrors.longitude} />}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Source map link (optional)
              </label>
              <input value={form.mapUrl} onChange={(e) => set("mapUrl", e.target.value)} className={inputClass} placeholder="https://..." />
              {fieldErrors.mapUrl && <FieldError message={fieldErrors.mapUrl} />}
            </div>
          </div>
        </section>

        {/* Verification — id="verification" is a real anchor target: the
            verification queue (Part 13, /admin/verification) links its
            "Edit" action straight here (`#verification`) instead of
            duplicating this section. */}
        <section
          id="verification"
          className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Verification</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Verification status
              </label>
              <select
                value={form.verificationStatus}
                onChange={(e) => set("verificationStatus", e.target.value as FormState["verificationStatus"])}
                className={inputClass}
              >
                {VERIFICATION_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Changing this from its current value is written to VerificationLog automatically.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Verification source (optional)
              </label>
              <input
                value={form.verificationSource}
                onChange={(e) => set("verificationSource", e.target.value)}
                className={inputClass}
                placeholder="Who/what confirmed this record"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.assumptionFlag}
                onChange={(e) => set("assumptionFlag", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              This record is a compiled/best-guess assumption, not independently confirmed
            </label>

            {mode === "edit" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Last verified (optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={form.lastVerified}
                    onChange={(e) => set("lastVerified", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Per-field verified checklist
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["locationVerified", "Location"],
                        ["connectorVerified", "Connectors"],
                        ["powerVerified", "Power"],
                        ["contactVerified", "Contact"],
                        ["availabilityVerified", "Availability"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={form[key]}
                          onChange={(e) => set(key, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </fieldset>

      {formError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {formError}
        </p>
      )}
      {successMessage && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {successMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={isSaving || isDeletedStation}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSaving ? "Saving…" : mode === "create" ? "Create station" : "Save changes"}
        </Button>

        {mode === "edit" && !isDeletedStation && (
          <Button type="button" variant="outline" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
            {isDeleting ? "Deleting…" : "Soft-delete station"}
          </Button>
        )}
      </div>
    </form>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p>;
}
