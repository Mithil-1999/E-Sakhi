import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Shield, User as UserIcon } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { LogoutButton } from "@/components/features/LogoutButton";

export const metadata: Metadata = {
  title: "Your profile",
};

export default async function ProfilePage() {
  // requireUser() redirects to /login if there's no session — this is the
  // real authorization check; src/proxy.ts's redirect is only a UX
  // shortcut, not a substitute for this. See docs/architecture.md §3.
  const sessionUser = await requireUser();

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { name: true, email: true, role: true, createdAt: true },
  });

  // The session referenced a user row that's gone (e.g. deleted account) —
  // treat as signed out rather than rendering stale/undefined data.
  if (!user) {
    redirect("/login");
  }

  return (
    <Container className="max-w-2xl py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            <UserIcon className="h-7 w-7" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{user.name}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
          </div>
        </div>

        <dl className="mt-8 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <dt className="text-sm text-slate-600 dark:text-slate-400">Role</dt>
            <dd className="inline-flex items-center gap-1 text-sm font-medium text-slate-900 dark:text-white">
              {user.role === "ADMIN" && <Shield className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
              {user.role === "ADMIN" ? "Administrator" : "Member"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-slate-600 dark:text-slate-400">Member since</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-white">
              {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(user.createdAt)}
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-sm text-slate-500 dark:text-slate-500">
          Favorites, reviews, and profile editing arrive in a later part of the build.
        </p>

        <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
          <LogoutButton />
        </div>
      </div>
    </Container>
  );
}
