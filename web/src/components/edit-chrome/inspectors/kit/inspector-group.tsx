"use client";

/**
 * InspectorGroup — titled block wrapping related fields.
 *
 * Premium-tier panels group fields by operator intent (Copy, Buttons,
 * Backdrop, Mode) rather than schema layout. This primitive wraps those
 * groups so the title cadence, optional info-tip, and optional collapse
 * behaviour are identical everywhere.
 *
 * Collapse state persists per `storageKey` in sessionStorage — re-opening a
 * section type preserves the operator's last layout choice so they don't
 * have to fight the UI each time.
 */

import { useEffect, useState, type ReactNode } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { KIT } from "./tokens";

interface InspectorGroupProps {
  title: string;
  /** Optional tooltip copy — explains the group without bloating the title. */
  info?: string;
  /** Shows an "Advanced" treatment: de-emphasised title, defaults collapsed. */
  advanced?: boolean;
  /** Makes the group collapsible. Required when `advanced` is true. */
  collapsible?: boolean;
  /** Stable key for sessionStorage persistence. Omit to not persist. */
  storageKey?: string;
  /** Default-open when no stored state exists. Defaults to !advanced. */
  defaultOpen?: boolean;
  children: ReactNode;
}

function readStoredOpen(key: string | undefined, fallback: boolean): boolean {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const v = window.sessionStorage.getItem(`ig:${key}`);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    // sessionStorage unavailable (private mode, etc.)
  }
  return fallback;
}

export function InspectorGroup({
  title,
  info,
  advanced = false,
  collapsible = false,
  storageKey,
  defaultOpen,
  children,
}: InspectorGroupProps) {
  const initialOpen = defaultOpen ?? !advanced;
  const [open, setOpen] = useState<boolean>(() =>
    readStoredOpen(storageKey, initialOpen),
  );

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(`ig:${storageKey}`, open ? "1" : "0");
    } catch {
      // quota exceeded / disabled — silently skip
    }
  }, [open, storageKey]);

  const titleCls = advanced ? KIT.sectionTitle : KIT.groupTitle;

  if (!collapsible) {
    return (
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <span className={titleCls}>{title}</span>
          {info ? <InfoTip label={info} /> : null}
        </div>
        {children}
      </section>
    );
  }

  // T1-4 — InfoTip is rendered as a SIBLING of the toggle button, not as a
  // child. InfoTip itself emits a <button>, and nesting a <button> inside
  // another <button> is an HTML hydration error that surfaces in the
  // Next.js dev overlay (the audit's "red 2 Issues badge" leak). Splitting
  // them keeps the visual layout identical (flex row, same gap) but makes
  // the DOM legal so React stops complaining.
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-left"
            aria-expanded={open}
          >
            <span className={titleCls}>{title}</span>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-zinc-400 transition ${open ? "rotate-180" : ""}`}
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {info ? <InfoTip label={info} /> : null}
        </div>
      </div>
      {open ? children : null}
    </section>
  );
}
