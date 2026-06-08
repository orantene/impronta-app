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
import { InspectorAccordion } from "./inspector-ui";
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
  /**
   * Optional trailing accessory rendered at the END of the title row (e.g. the
   * job #33 "has tablet/mobile overrides" dot). Right-aligned via the existing
   * justify-between layout; omitted → no change to the header.
   */
  accessory?: ReactNode;
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
  accessory,
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

  const titleCls = advanced ? KIT.sectionTitle : KIT.blockHeading;

  if (!collapsible) {
    return (
      <section className="flex flex-col gap-2.5">
        <div className="flex w-full items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className={titleCls}>{title}</span>
            {info ? <InfoTip label={info} /> : null}
          </div>
          {accessory ?? null}
        </div>
        {children}
      </section>
    );
  }

  if (collapsible) {
    return (
      <InspectorAccordion title={title} defaultOpen={open}>
        {accessory ? (
          <div className="flex justify-end">{accessory}</div>
        ) : null}
        {info ? <p className="text-[11px] leading-snug text-stone-500">{info}</p> : null}
        {children}
      </InspectorAccordion>
    );
  }

  return null;
}
