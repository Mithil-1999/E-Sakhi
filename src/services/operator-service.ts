import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildPaginationMeta } from "@/lib/validation/pagination";
import type { OperatorListQuery } from "@/lib/validation/operator";

/**
 * Operators are read-only through the API in this part — creating/editing
 * operators is admin station management (Part 12). See docs/architecture.md §2.
 */

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
