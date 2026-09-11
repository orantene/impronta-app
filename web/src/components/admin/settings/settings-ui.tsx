"use client";

/**
 * settings-ui.tsx — the pieces the Settings boards (W20, W21, W23, W24) are
 * drawn with, on top of the Appointments & Classes kit so the settings frame
 * and the rest of the workspace read as one language: the card with its
 * title, the switch row, the select-shaped field, the save-state chip (W58),
 * the "could not load" state with its retry (W59), the grid table.
 *
 * Token classes only; no hex literals, no inline styles. A control the engine
 * has no reader or action for is DISABLED WITH ITS REASON, never a control
 * that silently does nothing (the brief's rule, recorded as D-POS-58).
 */

import type { ReactNode } from "react";

import { Icon } from "@/components/admin/shell/internal/primitives";
import { ActionButton, BUTTON_SECONDARY } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";

export { ActionButton, StatePill, FactRow, UsedIn, Segmented, CARD } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";

/** The board's 22px title with its one-line subtitle and the actions on the right. */
export function SettingsHeader({ title, subtitle, actions, testId }: { title: string; subtitle: string; actions?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex items-start justify-between gap-[12px]">
      <div className="min-w-0">
        <h2 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">{title}</h2>
        <p className="m-0 mt-[4px] text-admin-13 text-admin-ink-muted">{subtitle}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-[8px]">{actions}</div> : null}
    </div>
  );
}

/** A white card with the board's 13px semibold title and 8px-gapped body. */
export function SettingsCard({ title, children, className = "", testId }: { title?: string; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} className={`rounded-[14px] border border-admin-border bg-admin-card ${className}`}>
      <div className="flex flex-col gap-[8px] px-[16px] py-[14px]">
        {title ? <h3 className="m-0 text-admin-13! font-semibold text-admin-ink">{title}</h3> : null}
        {children}
      </div>
    </section>
  );
}

/** The 34x20 switch the boards draw: brand when on, dim when off. */
export function Switch({
  on,
  disabled = false,
  onToggle,
  label,
  reason,
  testId,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  label: string;
  reason?: string | null;
  testId?: string;
}) {
  const off = disabled || Boolean(reason);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={off}
      title={reason ?? undefined}
      data-testid={testId}
      data-not-wired={reason ? "true" : undefined}
      onClick={off ? undefined : onToggle}
      className={`relative mt-[1px] h-[20px] w-[34px] shrink-0 rounded-full border-0 p-0 transition-colors ${
        on ? "bg-admin-brand" : "bg-admin-border-strong"
      } ${off ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <i
        aria-hidden
        className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-admin-card transition-[left,right] ${on ? "right-[2px]" : "left-[2px]"}`}
      />
    </button>
  );
}

/** One row of a switch list: the switch, its label, then a pill on the right. */
export function SwitchRow({ children, right, testId }: { children: ReactNode; right?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex items-center gap-[10px] border-t border-admin-border-soft py-[7px] first:border-t-0">
      <div className="flex min-w-0 flex-1 items-start gap-[10px]">{children}</div>
      {right ? <span className="shrink-0">{right}</span> : null}
    </div>
  );
}

/** "iPad-2 · Counter (default) · reader MP-2341 · ●" — a keyed fact line with a status dot. */
export function DeviceRow({ name, detail, tone }: { name: string; detail: string; tone: "green" | "coral" | "dim" }) {
  const dot = tone === "green" ? "bg-admin-green" : tone === "coral" ? "bg-admin-coral" : "bg-admin-ink-dim";
  return (
    <div className="flex items-center gap-[10px] border-t border-admin-border-soft py-[7px] text-admin-12h first:border-t-0">
      <span className="w-[150px] shrink-0 font-semibold text-admin-ink">{name}</span>
      <span className="min-w-0 flex-1 text-admin-ink-muted">{detail}</span>
      <span aria-hidden className={`h-[8px] w-[8px] shrink-0 rounded-full ${dot}`} />
    </div>
  );
}

/**
 * The board's select-shaped field: a 12px semibold label over a 36px box with
 * a chevron. With `options` and `onChange` it is a real `<select>`; with a
 * `reason` it is disabled and says why on hover, and the box shows the honest
 * current value.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  reason,
  disabled = false,
  testId,
}: {
  label: string;
  value: string;
  options?: ReadonlyArray<{ id: string; label: string }>;
  onChange?: (id: string) => void;
  reason?: string | null;
  disabled?: boolean;
  testId?: string;
}) {
  const off = Boolean(reason) || disabled || !options || !onChange;
  const shown = options?.find((o) => o.id === value)?.label ?? value;
  return (
    <label data-testid={testId} title={reason ?? undefined} className="flex min-w-0 flex-col">
      <span className="mb-[6px] text-[12px] font-semibold text-admin-ink">{label}</span>
      <span
        data-not-wired={reason ? "true" : undefined}
        className={`relative flex h-[36px] items-center gap-[8px] rounded-[9px] border border-admin-border bg-admin-card px-[12px] text-admin-13 text-admin-ink ${
          off ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
      >
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{shown}</span>
        <span aria-hidden className="shrink-0 text-admin-ink-dim">
          <Icon name="chevron-down" size={14} stroke={1.75} />
        </span>
        {options && onChange ? (
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
        ) : null}
      </span>
    </label>
  );
}

/** A text/number input in the same 36px frame. */
export function TextField({
  label,
  value,
  onChange,
  onBlur,
  reason,
  disabled = false,
  inputMode,
  suffix,
  hint,
  testId,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  reason?: string | null;
  disabled?: boolean;
  inputMode?: "numeric" | "decimal" | "text";
  suffix?: string;
  hint?: string;
  testId?: string;
  ariaLabel?: string;
}) {
  const off = Boolean(reason) || disabled || !onChange;
  return (
    <label title={reason ?? undefined} className="flex min-w-0 flex-col">
      <span className="mb-[6px] text-[12px] font-semibold text-admin-ink">{label}</span>
      <span
        className={`flex h-[36px] items-center gap-[8px] rounded-[9px] border border-admin-border bg-admin-card px-[12px] text-admin-13 text-admin-ink ${off ? "opacity-60" : ""}`}
      >
        <input
          data-testid={testId}
          aria-label={ariaLabel ?? label}
          inputMode={inputMode}
          disabled={off}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-admin-body text-admin-13 text-admin-ink outline-none disabled:cursor-not-allowed"
        />
        {suffix ? <span className="shrink-0 text-admin-ink-muted">{suffix}</span> : null}
      </span>
      {hint ? <span className="mt-[4px] text-[11.5px] text-admin-ink-dim">{hint}</span> : null}
    </label>
  );
}

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "failed"; message: string };

/**
 * W58 — Saving · Saved HH:MM · Save failed. On failure the input stays and
 * Retry sends the same change once; the chip never lies about a save that
 * did not happen.
 */
export function SaveStateChip({
  state,
  labels,
  onRetry,
  timeZone,
  testId,
}: {
  state: SaveState;
  labels: { saving: string; saved: string; failed: string; retry: string };
  onRetry?: () => void;
  timeZone?: string;
  testId?: string;
}) {
  if (state.kind === "idle") return null;
  const pill = "inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[8px] py-[2px] text-admin-11 font-semibold";
  if (state.kind === "saving") {
    return (
      <span data-testid={testId} data-save-state="saving" role="status" className={`${pill} bg-admin-surface-alt text-admin-ink-muted`}>
        {labels.saving}
      </span>
    );
  }
  if (state.kind === "saved") {
    let clock = "";
    try {
      clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(state.at);
    } catch {
      clock = "";
    }
    return (
      <span data-testid={testId} data-save-state="saved" role="status" className={`${pill} bg-admin-success-soft text-admin-green`}>
        {labels.saved}
        {clock ? ` ${clock}` : ""}
      </span>
    );
  }
  return (
    <span data-testid={testId} data-save-state="failed" role="alert" className="inline-flex items-center gap-[8px]">
      <span className={`${pill} bg-admin-critical-soft text-admin-red`}>
        {labels.failed} · {state.message}
      </span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={`${BUTTON_SECONDARY} h-[28px] px-[10px] text-[12px]`}>
          {labels.retry}
        </button>
      ) : null}
    </span>
  );
}

/** W59 — a failed fetch never shows the first-use empty state; it says "Couldn't load" with a retry. */
export function CouldNotLoad({ message, retryLabel, onRetry, testId }: { message: string; retryLabel: string; onRetry?: () => void; testId?: string }) {
  return (
    <div data-testid={testId} role="alert" className="flex flex-wrap items-center gap-[10px] rounded-[9px] bg-admin-critical-soft px-[12px] py-[10px] text-admin-12h text-admin-red">
      <span>{message}</span>
      {onRetry ? (
        <ActionButton onClick={onRetry} className="h-[28px] px-[10px] text-[12px]">
          {retryLabel}
        </ActionButton>
      ) : null}
    </div>
  );
}

/** The boards' two-line skeleton while a card's reader answers. */
export function LoadingLines({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-[8px] py-[4px]">
      <div aria-hidden className="h-[12px] w-[40%] animate-pulse rounded-[4px] bg-admin-surface-alt" />
      <div aria-hidden className="h-[12px] w-[65%] animate-pulse rounded-[4px] bg-admin-surface-alt" />
    </div>
  );
}

/** The uppercase 11px column header row the boards' grid tables open with. */
export function GridHead({ columns, cols }: { columns: readonly string[]; cols: string }) {
  return (
    <div className={`grid gap-[10px] px-[16px] py-[8px] text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted ${cols}`}>
      {columns.map((c) => (
        <span key={c}>{c}</span>
      ))}
    </div>
  );
}

export function GridRow({ children, cols, testId }: { children: ReactNode; cols: string; testId?: string }) {
  return (
    <div data-testid={testId} className={`grid items-center gap-[10px] border-t border-admin-border-soft px-[16px] py-[10px] text-admin-12h ${cols}`}>
      {children}
    </div>
  );
}

/** A one-sentence note under a card or a table. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[12px] leading-[1.45] text-admin-ink-muted">{children}</p>;
}
