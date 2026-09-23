/**
 * The Recommendation Engine's "Open"/"Closed" label — a simple, fixed
 * operating-hours assumption (06:00–20:00, Nepal time), NOT real-time
 * charger availability. This project has no real-time availability data
 * source (see ChargerAvailability's mostly-UNKNOWN state everywhere
 * else in the app); "Open" here only ever means "within this project's
 * assumed opening hours," stated as exactly that, never implied to mean
 * a charger is confirmed free to use right now. Applies uniformly to
 * every station in a given response — it's a function of the current
 * time only, not of any per-station data.
 */

const OPEN_FROM_MINUTES = 6 * 60; // 06:00
const OPEN_UNTIL_MINUTES = 20 * 60; // 20:00 (exclusive — 20:00 itself is Closed)

const NEPAL_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kathmandu",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** Current time in Asia/Kathmandu, as minutes since midnight. */
function nepalMinutesSinceMidnight(referenceDate: Date): number {
  const parts = NEPAL_TIME_FORMATTER.formatToParts(referenceDate);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export type StationOperatingStatus = "OPEN" | "CLOSED";

/**
 * "OPEN" 06:00–19:59, "CLOSED" 20:00–05:59, Nepal local time — see the
 * module doc comment above for what this does and doesn't claim.
 */
export function getStationOperatingStatus(referenceDate: Date = new Date()): StationOperatingStatus {
  const minutes = nepalMinutesSinceMidnight(referenceDate);
  const isOpen = minutes >= OPEN_FROM_MINUTES && minutes < OPEN_UNTIL_MINUTES;
  return isOpen ? "OPEN" : "CLOSED";
}
