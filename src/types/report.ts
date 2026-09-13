/**
 * Client-facing report types — mirror the shape report-service.ts's
 * toReportQueueItem()/the report endpoints actually return, kept separate
 * from that "server-only" module so Client Components (ReportButton.tsx,
 * ReportQueueList.tsx) can import the type without pulling in server-only
 * code, same pattern as station.ts vs station-service.ts.
 */
export type ReportType =
  | "WRONG_LOCATION"
  | "WRONG_CONNECTOR"
  | "WRONG_POWER"
  | "STATION_UNAVAILABLE"
  | "WRONG_CONTACT"
  | "DUPLICATE_STATION"
  | "OTHER";

export type ReportStatus = "PENDING" | "REVIEWING" | "RESOLVED" | "REJECTED";

export type AdminReportItem = {
  id: string;
  reportType: ReportType;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  user: { id: string; name: string | null };
  station: { id: string; stationName: string; city: string; district: string; province: string };
};
