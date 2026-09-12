import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { AdminStationForm } from "@/components/features/admin/AdminStationForm";
import { requireAdmin } from "@/lib/auth/session";
import { listOperators } from "@/services/operator-service";

export const metadata: Metadata = {
  title: "New Station",
};

export default async function NewStationPage() {
  // src/proxy.ts already redirects non-admins as a UX shortcut, but this
  // is the real, server-verified check. See docs/architecture.md §3/§10.
  await requireAdmin();

  const { data: operators } = await listOperators({ page: 1, pageSize: 100 });

  return (
    <Container className="max-w-3xl py-10">
      <Link
        href="/admin/stations"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Manage Stations
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">New Station</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Chargers can be added once the station is created.
      </p>

      <div className="mt-6">
        <AdminStationForm mode="create" operators={operators.map((o) => ({ id: o.id, name: o.name }))} />
      </div>
    </Container>
  );
}
