import { CheckCircle2, Circle } from "lucide-react";

/**
 * The five per-field verified booleans every Station carries (docs/
 * architecture.md §5). Extracted from the station detail page (Part 07)
 * so the verification queue (Part 13) renders the identical checklist
 * instead of a second copy — see docs/architecture.md §4's "reuse, don't
 * rebuild" pattern.
 */
export type VerificationChecks = {
  locationVerified: boolean;
  connectorVerified: boolean;
  powerVerified: boolean;
  contactVerified: boolean;
  availabilityVerified: boolean;
};

const CHECK_ITEMS: { key: keyof VerificationChecks; label: string }[] = [
  { key: "locationVerified", label: "Location" },
  { key: "connectorVerified", label: "Connectors" },
  { key: "powerVerified", label: "Power" },
  { key: "contactVerified", label: "Contact" },
  { key: "availabilityVerified", label: "Availability" },
];

export function VerificationChecklist({
  checks,
  className = "",
}: {
  checks: VerificationChecks;
  className?: string;
}) {
  return (
    <ul className={`grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 ${className}`}>
      {CHECK_ITEMS.map(({ key, label }) => {
        const verified = checks[key];
        return (
          <li
            key={key}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${
              verified
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {verified ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {label}
          </li>
        );
      })}
    </ul>
  );
}
