import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Container } from "@/components/ui/Container";

const footerLinks = [
  {
    heading: "Explore",
    links: [
      { href: "/map", label: "Map" },
      { href: "/stations", label: "Find Chargers" },
      { href: "/marg", label: "E Sakhi Marg" },
      { href: "/charging-calculator", label: "Charging Calculator" },
      { href: "/recommendations", label: "Recommendations" },
    ],
  },
  {
    heading: "Project",
    links: [
      {
        href: "https://github.com/Mithil-1999/E-Sakhi",
        label: "GitHub Repository",
      },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-slate-600 dark:text-slate-400">
              हर यात्रा मे अहाँक संग। E Sakhi helps EV drivers in Nepal find
              charging stations, check compatibility, and plan charging with
              honest, progressively-verified data.
            </p>
          </div>

          {footerLinks.map((section) => (
            <div key={section.heading}>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {section.heading}
              </h3>
              <ul className="mt-3 space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-600 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <p>&copy; {year} E Sakhi. Data on this platform is a mix of verified and assumed information — see station verification status for details.</p>
        </div>
      </Container>
    </footer>
  );
}
