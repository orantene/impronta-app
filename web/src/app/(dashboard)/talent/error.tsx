"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { TalentDashboardPage } from "@/components/talent/talent-dashboard-primitives";
import { Button } from "@/components/ui/button";

/** Surfaces runtime errors in the talent segment instead of a blank 500. */
export default function TalentDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[talent/error.tsx]", error.message, error.stack);
  }, [error]);

  return (
    <TalentDashboardPage className="py-2">
      <div className="overflow-hidden rounded-2xl border border-destructive/35 bg-gradient-to-br from-destructive/10 to-destructive/5 px-5 py-6 shadow-sm lg:px-6 lg:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/15 text-destructive ring-1 ring-destructive/25">
            <AlertTriangle className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="font-display text-base font-semibold text-destructive lg:text-lg">
                Something went wrong
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                This part of the talent workspace hit an error. You can try again, or go back to your profile from the menu.
              </p>
            </div>
            <p className="rounded-xl border border-border/50 bg-background/50 px-3 py-2 font-mono text-xs text-foreground">
              {error.message}
            </p>
            {error.digest ? (
              <p className="font-mono text-[11px] text-muted-foreground">Digest: {error.digest}</p>
            ) : null}
            {error.stack ? (
              <pre className="max-h-48 overflow-auto rounded-xl border border-border/40 bg-muted/30 p-3 text-[10px] leading-relaxed text-muted-foreground">
                {error.stack}
              </pre>
            ) : null}
            <Button type="button" className="rounded-xl" onClick={() => reset()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    </TalentDashboardPage>
  );
}
