import type { Prisma } from "@prisma/client";

/**
 * Prisma's Decimal type serializes to a JSON *string* by default (it has
 * its own toJSON()), which is a common surprise for API consumers
 * expecting a number. Every Decimal field we return through /api/* goes
 * through this first so latitude/longitude/power_kw come back as real
 * JSON numbers.
 */
export function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value.toNumber();
}
