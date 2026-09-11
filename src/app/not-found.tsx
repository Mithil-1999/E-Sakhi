import { MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <MapPinOff className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Page not found
      </h1>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
        We couldn&apos;t find the page you were looking for. It may have
        moved, or this part of E Sakhi hasn&apos;t been built yet.
      </p>
      <Button href="/" variant="primary" className="mt-2">
        Go home
      </Button>
    </div>
  );
}
