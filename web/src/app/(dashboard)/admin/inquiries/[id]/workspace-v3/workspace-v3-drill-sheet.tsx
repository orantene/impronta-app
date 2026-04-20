"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Admin Workspace V3 — shared drill-down slide-over (spec §5.3.1).
 *
 * Presentation contract:
 *   • Slides in from the right edge
 *   • Messaging stays visible underneath on ≥lg widths (max-width caps the sheet)
 *   • Escape closes
 *   • Click on the dimmed overlay closes
 *   • Removes the `?drill=` search param on close (no full navigation)
 *
 * This is the only place sheet-open/close lives — sheet content is composed
 * by the drill-host as a child. Sheet-specific logic (data fetches, actions)
 * never touches the open/close contract.
 */
export function WorkspaceV3DrillSheet({
  title,
  subtitle,
  children,
  widthClassName,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  widthClassName?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("drill");
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [router, searchParams]);

  // Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Move focus into the sheet on mount so keyboard users land in the right place.
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  const onOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) close();
  };

  return (
    <div
      ref={overlayRef}
      onClick={onOverlayClick}
      className="fixed inset-0 z-30 flex justify-end bg-background/40 backdrop-blur-[2px]"
      role="presentation"
    >
      <aside
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex h-full w-full flex-col border-l border-border/40 bg-background shadow-2xl outline-none",
          "animate-in slide-in-from-right-8 duration-150",
          widthClassName ?? "max-w-[560px]",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border/30 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {title}
            </h2>
            {subtitle ? (
              <p className="truncate text-[11px] text-muted-foreground/80">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={close}
            className="-m-1 rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            aria-label="Close drill-down"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </aside>
    </div>
  );
}

/**
 * Hook that returns `(key) => void` to open a drill sheet from a panel.
 * Keeps the URL as the single source of truth; no shared React state.
 */
export function useOpenDrill(): (key: string) => void {
  const router = useRouter();
  const searchParams = useSearchParams();
  return useCallback(
    (key: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("drill", key);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );
}
