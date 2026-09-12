import type { Metadata } from "next";
import { Shield } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminPage() {
  // src/proxy.ts already redirects non-admins away from /admin/** as a UX
  // shortcut, but this is the real, server-verified authorization check —
  // never rely on the proxy redirect alone. See docs/architecture.md §3/§10.
  const admin = await requireAdmin();

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        <Shield className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Admin dashboard — coming soon
      </h1>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
        Signed in as {admin.name ?? admin.email} (Administrator). Station
        management, data verification, and the Excel import tool arrive in
        later parts of E Sakhi&apos;s development.
      </p>
      <Button href="/" variant="outline" className="mt-2">
        Back to home
      </Button>
    </Container>
  );
}
