import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Pagination } from "@/components/ui/Pagination";
import { UserRowActions } from "@/components/features/admin/UserRowActions";
import { UserListQuerySchema } from "@/lib/validation/user";
import { listUsers } from "@/services/user-service";
import { requireSuperAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "User Management",
};

const ROLE_LABELS: Record<"SUPER_ADMIN" | "ADMIN" | "USER", string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  USER: "Member",
};

const ROLE_STYLES: Record<"SUPER_ADMIN" | "ADMIN" | "USER", string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  ADMIN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  USER: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

function normalizeSearchParams(
  raw: Record<string, string | string[] | undefined>
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== "") normalized[key] = single;
  }
  return normalized;
}

/**
 * Super-Admin-only user management — search, filter by role/status, and
 * per-row View/Change Role/Activate-Deactivate actions (UserRowActions.tsx).
 * "+ Add User" links to /admin/users/new. URL-driven (same pattern
 * /admin/stations already uses) so a filtered view is a shareable link.
 */
export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const currentUser = await requireSuperAdmin();

  const rawParams = normalizeSearchParams(await searchParams);
  const parsed = UserListQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : UserListQuerySchema.parse({});

  const { data: users, meta } = await listUsers(query);

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.role) params.set("role", query.role);
    if (query.status) params.set("status", query.status);
    params.set("page", String(Math.max(1, Math.min(targetPage, meta.totalPages))));
    return `/admin/users?${params.toString()}`;
  }

  function filterHref(overrides: { role?: string; status?: string }) {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    const role = overrides.role !== undefined ? overrides.role : (query.role ?? "");
    const status = overrides.status !== undefined ? overrides.status : (query.status ?? "");
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    return `/admin/users?${params.toString()}`;
  }

  return (
    <Container className="py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User Management</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {meta.total} user{meta.total === 1 ? "" : "s"} match your filters.
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add User
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Search
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="search"
                name="search"
                type="text"
                defaultValue={query.search ?? ""}
                placeholder="Name, email, or phone..."
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Search
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
          <span className="mr-1 self-center text-slate-500 dark:text-slate-400">Role:</span>
          {[
            { label: "All", role: "" },
            { label: "Super Admin", role: "SUPER_ADMIN" },
            { label: "Admin", role: "ADMIN" },
            { label: "Member", role: "USER" },
          ].map((f) => (
            <Link
              key={f.label}
              href={filterHref({ role: f.role })}
              className={`rounded-full px-3 py-1 font-medium ${
                (query.role ?? "") === f.role
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {f.label}
            </Link>
          ))}
          <span className="mx-2 self-center text-slate-300 dark:text-slate-700">|</span>
          <span className="mr-1 self-center text-slate-500 dark:text-slate-400">Status:</span>
          {[
            { label: "All", status: "" },
            { label: "Active", status: "ACTIVE" },
            { label: "Inactive", status: "INACTIVE" },
          ].map((f) => (
            <Link
              key={f.label}
              href={filterHref({ status: f.status })}
              className={`rounded-full px-3 py-1 font-medium ${
                (query.status ?? "") === f.status
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr className="text-xs text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No users match these filters.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    {user.name}
                    {user.id === currentUser.id && (
                      <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{user.email}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{user.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_STYLES[user.role]}`}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      }`}
                    >
                      {user.status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(user.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <UserRowActions user={user} currentUserId={currentUser.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={meta.page} totalPages={meta.totalPages} buildHref={buildHref} />
    </Container>
  );
}
