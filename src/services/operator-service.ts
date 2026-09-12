import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildPaginationMeta } from "@/lib/validation/pagination";
import type { OperatorListQuery } from "@/lib/validation/operator";

/**
 * Operators are read-only through the API in this part — creating/editing
 * operators is admin station management (Part 12). See docs/architecture.md §2.
 */

/**
 * Find-or-create an Operator by name — the same "upsert by name" logic
 * prisma/seed.ts's own seedOperators() already uses (batch-oriented,
 * still local to that script), extracted here as a single-item version
 * for the admin Excel import tool (Part 14), which resolves one
 * station's operator at a time when applying an approved change. Purely
 * additive: never overwrites an existing Operator's other fields.
 */
export async function resolveOrCreateOperatorId(name: string): Promise<string> {
  const operator = await prisma.operator.upsert({
    where: { name },
    create: { name },
    update: {},
  });
  return operator.id;
}

export async function listOperators(query: OperatorListQuery) {
  const where: Prisma.OperatorWhereInput = query.search
    ? { name: { contains: query.search, mode: "insensitive" } }
    : {};

  const [total, operators] = await Promise.all([
    prisma.operator.count({ where }),
    prisma.operator.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        name: true,
        contact: true,
        website: true,
        logo: true,
        _count: { select: { stations: { where: { isDeleted: false } } } },
      },
    }),
  ]);

  return {
    data: operators.map((operator) => ({
      id: operator.id,
      name: operator.name,
      contact: operator.contact,
      website: operator.website,
      logo: operator.logo,
      stationCount: operator._count.stations,
    })),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}
