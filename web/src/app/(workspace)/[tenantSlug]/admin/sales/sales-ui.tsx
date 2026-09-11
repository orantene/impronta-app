/**
 * sales-ui.tsx — the small pieces the Sales board is drawn with: the filter
 * chip that navigates, the filter chip the engine has no reader for (drawn
 * disabled with its reason, D-POS-58), and the WHEN column's clock. Server
 * components; no hooks, no inline styles, token classes only.
 */

import type { ReactNode } from "react";
import Link from "next/link";

import { Icon } from "@/components/admin/shell/internal/primitives";

const CHIP = "inline-flex items-center whitespace-nowrap rounded-full border font-admin-body font-semibold transition-colors";

export function SalesChipLink({ href, active, small = false, children }: { href: string; active: boolean; small?: boolean; children: ReactNode }) {
  const size = small ? "px-[10px] py-[4px] text-[12px]" : "px-[12px] py-[6px] text-admin-12h";
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${CHIP} ${size} ${active ? "border-admin-brand bg-admin-brand-soft text-admin-brand" : "border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong"}`}
    >
      {children}
    </Link>
  );
}

/** "This week ▾" — a filter the engine cannot apply yet, disabled with its reason. */
export function SalesFilterChip({ label, reason }: { label: string; reason: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={reason}
      data-not-wired="true"
      className={`${CHIP} max-w-[240px] cursor-not-allowed gap-[6px] border-admin-border bg-admin-card px-[10px] py-[5px] text-[12px] font-normal text-admin-ink opacity-50`}
    >
      <span className="truncate">{label}</span>
      <span aria-hidden className="text-admin-ink-dim">
        <Icon name="chevron-down" size={12} stroke={1.75} />
      </span>
    </button>
  );
}

/** "Tue 8 Sep 13:00" on the workspace's clock; the raw instant when the zone is unusable. */
export function salesWhen(iso: string, locale: string, timeZone: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    // Assembled by hand so every locale reads "Tue 8 Sep 13:00", the board's
    // shape, rather than each locale's own punctuation ("Fri 11 Sept, 07:17").
    return `${get("weekday")} ${get("day")} ${get("month").replace(/\.$/, "")} ${get("hour")}:${get("minute")}`.replace(/\s+/g, " ").trim();
  } catch {
    return at.toISOString();
  }
}
