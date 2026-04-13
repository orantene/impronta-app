"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";

export function PublicFlashHost({ dismissAria }: { dismissAria: string }) {
  const { flash, setFlash } = usePublicDiscoveryState();

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 4500);
    return () => window.clearTimeout(t);
  }, [flash, setFlash]);

  if (!flash) return null;

  const tone = flash.tone ?? "error";
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
      : tone === "info"
        ? "border-border/70 bg-muted/30 text-foreground"
        : "border-red-500/30 bg-red-500/10 text-red-100";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] px-4 sm:bottom-6 sm:px-6">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-auto mx-auto flex w-full max-w-lg items-start justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur",
          toneClass,
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">{flash.title}</p>
          {flash.message ? (
            <p className="mt-0.5 text-sm opacity-90">{flash.message}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-current hover:bg-white/10"
          onClick={() => setFlash(null)}
          aria-label={dismissAria}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

