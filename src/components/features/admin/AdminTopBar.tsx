import Link from "next/link";
import { Shield, ShieldCheck, UserCircle } from "lucide-react";
import type { UserRole } from "@/lib/auth/session";

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  USER: "Member",
};

/**
 * Top navigation for the /admin shell (Section 4/5's "Top header" spec) —
 * E Sakhi branding is already in the sidebar's own header on desktop, so
 * this bar's job on desktop is just the user identity; on mobile (sidebar
 * collapsed into AdminSidebar's own drawer button) it also carries the
 * brand name so the page doesn't feel unbranded. No notifications bell —
 * this app has no notification system to back one, and a decorative
 * bell that never shows anything would be exactly the kind of fake UI
 * this project avoids everywhere else.
 */
export function AdminTopBar({ name, role }: { name: string | null; role: UserRole }) {
  const RoleIcon = role === "SUPER_ADMIN" ? ShieldCheck : role === "ADMIN" ? Shield : UserCircle;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6 dark:border-slate-800 dark:bg-slate-950">
      <span className="text-sm font-semibold text-slate-900 lg:hidden dark:text-white">E Sakhi</span>
      <span className="hidden text-sm text-slate-500 lg:block dark:text-slate-400">
        {ROLE_LABELS[role]} console
      </span>

      <Link
        href="/profile"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          <RoleIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-right">
          <span className="block text-sm font-medium text-slate-900 dark:text-white">
            {name ?? "Account"}
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[role]}</span>
        </span>
      </Link>
    </header>
  );
}
