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
    <div data-testid={testId} data-failed={failed ? "true" : undefined} className="rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[14px]">
      <div className="text-admin-11 font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{label}</div>
      <div className={`mt-[4px] text-[22px] font-semibold tabular-nums ${failed ? "text-admin-ink-dim" : tone === "critical" ? "text-admin-red" : "text-admin-ink"}`}>{value}</div>
      <div className={`text-[11.5px] ${failed ? "text-admin-red" : "text-admin-ink-dim"}`}>{sub}</div>
    </div>
  );
}

export function PaymentsTabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-[7px] px-[10px] py-[5px] text-[12px] font-semibold ${
        active ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted hover:text-admin-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export const GRID_HEAD = "grid gap-[10px] px-[16px] py-[8px] text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted";
export const GRID_ROW = "grid items-center gap-[10px] border-t border-admin-border-soft px-[16px] py-[10px] text-admin-12h";

export function Section({ title, sub, children, testId }: { title: string; sub?: string; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="flex flex-col gap-[10px]">
      <div>
        <h2 className="m-0 text-admin-15! font-semibold text-admin-ink">{title}</h2>
        {sub ? <p className="m-0 mt-[2px] text-[12px] text-admin-ink-muted">{sub}</p> : null}
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
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(at);
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
    const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).formatToParts(at);
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
