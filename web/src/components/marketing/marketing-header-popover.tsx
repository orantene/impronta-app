"use client";

import { cn } from "@/lib/utils";

/**
 * Shared shell for the header utility popovers (language, support, account).
 *
 * Desktop (lg+): the familiar right-anchored dropdown under its trigger.
 * Mobile: the same 36px icon can't host a skinny dropdown without it feeling
 * like a desktop leftover, so the panel becomes a full-width floating card
 * pinned under the header with a scrim behind it — the sheet pattern mobile
 * apps use. One shell for all three keeps the geometry identical so the
 * cluster reads as one system.
 *
 * The scrim closes on tap. It lives INSIDE each control's outside-pointer
 * ref, so the generic "pointerdown outside closes" handler ignores it — the
 * explicit onPointerDown is what closes. Escape is handled by each control.
 */
export function HeaderPopover({
  children,
  onClose,
  label,
  widthClass,
}: {
  children: React.ReactNode;
  onClose: () => void;
  /** Accessible name for the menu region. */
  label?: string;
  /** Desktop panel width, e.g. "lg:w-[15rem]". Mobile is always inset-x-3. */
  widthClass: string;
}) {
  return (
    <>
      <div
        aria-hidden
        onPointerDown={onClose}
        className="fixed inset-0 z-10 bg-[rgba(15,23,20,0.32)] backdrop-blur-[2px] lg:hidden"
      />
      <div
        role="menu"
        aria-label={label}
        className={cn(
          "mkt-rise z-20 max-lg:fixed max-lg:inset-x-3 max-lg:top-[4.75rem] lg:absolute lg:right-0 lg:top-full lg:pt-2",
          widthClass,
        )}
      >
        {/* Long content (an account with many workspaces) scrolls inside the
            card on mobile rather than running past the bottom of the screen. */}
        <div
          className="overflow-hidden rounded-[18px] p-2 max-lg:max-h-[calc(100dvh-6.5rem)] max-lg:overflow-y-auto"
          style={{
            background: "var(--plt-bg-elevated)",
            border: "1px solid var(--plt-hairline-strong)",
            boxShadow:
              "0 28px 64px -28px rgba(15,23,20,0.4), 0 2px 6px -2px rgba(15,23,20,0.08)",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
