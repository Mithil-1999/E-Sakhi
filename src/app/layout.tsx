import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getOptionalUser } from "@/lib/auth/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "E Sakhi — हर यात्रा मे अहाँक संग",
    template: "%s — E Sakhi",
  },
  description:
    "Find EV charging stations across Nepal and get smart charging recommendations based on your vehicle and battery level.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read server-side so Header can show Login/Register vs Profile/Logout.
  // This does make every route dynamic rather than statically prerendered
  // (a nested Suspense boundary around just the user-menu piece would avoid
  // that — see the Next.js "Auth and streaming" guide) — a fine trade-off
  // for a small app; worth revisiting only if that specific cost matters.
  const user = await getOptionalUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <Header user={user} />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
