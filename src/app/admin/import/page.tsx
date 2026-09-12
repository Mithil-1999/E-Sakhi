import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ImportTool } from "@/components/features/admin/ImportTool";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Import Data",
};

export default async function AdminImportPage() {
  // src/proxy.ts already redirects non-admins as a UX shortcut, but this
  // is the real, server-verified check. See docs/architecture.md §3/§10.
  await requireAdmin();

  return (
    <Container className="max-w-3xl py-10">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Import Data</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Upload an updated station spreadsheet. Nothing is written until you review and approve
            specific changes — see{" "}
            <Link
              href="https://github.com/Mithil-1999/E-Sakhi/blob/main/docs/data-import.md"
              className="text-emerald-600 hover:underline dark:text-emerald-400"
            >
              how this works
            </Link>
            .
          </p>
        </div>
      </div>

      <ImportTool />
    </Container>
  );
}
