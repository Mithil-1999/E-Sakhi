"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Shield } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Container } from "@/components/ui/Container";
import { LogoutButton } from "@/components/features/LogoutButton";
import type { SessionUser } from "@/lib/auth/session";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/stations", label: "Find Chargers" },
  { href: "/marg", label: "E Sakhi Marg" },
  { href: "/charging-calculator", label: "Calculator" },
  { href: "/recommendations", label: "Recommendations" },
];

export function Header({ user }: { user: SessionUser | null }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <Container className="flex h-16 items-center justify-between">
        <Logo />

        <nav
          aria-label="Primary"
          className="hidden items-center gap-8 md:flex"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-700 transition-colors hover:text-emerald-600 dark:text-slate-200 dark:hover:text-emerald-400"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <AuthLinks user={user} />
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:bg-slate-100 md:hidden dark:text-slate-200 dark:hover:bg-slate-800"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav"
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <Menu className="h-6 w-6" aria-hidden="true" />
          )}
        </button>
      </Container>

      {isMenuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="border-t border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-950"
        >
          <Container className="flex flex-col gap-1 py-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <AuthLinks user={user} stacked />
            </div>
          </Container>
        </nav>
      )}
    </header>
  );
}

function AuthLinks({ user, stacked = false }: { user: SessionUser | null; stacked?: boolean }) {
  if (user) {
    return (
      <div className={stacked ? "flex flex-col gap-2" : "flex items-center gap-3"}>
        {user.role === "ADMIN" && (
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-emerald-600 dark:text-slate-200 dark:hover:text-emerald-400"
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            Admin
          </Link>
        )}
        <Link
          href="/dashboard"
          className="text-sm font-medium text-slate-700 hover:text-emerald-600 dark:text-slate-200 dark:hover:text-emerald-400"
        >
          Dashboard
        </Link>
        <Link
          href="/my-favorites"
          className="text-sm font-medium text-slate-700 hover:text-emerald-600 dark:text-slate-200 dark:hover:text-emerald-400"
        >
          Favorites
        </Link>
        <Link
          href="/profile"
          className="text-sm font-medium text-slate-700 hover:text-emerald-600 dark:text-slate-200 dark:hover:text-emerald-400"
        >
          {user.name ?? "Profile"}
        </Link>
        <LogoutButton />
      </div>
    );
  }

  return (
    <div className={stacked ? "flex flex-col gap-2" : "flex items-center gap-3"}>
      <Link
        href="/login"
        className="text-sm font-medium text-slate-700 hover:text-emerald-600 dark:text-slate-200 dark:hover:text-emerald-400"
      >
        Log in
      </Link>
      <Link
        href="/register"
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Sign up
      </Link>
    </div>
  );
}
