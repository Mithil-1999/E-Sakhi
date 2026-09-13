"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, Save, Trash2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CANONICAL_CONNECTORS } from "@/services/connector-service";
import { ChargerCreateSchema, ChargerUpdateSchema } from "@/lib/validation/charger";
import type { AdminChargerItem } from "@/types/admin";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

const CHARGING_MODES = ["UNKNOWN", "AC", "DC"] as const;
const VEHICLE_TYPES = ["", "CAR", "SCOOTER", "MOTORCYCLE", "OTHER"] as const;
const AVAILABILITIES = ["UNKNOWN", "AVAILABLE", "BUSY", "UNAVAILABLE"] as const;

type ChargerFormState = {
  plugId: string;
  chargingMode: (typeof CHARGING_MODES)[number];
  powerKw: string;
  vehicleType: (typeof VEHICLE_TYPES)[number];
  availability: (typeof AVAILABILITIES)[number];
  connectorCodes: string[];
};

function emptyChargerForm(): ChargerFormState {
  return { plugId: "", chargingMode: "UNKNOWN", powerKw: "", vehicleType: "", availability: "UNKNOWN", connectorCodes: [] };
}

function chargerFormFrom(charger: AdminChargerItem): ChargerFormState {
  return {
    plugId: charger.plugId ?? "",
    chargingMode: charger.chargingMode,
    powerKw: charger.powerKw !== null ? String(charger.powerKw) : "",
    vehicleType: charger.vehicleType ?? "",
    availability: charger.availability,
    connectorCodes: charger.connectors.map((c) => c.code),
  };
}

function connectorText(connectors: { label: string }[]): string {
  return connectors.length > 0 ? connectors.map((c) => c.label).join(", ") : "No connector selected";
}

/**
 * Real create/edit/soft-delete for a station's chargers (Part 12) — the
 * mutation endpoints this talks to (POST /api/chargers, PUT/DELETE
 * /api/chargers/[id]) didn't exist before this part either; see
 * src/services/charger-service.ts. Only reachable from a station's own
 * admin edit page, never standalone — a charger always belongs to a
 * specific station.
 */
export function AdminChargerManager({
  stationId,
  initialChargers,
}: {
  stationId: string;
  initialChargers: AdminChargerItem[];
}) {
  const [chargers, setChargers] = useState<AdminChargerItem[]>(initialChargers);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
          <Zap className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          Chargers ({chargers.length})
        </h2>
        {!showAddForm && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowAddForm(true);
              setEditingId(null);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add charger
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="mt-4 rounded-lg border border-dashed border-emerald-300 p-4 dark:border-emerald-800">
          <ChargerEditor
            mode="create"
            stationId={stationId}
            onCancel={() => setShowAddForm(false)}
            onSaved={(charger) => {
              setChargers((prev) => [...prev, charger]);
              setShowAddForm(false);
            }}
          />
        </div>
      )}

      {chargers.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          No chargers on record for this station yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {chargers.map((charger) => (
            <li key={charger.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              {editingId === charger.id ? (
                <ChargerEditor
                  mode="edit"
                  stationId={stationId}
                  charger={charger}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => {
                    setChargers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
                    setEditingId(null);
                  }}
                />
              ) : (
                <ChargerSummaryRow
                  charger={charger}
                  onEdit={() => {
                    setEditingId(charger.id);
                    setShowAddForm(false);
                  }}
                  onDeleted={(id) => setChargers((prev) => prev.filter((c) => c.id !== id))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChargerSummaryRow({
  charger,
  onEdit,
  onDeleted,
}: {
  charger: AdminChargerItem;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Soft-delete this charger?")) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/chargers/${charger.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Delete failed.");
      onDeleted(charger.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setIsDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{connectorText(charger.connectors)}</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            {charger.chargingMode} · {charger.powerKw !== null ? `${charger.powerKw} kW` : "Power unknown"} ·{" "}
            {charger.availability} · {charger.vehicleType ?? "Vehicle type unknown"}
          </p>
          {charger.plugId && (
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Plug ID: {charger.plugId}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </Button>
          <Button type="button" variant="outline" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

type ChargerEditorProps =
  | { mode: "create"; stationId: string; charger?: undefined; onSaved: (charger: AdminChargerItem) => void; onCancel: () => void }
  | { mode: "edit"; stationId: string; charger: AdminChargerItem; onSaved: (charger: AdminChargerItem) => void; onCancel: () => void };

function ChargerEditor(props: ChargerEditorProps) {
  const { mode, onSaved, onCancel } = props;
  const [form, setForm] = useState<ChargerFormState>(mode === "edit" ? chargerFormFrom(props.charger) : emptyChargerForm());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function toggleConnector(code: string) {
    setForm((prev) => ({
      ...prev,
      connectorCodes: prev.connectorCodes.includes(code)
        ? prev.connectorCodes.filter((c) => c !== code)
        : [...prev.connectorCodes, code],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const basePayload = {
      plugId: form.plugId.trim() === "" ? null : form.plugId.trim(),
      chargingMode: form.chargingMode,
      powerKw: form.powerKw.trim() === "" ? null : form.powerKw.trim(),
      vehicleType: form.vehicleType === "" ? null : form.vehicleType,
      availability: form.availability,
      connectorCodes: form.connectorCodes,
    };

    const schema = mode === "create" ? ChargerCreateSchema : ChargerUpdateSchema;
    const payload = mode === "create" ? { ...basePayload, stationId: props.stationId } : basePayload;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid charger details.");
      return;
    }

    setIsSaving(true);
    try {
      const res =
        mode === "create"
          ? await fetch("/api/chargers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsed.data),
            })
          : await fetch(`/api/chargers/${props.charger.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsed.data),
            });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed.");
      onSaved(body.data as AdminChargerItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">Plug ID (optional)</label>
          <input
            value={form.plugId}
            onChange={(e) => setForm((f) => ({ ...f, plugId: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">Charging mode</label>
          <select
            value={form.chargingMode}
            onChange={(e) => setForm((f) => ({ ...f, chargingMode: e.target.value as ChargerFormState["chargingMode"] }))}
            className={inputClass}
          >
            {CHARGING_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">Power (kW, optional)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={form.powerKw}
            onChange={(e) => setForm((f) => ({ ...f, powerKw: e.target.value }))}
            className={inputClass}
            placeholder="Unknown"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">Vehicle type (optional)</label>
          <select
            value={form.vehicleType}
            onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value as ChargerFormState["vehicleType"] }))}
            className={inputClass}
          >
            <option value="">Unknown</option>
            {VEHICLE_TYPES.filter((v) => v !== "").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">Availability</label>
          <select
            value={form.availability}
            onChange={(e) => setForm((f) => ({ ...f, availability: e.target.value as ChargerFormState["availability"] }))}
            className={inputClass}
          >
            {AVAILABILITIES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Connectors</p>
        {/* CHAdeMO excluded — zero chargers in the current dataset use it
            (see connector-service.ts's SELECTABLE_CONNECTORS comment);
            "Unknown" stays offered here, unlike the public filter
            pickers, since an admin genuinely marking a real charger's
            connector as honestly unrecorded is a legitimate choice. */}
        <div className="mt-2 flex flex-wrap gap-3">
          {CANONICAL_CONNECTORS.filter((c) => c.code !== "CHADEMO").map((c) => (
            <label key={c.code} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.connectorCodes.includes(c.code)}
                onChange={() => toggleConnector(c.code)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSaving}>
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          {isSaving ? "Saving…" : "Save charger"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
