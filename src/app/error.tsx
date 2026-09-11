"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log the real error server-side/console for debugging without
    // exposing stack traces or internals to the user (see architecture.md
    // §"Error-handling").
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
        An unexpected error occurred. You can try again, or head back to the
        home page.
      </p>
      <div className="mt-2 flex gap-3">
        <Button onClick={reset} variant="primary">
          Try again
        </Button>
        <Button href="/" variant="outline">
          Go home
        </Button>
      </div>
    </div>
  );
}
