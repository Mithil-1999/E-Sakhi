import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { CreateUserForm } from "@/components/features/admin/CreateUserForm";
import { requireSuperAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Add User",
};

export default async function NewUserPage() {
  // Only a Super Admin can reach this page — src/proxy.ts also redirects
  // a plain Admin away from /admin/users/** before this even runs.
  await requireSuperAdmin();

  return (
    <Container className="py-10">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to User Management
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">Add User</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Create a new Admin or Member account directly — they can log in with this password right
        away.
      </p>

      <div className="mt-6">
        <CreateUserForm />
      </div>
    </Container>
  );
}
