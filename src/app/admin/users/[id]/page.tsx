import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { UserRowActions } from "@/components/features/admin/UserRowActions";
import { ResetPasswordPanel } from "@/components/features/admin/ResetPasswordPanel";
import { getUserById } from "@/services/user-service";
import { requireSuperAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "User Details" };

const ROLE_LABELS: Record<"SUPER_ADMIN" | "ADMIN" | "USER", string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  USER: "Member",
};

export default async function UserDetailPage({ params }: PageProps<"/admin/users/[id]">) {
  const currentUser = await requireSuperAdmin();
  const { id } = await params;

  const user = await getUserById(id);
  if (!user) notFound();

  return (
    <Container className="max-w-2xl py-10">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to User Management
      </Link>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              <ShieldCheck className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {user.name}
                {user.id === currentUser.id && (
                  <span className="ml-2 text-sm font-normal text-slate-400">(you)</span>
                )}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
            </div>
          </div>
          <UserRowActions user={user} currentUserId={currentUser.id} />
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2 dark:border-slate-800">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Phone Number</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-white">{user.phone ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Role</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-white">{ROLE_LABELS[user.role]}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Account Status</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-white">
              {user.status === "ACTIVE" ? "Active" : "Inactive"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Date Joined</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-white">
              {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(user.createdAt)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6">
        <ResetPasswordPanel userId={user.id} userName={user.name} />
      </div>
    </Container>
  );
}
