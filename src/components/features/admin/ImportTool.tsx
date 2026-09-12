"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type {
  ImportPreview,
  ImportStationPreview,
  ImportChargerPreview,
  ImportApplyEntryResult,
} from "@/types/import";

/**
 * The Excel import tool's UI (Part 14) — upload, review, approve. See
 * docs/data-import.md for the full model this implements. This
 * component never applies anything on its own initiative: every write
 * traces back to a checkbox a human explicitly left checked.
 */
export function ImportTool() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [applyResults, setApplyResults] = useState<ImportApplyEntryResult[] | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const approvable = useMemo(
    () => preview?.entries.filter((e) => e.action !== "skip") ?? [],
    [preview]
  );

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    setPreview(null);
    setApplyResults(null);
    setApplyError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/preview", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Could not read this file.");
      const data = body.data as ImportPreview;
      setPreview(data);
      // Default: everything not skipped starts checked — the admin
      // unchecks what they don't want, rather than hunting for a
      // "select all" on a long list.
      setApproved(new Set(data.entries.filter((e) => e.action !== "skip").map(entryKey)));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not read this file.");
    } finally {
      setIsUploading(false);
    }
  }

  function toggle(key: string) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setAll(checked: boolean) {
    setApproved(checked ? new Set(approvable.map(entryKey)) : new Set());
  }

  async function handleApply() {
    if (!preview) return;
    const entries = preview.entries
      .filter((e) => e.action !== "skip" && approved.has(entryKey(e)))
      .map(toApplyPayload);

    if (entries.length === 0) return;

    setIsApplying(true);
    setApplyError(null);
    try {
      const res = await fetch("/api/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Apply failed.");
      setApplyResults(body.data as ImportApplyEntryResult[]);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Apply failed.");
    } finally {
      setIsApplying(false);
    }
  }

  const approvedCount = [...approved].length;

  return (
    <div className="space-y-6">
      {/* Upload */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          Upload a spreadsheet
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Same column layout as the original dataset (an <code>EV_Stations</code> sheet). Nothing is
          written until you approve specific changes below.
        </p>
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-6 text-sm text-slate-600 hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-emerald-900/10">
          <Upload className="h-5 w-5" aria-hidden="true" />
          {isUploading ? "Reading file…" : "Choose an .xlsx file"}
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {uploadError && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {uploadError}
          </p>
        )}
      </section>

      {preview && (
        <>
          {/* Summary */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{preview.fileName}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {preview.totalRowsRead} plug rows read, grouped into {preview.stationGroups} stations.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SummaryStat label="New stations" value={preview.summary.toCreate} />
              <SummaryStat label="Stations with changes" value={preview.summary.toUpdate} />
              <SummaryStat label="Skipped" value={preview.summary.skipped} />
              <SummaryStat label="Unchanged" value={preview.summary.unchanged} />
            </dl>

            {preview.consistencyIssues.length > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {preview.consistencyIssues.length} station-level inconsistency
                  {preview.consistencyIssues.length === 1 ? "" : "ies"} found across a station&apos;s own
                  plug rows in this file (the first row&apos;s value was used) — informational, not
                  blocking.
                </span>
              </div>
            )}
          </section>

          {approvable.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex gap-3 text-sm">
                <button type="button" onClick={() => setAll(true)} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                  Select all
                </button>
                <button type="button" onClick={() => setAll(false)} className="font-medium text-slate-500 hover:underline dark:text-slate-400">
                  Select none
                </button>
              </div>
              <Button type="button" onClick={handleApply} disabled={isApplying || approvedCount === 0}>
                <Check className="h-4 w-4" aria-hidden="true" />
                {isApplying ? "Applying…" : `Apply ${approvedCount} approved change${approvedCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}

          {applyError && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {applyError}
            </p>
          )}
          {applyResults && <ApplyResultsSummary results={applyResults} />}

          {/* Entries */}
          <ul className="space-y-4">
            {preview.entries.map((entry) => (
              <li key={entryKey(entry)}>
                <EntryCard
                  entry={entry}
                  approved={entry.action !== "skip" && approved.has(entryKey(entry))}
                  onToggle={() => toggle(entryKey(entry))}
                  result={applyResults?.find((r) => r.externalStationId === entryExternalId(entry))}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function entryKey(entry: ImportStationPreview): string {
  return entry.externalStationId;
}

function entryExternalId(entry: ImportStationPreview): string {
  return entry.externalStationId;
}

function toApplyPayload(entry: ImportStationPreview) {
  if (entry.action === "skip") {
    // Callers only ever pass entries already filtered to action !== "skip"
    // (see handleApply above) — this is just what lets TypeScript narrow
    // the union below instead of a real runtime path.
    throw new Error("A skipped entry can't be sent to apply.");
  }
  if (entry.action === "create") {
    return {
      action: "create" as const,
      externalStationId: entry.externalStationId,
      station: entry.station,
      chargers: entry.chargers
        .filter((c): c is Extract<ImportChargerPreview, { action: "create" }> => c.action === "create")
        .map((c) => ({
          action: "create" as const,
          externalPlugId: c.externalPlugId,
          chargingMode: c.chargingMode,
          powerKw: c.powerKw,
          connectorCodes: c.connectorCodes,
        })),
    };
  }
  // update
  return {
    action: "update" as const,
    stationDbId: entry.stationDbId,
    externalStationId: entry.externalStationId,
    station: entry.station,
    chargers: entry.chargers
      .filter(
        (c): c is Extract<ImportChargerPreview, { action: "create" | "update" }> =>
          c.action === "create" || c.action === "update"
      )
      .map((c) =>
        c.action === "create"
          ? {
              action: "create" as const,
              externalPlugId: c.externalPlugId,
              chargingMode: c.chargingMode,
              powerKw: c.powerKw,
              connectorCodes: c.connectorCodes,
            }
          : {
              action: "update" as const,
              chargerDbId: c.chargerDbId,
              externalPlugId: c.externalPlugId,
              chargingMode: c.chargingMode,
              powerKw: c.powerKw,
              connectorCodes: c.connectorCodes,
            }
      ),
  };
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function ApplyResultsSummary({ results }: { results: ImportApplyEntryResult[] }) {
  const applied = results.filter((r) => r.station.status === "applied").length;
  const skipped = results.filter((r) => r.station.status === "skipped").length;
  const failed = results.filter((r) => r.station.status === "failed").length;
  return (
    <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
      Done: {applied} station{applied === 1 ? "" : "s"} applied
      {skipped > 0 ? `, ${skipped} skipped` : ""}
      {failed > 0 ? `, ${failed} failed` : ""} — see each card below for its own result and any charger-level
      detail.
    </p>
  );
}

function EntryCard({
  entry,
  approved,
  onToggle,
  result,
}: {
  entry: ImportStationPreview;
  approved: boolean;
  onToggle: () => void;
  result?: ImportApplyEntryResult;
}) {
  const stationName = entry.action === "skip" ? entry.stationName : entry.action === "create" ? entry.station.stationName : entry.stationName;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {entry.action !== "skip" && !result && (
            <input
              type="checkbox"
              checked={approved}
              onChange={onToggle}
              className="mt-1 h-4 w-4 rounded border-slate-300"
              aria-label={`Approve changes for ${stationName}`}
            />
          )}
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{stationName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {entry.externalStationId} ·{" "}
              {entry.action === "create" ? "New station" : entry.action === "update" ? "Update" : "Skipped"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {entry.action === "update" && entry.isAdminVerified && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Admin-verified station
            </span>
          )}
          {result && <ResultBadge result={result.station} />}
        </div>
      </div>

      {entry.action === "skip" && (
        <p className="mt-3 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          {entry.reason}
        </p>
      )}

      {entry.action === "update" && entry.fieldChanges.length > 0 && (
        <FieldChangeList changes={entry.fieldChanges} />
      )}

      {entry.action === "create" && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Location</dt>
            <dd className="font-medium text-slate-900 dark:text-white">
              {entry.station.city}, {entry.station.district}, {entry.station.province}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Operator</dt>
            <dd className="font-medium text-slate-900 dark:text-white">{entry.station.operatorName ?? "Independent"}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Verification status</dt>
            <dd className="font-medium text-slate-900 dark:text-white">{entry.station.verificationStatus}</dd>
          </div>
        </dl>
      )}

      {entry.action !== "skip" && entry.chargers.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {entry.chargers.map((charger, i) => (
            <ChargerRow key={i} charger={charger} result={result?.chargers[i]} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChargerRow({
  charger,
  result,
}: {
  charger: ImportChargerPreview;
  result?: ImportApplyEntryResult["chargers"][number];
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          Plug {charger.externalPlugId ?? "(none)"} —{" "}
          {charger.action === "create" ? "new charger" : charger.action === "update" ? "update" : "skipped"}
        </span>
        {result && <ResultBadge result={result} />}
      </div>
      {charger.action === "skip" ? (
        <p className="mt-1 text-slate-500 dark:text-slate-400">{charger.reason}</p>
      ) : charger.action === "update" ? (
        <FieldChangeList changes={charger.fieldChanges} compact />
      ) : (
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          {charger.chargingMode} · {charger.powerKw !== null ? `${charger.powerKw} kW` : "power unknown"} ·{" "}
          {charger.connectorLabels.join(", ")}
        </p>
      )}
    </div>
  );
}

function FieldChangeList({
  changes,
  compact = false,
}: {
  changes: { field: string; label: string; oldValue: string | null; newValue: string | null }[];
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "mt-1 space-y-0.5" : "mt-3 space-y-1 text-sm"}>
      {changes.map((change) => (
        <li key={change.field} className="text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300">{change.label}:</span>{" "}
          <span className="line-through">{change.oldValue ?? "(none)"}</span>{" "}
          <span aria-hidden="true">→</span> {change.newValue ?? "(none)"}
        </li>
      ))}
    </ul>
  );
}

function ResultBadge({ result }: { result: { status: "applied" | "skipped" | "failed"; reason?: string } }) {
  const styles = {
    applied: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    skipped: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <span
      title={result.reason}
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[result.status]}`}
    >
      {result.status}
    </span>
  );
}
