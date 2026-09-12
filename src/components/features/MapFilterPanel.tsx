import { NEPAL_PROVINCES } from "@/lib/config/nepal-provinces";
import { CANONICAL_CONNECTORS } from "@/services/connector-service";

export type MapFilters = {
  search: string;
  province: string;
  connector: string;
  chargingMode: string;
  status: string;
};

export const EMPTY_MAP_FILTERS: MapFilters = {
  search: "",
  province: "",
  connector: "",
  chargingMode: "",
  status: "",
};

const CHARGING_MODES = ["AC", "DC", "UNKNOWN"] as const;
const STATUSES = ["ACTIVE", "INACTIVE", "UNKNOWN"] as const;

const selectClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

export function MapFilterPanel({
  filters,
  onChange,
}: {
  filters: MapFilters;
  onChange: (next: MapFilters) => void;
}) {
  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  function set<K extends keyof MapFilters>(key: K, value: MapFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="map-search" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Search
        </label>
        <input
          id="map-search"
          type="text"
          placeholder="Station, city, district..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          className={selectClass}
        />
      </div>

      <div>
        <label htmlFor="map-province" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Province
        </label>
        <select
          id="map-province"
          value={filters.province}
          onChange={(e) => set("province", e.target.value)}
          className={selectClass}
        >
          <option value="">All provinces</option>
          {NEPAL_PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="map-connector" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Connector
        </label>
        <select
          id="map-connector"
          value={filters.connector}
          onChange={(e) => set("connector", e.target.value)}
          className={selectClass}
        >
          <option value="">All connectors</option>
          {CANONICAL_CONNECTORS.filter((c) => c.code !== "UNKNOWN").map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="map-mode" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Charging mode
        </label>
        <select
          id="map-mode"
          value={filters.chargingMode}
          onChange={(e) => set("chargingMode", e.target.value)}
          className={selectClass}
        >
          <option value="">AC or DC</option>
          {CHARGING_MODES.map((m) => (
            <option key={m} value={m}>
              {m === "UNKNOWN" ? "Unknown" : m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="map-status" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Station status
        </label>
        <select
          id="map-status"
          value={filters.status}
          onChange={(e) => set("status", e.target.value)}
          className={selectClass}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "ACTIVE" ? "Active" : s === "INACTIVE" ? "Inactive" : "Unknown"}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_MAP_FILTERS)}
          className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
