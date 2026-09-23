import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { AdminSidebar } from "@/components/features/admin/AdminSidebar";
import { AdminTopBar } from "@/components/features/admin/AdminTopBar";

/**
 * Shared shell for every /admin/** page — sidebar + top bar, role-aware
 * (AdminSidebar shows the Users/Admins/Members/Role Management section
 * only for SUPER_ADMIN). This wraps the existing admin pages (dashboard,
 * stations list/new/edit, import, verification, reports) without any of
 * them needing to change — each still renders its own <Container> content
 * inside the space this layout leaves for `children`.
 *
 * requireAdmin() here is the base gate (ADMIN or SUPER_ADMIN) for
 * everything under /admin/**; src/proxy.ts's redirect is only a UX
 * shortcut ahead of this, and pages needing the stricter SUPER_ADMIN-only
 * check (src/app/admin/users/**) call requireSuperAdmin() themselves on
 * top of this — defense in depth, never a single point of enforcement.
 * See docs/architecture.md §3/§10.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <AdminSidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar name={user.name} role={user.role} />
        <main className="flex-1 bg-slate-50 dark:bg-slate-950">{children}</main>
      </div>
    </div>
  );
}
