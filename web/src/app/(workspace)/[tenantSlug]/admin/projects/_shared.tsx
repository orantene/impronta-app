/**
 * Shared presentation for the Projects and Clients records, as the boards
 * draw them (W41, W42, W45 and their tabs): a full-width page with a 320px
 * right column, 22/28px padding, 14px cards with a hairline border, 11px
 * uppercase eyebrows, 22px figures in KPI cards, 34px buttons with a 9px
 * radius, and the small status pills.
 *
 * Server-renderable, no state. Every judgement it displays was made by
 * `lib/projects/project-record` or `lib/customers/client-record` first.
 *
 * NO COLOUR LITERALS. Tone comes from the admin token classes
 * (`text-admin-ink`, `bg-admin-card`, `border-admin-border`, `bg-admin-brand`)
 * so these pages follow the workspace palette rather than pinning their own.
 */

import * as React from "react";
import Link from "next/link";
import { isOrderStatus } from "@/lib/orders/order-status";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_KEY } from "./_keys";

// ── Buttons ──────────────────────────────────────────────────────────

const BTN =
  "inline-flex h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border px-3.5 text-[13px] font-semibold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
export const BTN_PRIMARY = `${BTN} border-admin-brand bg-admin-brand text-admin-card hover:bg-admin-brand-deep`;
export const BTN_SECONDARY = `${BTN} border-admin-border bg-admin-card text-admin-ink hover:bg-admin-surface-alt`;
export const BTN_DANGER = `${BTN} border-admin-red/40 bg-admin-card text-admin-red hover:bg-admin-critical-soft`;
/** The 30px variant inside a row (`Remind`, `Edit`). */
export const BTN_ROW = "h-[30px] px-3 text-[12px]";

// ── Layout ───────────────────────────────────────────────────────────

/**
 * The list page: one column. The workspace shell's own `<main>` already
 * gives the board's 28px sides and 24px top, so these shells add none.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="flex w-full flex-col gap-4 max-[720px]:gap-[12px]">{children}</div>;
}

/**
 * A record page: the main column and the 320px right column. On the phone
 * (MW06, MW10) the right column is folded away unless the page asks for it
 * (`sideOnMobile`, the Details tab), and the main column's blocks sit 12px
 * apart as the boards draw them.
 */
export function RecordShell({
  main,
  side,
  sideOnMobile,
}: {
  main: React.ReactNode;
  side: React.ReactNode;
  sideOnMobile?: boolean;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-x-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-[18px] border-admin-border lg:border-r lg:pr-7 max-[720px]:gap-[12px]">{main}</div>
      <aside className={cn("flex min-w-0 flex-col gap-4 max-[720px]:mt-[12px]", !sideOnMobile && "max-[720px]:hidden")}>{side}</aside>
    </div>
  );
}

export function PageHeading({
  title,
  intro,
  actions,
  actionsOnMobile = true,
  aside,
}: {
  title: string;
  intro?: string;
  actions?: React.ReactNode;
  /** MW09 draws the list without its header buttons; they wait on the desktop. */
  actionsOnMobile?: boolean;
  /** The pill beside the title on the phone (MW09: "Needs action · 3"). */
  aside?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 max-[720px]:flex-wrap">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">
            {title}
          </h1>
          {intro ? <p className="m-0 mt-1 text-[13px] text-admin-ink-muted max-[720px]:hidden">{intro}</p> : null}
        </div>
        {aside ? <span className="hidden max-[720px]:inline-flex">{aside}</span> : null}
      </div>
      {actions ? (
        <div className={cn("flex shrink-0 items-center gap-2 max-[720px]:w-full max-[720px]:flex-wrap", !actionsOnMobile && "max-[720px]:hidden")}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/** `Client · payer …` style meta line under a record's title. */
export function MetaLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-admin-ink-muted">
      {children}
    </div>
  );
}

// ── Cards and rows ───────────────────────────────────────────────────

/** A white 14px card with a hairline border. `padded` adds the 12/14 inset. */
export function Card({
  title,
  children,
  className,
  padded,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[14px] border border-admin-border bg-admin-card",
        padded && "px-4 py-3",
        className,
      )}
    >
      {title ? <h2 className="m-0 mb-3 text-[14px]! font-semibold text-admin-ink">{title}</h2> : null}
      {children}
    </section>
  );
}

/** The 11px uppercase label over a card or column section. */
export function Eyebrow({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={cn(
        "text-[11px] font-bold uppercase text-admin-ink-muted",
        wide ? "tracking-[0.08em]" : "tracking-[0.06em]",
      )}
    >
      {children}
    </div>
  );
}

/** `Upcoming milestones` with an optional right-hand note or control. */
export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <h2 className="m-0 flex-1 text-[14px]! font-semibold text-admin-ink">{children}</h2>
      {aside}
    </div>
  );
}

/** One row of a list card: a grid with a hairline above every row but the first. */
export function ListRow({
  cols,
  children,
  className,
}: {
  /** A Tailwind `grid-cols-[...]` class. */
  cols: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-3 border-t border-admin-border-soft px-4 py-[11px] text-[13px] text-admin-ink first:border-t-0",
        cols,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The uppercase header row of a list card. */
export function ListHead({ cols, children }: { cols: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-admin-ink-muted",
        cols,
      )}
    >
      {children}
    </div>
  );
}

/** A label on the left, a value on the right, hairline under. */
export function KeyValue({
  label,
  value,
  dim,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** The value is an absence (`—`, `Never`). */
  dim?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-admin-border-soft py-1.5 text-[13px] last:border-b-0">
      <span className="text-admin-ink-muted">{label}</span>
      <span
        className={cn(
          "text-right font-medium tabular-nums",
          dim ? "text-admin-ink-dim" : "text-admin-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** A KPI card: eyebrow, 22px figure, one-line note. */
export function KpiCard({
  label,
  value,
  note,
  tone = "ink",
  testId,
  desktopOnly,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "ink" | "muted" | "coral";
  testId?: string;
  /** Not one of the phone's two numbers (MW06, MW10). */
  desktopOnly?: boolean;
}) {
  return (
    <div className={cn("min-w-0 rounded-[12px] border border-admin-border bg-admin-card px-4 py-3.5 max-[720px]:px-3.5 max-[720px]:py-3", desktopOnly && "max-[720px]:hidden")}>
      <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{label}</dt>
      <dd
        data-kpi={testId}
        className={cn(
          "m-0 mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums max-[720px]:text-[20px]",
          tone === "coral" ? "text-admin-coral-deep" : tone === "muted" ? "text-admin-ink-muted" : "text-admin-ink",
        )}
      >
        {value}
      </dd>
      {note ? <p className="m-0 mt-0.5 text-[12px] text-admin-ink-muted">{note}</p> : null}
    </div>
  );
}

// ── Pills, notices, chips ────────────────────────────────────────────

export type PillTone = "coral" | "slate" | "indigo" | "green" | "red" | "royal";

const PILL_TONE: Record<PillTone, string> = {
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  slate: "bg-admin-amber-soft text-admin-amber",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
  green: "bg-admin-success-soft text-admin-green",
  red: "bg-admin-critical-soft text-admin-red",
  royal: "bg-admin-royal-soft text-admin-royal",
};

export function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        PILL_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * A refusal, an outage or an absence, said in a sentence.
 *
 * The failure this exists to prevent: a read that came back `ok: false`
 * rendering as an empty list, so a workspace with forty projects reads "none
 * yet". Every non-answer on these surfaces goes through here.
 */
export function Notice({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "warn" | "brand";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "warn" ? "alert" : undefined}
      className={cn(
        "m-0 rounded-[12px] px-3.5 py-2.5 text-[12.5px]",
        tone === "warn" && "border border-admin-red/40 bg-admin-critical-soft text-admin-red",
        tone === "muted" && "bg-admin-surface-alt text-admin-ink-muted",
        tone === "brand" && "border border-admin-brand bg-admin-brand-soft text-admin-brand",
      )}
    >
      {children}
    </p>
  );
}

/**
 * The segmented filter: a grey track, the active pill white. On the phone
 * (MW09, MW17) it is the scrolling chip strip: the active chip ink, the rest
 * outlined, a fade at the right edge.
 */
export function Segments({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="relative min-w-0 max-[720px]:w-full">
      <nav
        aria-label={label}
        className="inline-flex gap-0.5 rounded-[9px] bg-admin-surface-alt p-[3px] max-[720px]:flex max-[720px]:gap-[6px] max-[720px]:overflow-x-auto max-[720px]:rounded-none max-[720px]:bg-transparent max-[720px]:p-0 max-[720px]:pr-[28px] max-[720px]:[scrollbar-width:none]"
      >
        {children}
      </nav>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[36px] bg-[linear-gradient(90deg,transparent,var(--color-admin-surface-alt)_70%)] max-[720px]:block" />
    </div>
  );
}

export function SegmentLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-[7px] px-2.5 py-[5px] text-[12px] font-semibold no-underline max-[720px]:shrink-0 max-[720px]:whitespace-nowrap max-[720px]:rounded-full max-[720px]:border max-[720px]:px-[12px] max-[720px]:py-[7px] max-[720px]:text-[13px] max-[720px]:shadow-none",
        active
          ? "bg-admin-card text-admin-ink shadow-admin-rest max-[720px]:border-admin-ink max-[720px]:bg-admin-ink max-[720px]:text-white"
          : "text-admin-ink-muted hover:text-admin-ink max-[720px]:border-admin-border max-[720px]:bg-admin-card",
      )}
    >
      {children}
    </Link>
  );
}

/** The tab strip under a record's header: real links, `aria-current` on the open one. */
export function TabStrip({
  label,
  tabs,
}: {
  label: string;
  tabs: readonly { id: string; href: string; label: string; active: boolean }[];
}) {
  return (
    <div className="relative min-w-0">
      <nav
        aria-label={label}
        className="flex gap-0.5 border-b border-admin-border max-[720px]:gap-[6px] max-[720px]:overflow-x-auto max-[720px]:border-b-0 max-[720px]:pr-[28px] max-[720px]:[scrollbar-width:none]"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-[13px] no-underline max-[720px]:mb-0 max-[720px]:shrink-0 max-[720px]:whitespace-nowrap max-[720px]:rounded-full max-[720px]:border max-[720px]:px-[12px] max-[720px]:py-[7px] max-[720px]:font-semibold",
              tab.active
                ? "border-admin-brand font-semibold text-admin-ink max-[720px]:border-admin-ink max-[720px]:bg-admin-ink max-[720px]:text-white"
                : "border-transparent font-medium text-admin-ink-muted hover:text-admin-ink max-[720px]:border-admin-border max-[720px]:bg-admin-card",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[36px] bg-[linear-gradient(90deg,transparent,var(--color-admin-surface-alt)_70%)] max-[720px]:block" />
    </div>
  );
}

/** Two initials on a soft royal disc, the record's avatar. */
export function Initials({ name, size = 56 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = (parts.length >= 2 ? parts[0]![0]! + parts[parts.length - 1]![0]! : name.slice(0, 2)).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-admin-royal-soft font-semibold text-admin-royal",
        size >= 56 ? "h-14 w-14 text-[18px]" : "h-8 w-8 text-[12px]",
      )}
    >
      {text}
    </span>
  );
}

/**
 * The phone's list row (MW09, MW17, MW21): a title, a second line and a
 * trailing pill or chevron, the whole row a link. Drawn beside the desktop
 * grid row and swapped by the breakpoint, so a list page carries both
 * without forking.
 */
export function MobileListRow({
  href,
  title,
  detail,
  trailing,
  className,
}: {
  href?: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-[1.3] text-admin-ink">{title}</span>
        {detail ? <span className="mt-0.5 block text-[12.5px] leading-[1.35] text-admin-ink-muted">{detail}</span> : null}
      </span>
      {trailing}
    </>
  );
  const cls = cn(
    "hidden w-full items-center gap-2.5 border-t border-admin-border-soft px-3.5 py-3 text-left no-underline first:border-t-0 max-[720px]:flex",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The chevron a phone row that opens something carries. */
export function RowChevron() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-admin-ink-dim">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** The phone's fixed action bar above the tab bar, and the space it needs. */
export function MobileActions({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div aria-hidden className="hidden h-[80px] max-[720px]:block" />
      <div
        data-tulala-mobile-action-bar
        className="fixed inset-x-0 bottom-[calc(62px+env(safe-area-inset-bottom,0px))] z-[60] hidden flex-col gap-2 border-t border-admin-border-soft bg-admin-surface px-3.5 py-2.5 max-[720px]:flex"
      >
        {children}
      </div>
    </>
  );
}

/** The 50px, full-width phone button. */
export const BTN_MOBILE = "h-[50px]! w-full rounded-[12px]! text-[15px]!";

// ── Small helpers ────────────────────────────────────────────────────

/** Short, stable handle for a uuid: what an operator reads off a screen. */
export function shortId(value: string): string {
  return value.slice(0, 8);
}

/**
 * An instant as the board prints it (`Fri 12 Sep 08:00`, `5 Sep`), in the
 * record's own zone. An unparseable instant or an invalid zone falls back to
 * the caller's sentence, never to UTC.
 */
export function dayLabel(
  value: string | null,
  timeZone: string,
  locale: string,
  fallback: string,
  opts: { weekday?: boolean; time?: boolean } = {},
): string {
  if (!value) return fallback;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      day: "numeric",
      month: "short",
      ...(opts.weekday ? { weekday: "short" } : {}),
      ...(opts.time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    }).format(instant);
  } catch {
    return fallback;
  }
}

/**
 * An attached order's status, in the Orders desk's own words.
 *
 * An UNRECOGNISED label falls through to itself rather than to a friendly
 * default, exactly as the desk does: "not a status we know" is a different
 * answer from any of the eight, and dressing it as one of them would hide the
 * row that most needs looking at.
 */
export function orderStatusLabel(status: string, tr: (key: string) => string): string {
  return isOrderStatus(status) ? tr(ORDER_STATUS_KEY[status]) : status;
}
