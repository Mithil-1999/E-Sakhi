import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "outline";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600",
  secondary:
    "bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-slate-900",
  outline:
    "border border-slate-300 text-slate-900 hover:bg-slate-50 focus-visible:outline-slate-400 dark:border-slate-600 dark:text-white dark:hover:bg-slate-800",
};

const baseStyles =
  "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

type CommonProps = {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
};

type ButtonProps =
  | (CommonProps & { href: string })
  | (CommonProps & { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>);

/**
 * Reusable button. Renders a Next.js <Link> when given an `href`,
 * otherwise a native <button>. Keeps CTA styling consistent everywhere
 * (hero, forms, admin actions) instead of one-off className strings.
 */
export function Button(props: ButtonProps) {
  const { variant = "primary", className = "", children, href, ...rest } = props;
  const classes = `${baseStyles} ${variantStyles[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
