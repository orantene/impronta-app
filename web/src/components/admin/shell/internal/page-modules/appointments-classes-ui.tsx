"use client";

/**
 * appointments-classes-ui.tsx — the small pieces the Appointments & Classes
 * boards (W39, W40) are drawn with: the buttons, the state pill, the
 * segmented toggle, the filter chip, the facts card. Shared so the Sessions
 * table, the Series table, the panels and the Appointments list are one
 * language and not four approximations of it.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 * A control the engine has no action for is DISABLED WITH ITS REASON as the
 * button's title (the same convention the search pane's Collect uses), never
 * a button that silently does nothing.
 */

import type { ReactNode } from "react";

import { Icon } from "../primitives";

export const BUTTON =
  "inline-flex h-[34px] items-center justify-center gap-[6px] whitespace-nowrap rounded-[9px] border px-[14px] font-admin-body text-admin-13 font-semibold [transition:border-color_var(--transition-admin-micro),background_var(--transition-admin-micro)]";
export const BUTTON_PRIMARY = `${BUTTON} cursor-pointer border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep`;
export const BUTTON_SECONDARY = `${BUTTON} cursor-pointer border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong`;
export const BUTTON_OFF = `${BUTTON} cursor-not-allowed border-admin-border bg-admin-card text-admin-ink opacity-50`;
export const CARD = "rounded-[14px] border border-admin-border bg-admin-card";
export const INPUT =
  "h-[34px] w-full rounded-[9px] border border-admin-border bg-admin-card px-[10px] font-admin-body text-admin-13 text-admin-ink";

/**
 * A button that is either wired or disabled with a one-sentence reason.
 * `reason` set means "not wired": the button renders disabled and carries the
 * sentence as its title and accessible description.
 */
export function ActionButton({
  children,
  onClick,
  reason,
  tone = "secondary",
  disabled = false,
  className = "",
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  reason?: string | null;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  className?: string;
  testId?: string;
}) {
  const off = Boolean(reason) || disabled;
  const base = reason
    ? BUTTON_OFF
    : tone === "primary"
      ? BUTTON_PRIMARY
      : BUTTON_SECONDARY;
  const danger = tone === "danger" && !reason ? " text-admin-red" : "";
  return (
    <button
      type="button"
      disabled={off}
      aria-disabled={off || undefined}
      title={reason ?? undefined}
      data-testid={testId}
      data-not-wired={reason ? "true" : undefined}
      className={`${base}${danger} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onClick={off ? undefined : onClick}
    >
      {children}
    </button>
  );
}

export type PillTone = "green" | "indigo" | "coral" | "slate" | "critical";

const PILL_TONE: Record<PillTone, string> = {
  green: "bg-admin-success-soft text-admin-green",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  slate: "bg-admin-amber-soft text-admin-amber",
  critical: "bg-admin-critical-soft text-admin-red",
};

export function StatePill({ tone, children, testId, state }: { tone: PillTone; children: ReactNode; testId?: string; state?: string }) {
  return (
    <span
      data-testid={testId}
      data-state={state}
      className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[8px] py-[2px] text-admin-11 font-semibold ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Week / Day / List, This session / Future sessions / Entire series. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ id: T; label: string; reason?: string | null }>;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 gap-[2px] rounded-[9px] bg-admin-surface-alt p-[3px]">
      {options.map((o) => {
        const active = o.id === value;
        const off = Boolean(o.reason);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            disabled={off}
            title={o.reason ?? undefined}
            className={`rounded-[7px] px-[10px] py-[5px] font-admin-body text-[12px] font-semibold ${
              active
                ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : off
                  ? "cursor-not-allowed text-admin-ink-dim"
                  : "cursor-pointer text-admin-ink-muted hover:text-admin-ink"
            }`}
            onClick={() => (off ? undefined : onChange(o.id))}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Location: Centro ▾" — a select dressed as the board's chip. */
export function FilterChip({
  label,
  value,
  options,
  onChange,
  reason,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  onChange: (id: string) => void;
  reason?: string | null;
}) {
  const off = Boolean(reason);
  return (
    <label
      title={reason ?? undefined}
      className={`relative inline-flex flex-wrap items-center gap-x-[4px] rounded-full border border-admin-border bg-admin-card py-[5px] pl-[10px] pr-[24px] font-admin-body text-[12px] leading-[1.25] text-admin-ink ${off ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span className="text-admin-ink-muted">{label}:</span>
      <span className="font-medium">{options.find((o) => o.id === value)?.label ?? value}</span>
      <span aria-hidden className="pointer-events-none absolute right-[9px] top-1/2 -translate-y-1/2 text-admin-ink-dim">
        <Icon name="chevron-down" size={12} stroke={1.75} />
      </span>
      <select
        aria-label={label}
        disabled={off}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A yes/no chip: "Needs attention". */
export function ToggleChip({ label, on, onChange }: { label: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`inline-flex shrink-0 cursor-pointer items-center gap-[6px] rounded-full border py-[5px] pl-[10px] pr-[9px] font-admin-body text-[12px] leading-[1.25] ${
        on ? "border-admin-ink bg-admin-ink text-white" : "border-admin-border bg-admin-card text-admin-ink"
      }`}
      onClick={() => onChange(!on)}
    >
      {label}
      <Icon name="chevron-down" size={12} stroke={1.75} />
    </button>
  );
}

export function FactRow({ label, children, muted = false }: { label: string; children: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-[12px] border-b border-admin-border-soft py-[6px] font-admin-body text-admin-13 last:border-b-0">
      <span className="shrink-0 text-admin-ink-muted">{label}</span>
      <span className={`text-right font-medium tabular-nums ${muted ? "text-admin-ink-dim" : "text-admin-ink"}`}>{children}</span>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-admin-body text-admin-11 font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{children}</div>
  );
}

/** The "Used in · N" footer line the boards draw under a table. */
export function UsedIn({ count, label, parts }: { count: number; label: string; parts: ReadonlyArray<{ where: string; what: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-[8px] font-admin-body text-[11.5px] text-admin-ink-muted">
      <span className="inline-flex items-center gap-[6px] rounded-full border border-admin-border bg-admin-card px-[10px] py-[3px] font-semibold text-admin-ink">
        <Icon name="external" size={12} stroke={1.75} color="var(--color-admin-brand)" />
        {label} · {count}
      </span>
      <span>
        {parts.map((p, i) => (
          <span key={p.where}>
            {i > 0 ? " · " : ""}
            <b className="font-semibold text-admin-ink">{p.where}</b> {p.what}
          </span>
        ))}
      </span>
    </div>
  );
}

/** A refusal or a confirmation, one sentence, with a testable outcome. */
export function Outcome({
  kind,
  children,
  testId,
}: {
  kind: "refused" | "done" | "note";
  children: ReactNode;
  testId?: string;
}) {
  return (
    <p
      role={kind === "refused" ? "alert" : "status"}
      data-testid={testId}
      data-outcome={kind}
      className={`m-0 rounded-[9px] px-[10px] py-[8px] font-admin-body text-[12.5px] leading-[1.45] ${
        kind === "refused"
          ? "bg-admin-critical-soft text-admin-red"
          : kind === "done"
            ? "bg-admin-success-soft text-admin-green"
            : "bg-admin-surface-alt text-admin-ink"
      }`}
    >
      {children}
    </p>
  );
}
