"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * Quick-open profile overlay — the client shell around the server-rendered
 * TalentProfileView (variant="modal").
 *
 * The route underneath is the REAL /t/[profileCode] URL (intercepted
 * navigation), so:
 *   • close = router.back() → returns to the directory, scroll intact
 *   • "Open full page" = hard navigation to the same URL → canonical page
 *   • refresh / share / crawler → canonical page automatically
 */
export function ProfileModalShell({
  profileCode,
  openFullPageLabel,
  closeLabel,
  children,
}: {
  profileCode: string;
  openFullPageLabel: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setOpen(false);
        router.back();
      }
    },
    [router],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-0 z-[121] flex flex-col overflow-hidden bg-background outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.985] data-[state=open]:duration-300 sm:inset-x-1/2 sm:inset-y-4 sm:w-[min(1200px,calc(100vw-3rem))] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-[0_40px_120px_-24px_rgba(0,0,0,0.7)]"
        >
          <Dialog.Title className="sr-only">{profileCode}</Dialog.Title>

          {/* Floating controls — above the scrolling profile body. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[10] flex items-center justify-end gap-2 p-3 sm:p-4">
            <a
              href={`/t/${encodeURIComponent(profileCode)}`}
              className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-3.5 text-[12px] font-medium tracking-wide text-white backdrop-blur-md transition-colors hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {openFullPageLabel}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
            <Dialog.Close
              aria-label={closeLabel}
              className="pointer-events-auto inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          {/* The full server-rendered profile scrolls inside the panel. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
