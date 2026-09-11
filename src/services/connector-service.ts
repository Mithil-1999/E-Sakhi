/**
 * Connector normalization service.
 *
 * Connector type is a lookup table + alias table (see docs/data-model.md §3),
 * not a hard enum, specifically so raw source strings like "CCS-2" or
 * "CCS Type 2" can be mapped onto one canonical connector without a code
 * change. This module owns that mapping logic so both the initial dataset
 * import (prisma/seed.ts, Part 02) and the future admin Excel-import tool
 * (Part 14) normalize connectors the same way.
 */

export type CanonicalConnectorSeed = {
  code: string;
  label: string;
  aliases: string[];
};

/**
 * The canonical connector set. `aliases` includes the canonical label/code
 * itself plus known real-world spelling variants — not just what the initial
 * dataset happens to contain, so admin-entered data normalizes correctly too.
 */
export const CANONICAL_CONNECTORS: CanonicalConnectorSeed[] = [
  {
    code: "CCS2",
    label: "CCS2",
    aliases: ["CCS2", "CCS-2", "CCS 2", "CCS Type 2", "CCS"],
  },
  {
    code: "GBT",
    label: "GB/T",
    aliases: ["GB/T", "GBT", "GB-T", "GB T"],
  },
  {
    code: "TYPE2",
    label: "Type 2",
    aliases: ["Type 2", "Type2", "Type-2", "Type 2 (Mennekes)"],
  },
  {
    code: "CHADEMO",
    label: "CHAdeMO",
    aliases: ["CHAdeMO", "CHAdeMo", "Chademo", "CHADEMO"],
  },
  {
    code: "OTHER",
    label: "Other",
    aliases: ["Other"],
  },
  {
    code: "UNKNOWN",
    label: "Unknown",
    aliases: ["Unknown"],
  },
];

function normalizeAliasText(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build a normalized-alias-text -> canonical code lookup map from the
 * connector seed list. Used by the seed script directly; the live app
 * builds the same kind of map from the ConnectorAlias table at query time.
 */
export function buildAliasLookup(
  connectors: CanonicalConnectorSeed[] = CANONICAL_CONNECTORS
): Map<string, string> {
  const map = new Map<string, string>();
  for (const connector of connectors) {
    for (const alias of connector.aliases) {
      map.set(normalizeAliasText(alias), connector.code);
    }
  }
  return map;
}

/**
 * Split a raw source connector string on the multi-value separator.
 * The real dataset uses ';' for a single plug that offers more than one
 * connector type (e.g. "CCS2;GB/T" for a dual-head DC charger) — see
 * docs/data-model.md's Charger/ChargerConnector design.
 *
 * Deliberately does NOT split on '/' or ',': '/' is part of a connector's
 * own canonical name ("GB/T"), not a separator, and splitting on it would
 * shred that name into "GB" + "T". Only ';' is a genuine multi-value
 * separator in the source data.
 */
export function splitConnectorTokens(raw: string): string[] {
  return raw
    .split(";")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export type ConnectorResolution = {
  code: string;
  matched: boolean;
  rawToken: string;
};

/**
 * Resolve a single raw connector token to a canonical connector code.
 * An unmatched token resolves to "UNKNOWN" with `matched: false` rather
 * than being dropped or guessed into an arbitrary canonical value — see
 * the no-fabrication rule in README.md / docs/data-model.md.
 */
export function resolveConnectorToken(
  rawToken: string,
  aliasLookup: Map<string, string>
): ConnectorResolution {
  const code = aliasLookup.get(normalizeAliasText(rawToken));
  if (code) {
    return { code, matched: true, rawToken };
  }
  return { code: "UNKNOWN", matched: false, rawToken };
}
