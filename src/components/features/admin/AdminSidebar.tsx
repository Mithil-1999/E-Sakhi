"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  PlusCircle,
  Users,
  ShieldCheck,
  UserCog,
  UserCircle,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { LogoutButton } from "@/components/features/LogoutButton";
import type { UserRole } from "@/lib/auth/session";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const BASE_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/stations", label: "EV Stations", icon: MapPin },
  { href: "/admin/stations/new", label: "Add Station", icon: PlusCircle },
];

// Super-Admin-only section — src/proxy.ts and requireSuperAdmin() both
// independently enforce this server-side; hiding these links here is a
// UX nicety for an ADMIN who'd otherwise see a dead end, never the real
// access control. See docs/architecture.md's RBAC section.
const SUPER_ADMIN_ITEMS: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: Users, exact: true },
  { href: "/admin/users?role=ADMIN", label: "Admins", icon: ShieldCheck },
  { href: "/admin/users?role=USER", label: "Members", icon: UserCircle },
  { href: "/admin/users", label: "Role Management", icon: UserCog },
];

const FOOTER_ITEMS: NavItem[] = [
  { href: "/profile", label: "My Profile", icon: UserCircle },
  { href: "/profile", label: "Settings", icon: Settings },
];

/**
 * Users/Admins/Members/Role Management all point at /admin/users (three
 * of them differ only by a `role` query param) — comparing paths alone
 * would highlight all four at once, so this also compares each item's
 * own `role` param (or its absence, for "Users"/"Role Management")
 * against the page's actual current `role` param.
 */
function isActive(pathname: string, currentRole: string | null, item: NavItem): boolean {
  const [path, query] = item.href.split("?");
  const pathMatches = item.exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  if (!pathMatches) return false;
  const itemRole = query ? new URLSearchParams(query).get("role") : null;
  return itemRole === currentRole;
}

function NavLink({
  item,
  pathname,
  currentRole,
  onClick,
}: {
  item: NavItem;
  pathname: string;
  currentRole: string | null;
  onClick?: () => void;
}) {
  const active = isActive(pathname, currentRole, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function SidebarContent({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  const currentRole = useSearchParams().get("role");
  const items = role === "SUPER_ADMIN" ? [...BASE_ITEMS, ...SUPER_ADMIN_ITEMS] : BASE_ITEMS;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 p-4 dark:border-slate-800">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item, i) => (
          <NavLink key={`${item.href}-${i}`} item={item} pathname={pathname} currentRole={currentRole} onClick={onNavigate} />
        ))}
      </nav>
      <div className="space-y-1 border-t border-slate-200 p-3 dark:border-slate-800">
        {FOOTER_ITEMS.map((item, i) => (
          <NavLink key={`${item.href}-${i}`} item={item} pathname={pathname} currentRole={currentRole} onClick={onNavigate} />
        ))}
        <div className="pt-1">
          <LogoutButton className="w-full justify-start !bg-transparent !px-3 !py-2 !text-sm !font-medium !text-slate-600 hover:!bg-slate-100 dark:!text-slate-300 dark:hover:!bg-slate-800" />
        </div>
      </div>
    </div>
  );
}

/** Desktop: a fixed 240px sidebar, always visible. Mobile: a hamburger button that opens the same nav as a slide-over drawer — see AdminTopBar.tsx for the bar this sits below. */
export function AdminSidebar({ role }: { role: UserRole }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-950">
        <SidebarContent role={role} />
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg lg:hidden"
        aria-label="Open admin menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close admin menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl dark:bg-slate-950">
            <div className="flex items-center justify-end p-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarContent role={role} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
