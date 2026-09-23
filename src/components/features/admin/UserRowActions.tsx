"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserListRow } from "@/services/user-service";

/**
 * Row-level actions for the Super Admin user management table — View,
 * Change Role, Activate/Deactivate. Follows this codebase's existing
 * confirmation pattern (a plain `window.confirm()`, same as
 * AdminStationForm.tsx's delete button) rather than introducing a new
 * modal component, and the same fetch+useTransition mutation pattern as
 * FavoriteButton.tsx — router.refresh() re-renders this Server Component
 * list with the real post-mutation state rather than guessing it
 * optimistically.
 */
export function UserRowActions({
  user,
  currentUserId,
}: {
  user: Pick<UserListRow, "id" | "name" | "role" | "status">;
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSelf = user.id === currentUserId;
  const isSuperAdmin = user.role === "SUPER_ADMIN";

  function changeRole() {
    const newRole = user.role === "ADMIN" ? "USER" : "ADMIN";
    const newRoleLabel = newRole === "ADMIN" ? "Admin" : "Member";
    if (
      !window.confirm(
        `Change Role\n\nUser: ${user.name}\nCurrent Role: ${user.role === "ADMIN" ? "Admin" : "Member"}\nNew Role: ${newRoleLabel}\n\nConfirm this change?`
      )
    ) {
      return;
    }
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/users/${user.id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? "Could not update role.");
        }
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not update role.");
      }
    });
  }

  function toggleStatus() {
    const newStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const verb = newStatus === "INACTIVE" ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${verb} ${user.name}?`)) return;

    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/users/${user.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? "Could not update status.");
        }
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not update status.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3 text-sm">
        <Link href={`/admin/users/${user.id}`} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
          View
        </Link>
        {!isSuperAdmin && (
          <button
            type="button"
            onClick={changeRole}
            disabled={isPending}
            className="font-medium text-slate-600 hover:underline disabled:opacity-50 dark:text-slate-300"
          >
            Change Role
          </button>
        )}
        {!isSelf && (
          <button
            type="button"
            onClick={toggleStatus}
            disabled={isPending}
            className={`font-medium hover:underline disabled:opacity-50 ${
              user.status === "ACTIVE" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {user.status === "ACTIVE" ? "Deactivate" : "Activate"}
          </button>
        )}
      </div>
      {errorMessage && <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>}
    </div>
  );
}
