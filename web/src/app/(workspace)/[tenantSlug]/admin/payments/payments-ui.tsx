/**
 * payments-ui.tsx — the pieces the Payments board (W25) is drawn with: the
 * five tiles, the tab strip's links, the grid table, the clock helpers.
 * Server components; token classes only, no inline styles.
 */

import type { ReactNode } from "react";
import Link from "next/link";

export function Tile({
  label,
  value,
  sub,
  failed = false,
  tone,
  testId,
}: {
  label: string;
  value: string;
  sub: string;
  failed?: boolean;
  tone?: "critical";
  testId?: string;
}) {
  return (
    <div data-testid={testId} data-failed={failed ? "true" : undefined} className="rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[12px] leading-[1.2]">
      <div className="text-admin-11 font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{label}</div>
      <div className={`mt-[4px] text-[24px] font-semibold tabular-nums tracking-[-0.01em] ${failed ? "text-admin-ink-dim" : tone === "critical" ? "text-admin-red" : "text-admin-ink"}`}>{value}</div>
      <div className={`mt-[3px] text-[11.5px] ${failed ? "text-admin-red" : "text-admin-ink-dim"}`}>{sub}</div>
    </div>
  );
}

export function PaymentsTabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-[26px] items-center rounded-[7px] px-[10px] text-[12.5px] font-semibold leading-[1.2] ${
        active ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted hover:text-admin-ink"
      }`}
    >
      {children}
    </Link>
  );
}

// The board's 33px header and 38px rows on a 1.2 line-height.
export const GRID_HEAD = "grid gap-[10px] px-[16px] py-[10px] text-admin-11 font-semibold uppercase leading-[1.2] tracking-[0.05em] text-admin-ink-muted";
export const GRID_ROW = "grid items-center gap-[10px] border-t border-admin-border-soft px-[16px] py-[10px] text-admin-12h leading-[1.2]";

/**
 * A tab's section. The board opens a tab straight on its table, so a tab
 * with one section keeps its title for the screen reader only (`quiet`) and
 * says its one-line note under the tab strip; Collections, with two
 * sections, keeps both titles visible.
 */
export function Section({ title, sub, children, testId, quiet = false }: { title: string; sub?: string; children: ReactNode; testId?: string; quiet?: boolean }) {
  return (
    <section data-testid={testId} className="flex flex-col gap-[10px]">
      <div className={quiet && !sub ? "sr-only" : ""}>
        <h2 className={quiet ? "sr-only" : "m-0 text-admin-15! font-semibold leading-[1.2] text-admin-ink"}>{title}</h2>
        {sub ? <p className={`m-0 text-[12px] leading-[1.2] text-admin-ink-muted ${quiet ? "" : "mt-[3px]"}`}>{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="rounded-[14px] border border-admin-border bg-admin-card px-[24px] py-[24px] text-admin-13 text-admin-ink-muted">
      {children}
    </div>
  );
}

/** W59 — a failed read is never the first-use empty state. */
export function FailedCard({ title, body, retryHref, retryLabel }: { title: string; body: string; retryHref: string; retryLabel: string }) {
  return (
    <div role="alert" className="rounded-[14px] border border-admin-border bg-admin-card px-[24px] py-[24px]">
      <p className="m-0 text-admin-13 font-semibold text-admin-red">{title}</p>
      <p className="mt-[4px] text-admin-13 text-admin-ink-muted">{body}</p>
      <Link href={retryHref} className="mt-[10px] inline-flex h-[30px] items-center rounded-[9px] border border-admin-border bg-admin-card px-[12px] text-[12px] font-semibold text-admin-ink hover:border-admin-border-strong">
        {retryLabel}
      </Link>
    </div>
  );
}

/** "20:28" on the workspace's clock. */
export function clockIn(iso: string | null | undefined, locale: string, timeZone: string): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  try {
    // `hourCycle: "h23"`, not `hour12: false`: en-US with hour12 off prints midnight as "24:55".
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(at);
  } catch {
    return "";
  }
}

/** "Tue 8 Sep 13:00" on the workspace's clock, the board's shape in every locale. */
export function dateIn(iso: string | null | undefined, locale: string, timeZone: string): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("weekday")} ${get("day")} ${get("month").replace(/\.$/, "")} ${get("hour")}:${get("minute")}`.replace(/\s+/g, " ").trim();
  } catch {
    return at.toISOString();
  }
}

export function minutesSince(iso: string, now: Date): number {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.round((now.getTime() - at) / 60_000));
}
