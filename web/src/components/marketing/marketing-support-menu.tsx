"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MarketingCopy } from "@/lib/marketing/copy";

/** Support contact — used in the header cluster and the mobile menu alike. */
export const SUPPORT_EMAIL = "hello@tulala.digital";

const ROW =
  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.875rem] font-medium transition-colors hover:bg-[var(--plt-bg-raised)]";

/** Desktop support control — a help icon that opens a small dropdown. Shown
 *  for every visitor (signed in or out); destinations are real (help center +
 *  contact email), never placeholders. */
export function DesktopSupport({ copy }: { copy: MarketingCopy["nav"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={copy.support}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        /* Base colours are classes, not inline `style`. Inline declarations
           outrank every stylesheet rule, so the previous `style` prop silently
           killed the `hover:` variants below and the control read as inert. */
        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg-raised)] text-[var(--plt-ink-soft)] transition-[background-color,border-color,color] hover:border-[var(--plt-ink-soft)] hover:bg-[var(--plt-bg-deep)] hover:text-[var(--plt-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plt-forest)]"
      >
        <HelpGlyph />
      </button>

      {open ? (
        <div className="absolute right-0 top-full w-[15rem] pt-2 mkt-rise" role="menu">
          <div
            className="overflow-hidden rounded-[18px] p-2"
            style={{
              background: "var(--plt-bg-elevated)",
              border: "1px solid var(--plt-hairline-strong)",
              boxShadow:
                "0 28px 64px -28px rgba(15,23,20,0.4), 0 2px 6px -2px rgba(15,23,20,0.08)",
            }}
          >
            <p
              className="px-3 pt-1 pb-1 text-[0.6875rem] font-medium uppercase tracking-wide"
              style={{ color: "var(--plt-muted)" }}
            >
              {copy.support}
            </p>
            <Link
              href="/help"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={ROW}
              style={{ color: "var(--plt-ink)" }}
            >
              <LifeBuoyGlyph />
              {copy.helpCenter}
            </Link>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              role="menuitem"
              className={ROW}
              style={{ color: "var(--plt-ink)" }}
            >
              <MailGlyph />
              {copy.contactSupport}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HelpGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.5 9.2a2.5 2.5 0 1 1 3.2 2.4c-.7.25-1.2.9-1.2 1.65v.35"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  );
}

function LifeBuoyGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.7 4.7l4.3 4.3M15 15l4.3 4.3M19.3 4.7L15 9M9 15l-4.3 4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
