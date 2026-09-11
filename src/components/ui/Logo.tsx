import Link from "next/link";
import { Zap } from "lucide-react";

type LogoProps = {
  className?: string;
};

/** E Sakhi wordmark, used in the header and footer. */
export function Logo({ className = "" }: LogoProps) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white ${className}`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
        <Zap className="h-5 w-5" aria-hidden="true" />
      </span>
      <span>
        E Sakhi
      </span>
    </Link>
  );
}
