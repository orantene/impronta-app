"use client";

/**
 * The design picker ("Change design" on a live site) and its detail and review
 * screens open as a full-screen overlay, like the other dashboard drawers,
 * instead of rendering in the page flow below the site card (which scrolled
 * the window about 650px and left a blank band at the top). Fixed, body
 * scroll-locked, focus-trapped, Escape closes. Portaled to <body> so no
 * transformed dashboard ancestor can turn `fixed` into `absolute`.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/components/support/use-focus-trap";

export function MaisonSetupOverlay({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(mounted);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // A nested dialog or sheet owns Escape first.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 md:p-6"
      data-testid="maison-setup-overlay"
      role="presentation"
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-maison-setup-overlay=""
        className="relative flex h-full w-full max-w-[1320px] flex-col overflow-y-auto overscroll-contain bg-admin-surface md:rounded-2xl"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
