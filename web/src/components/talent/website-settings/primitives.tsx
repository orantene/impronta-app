"use client";

/**
 * Website settings UX primitives (WSF F1). Reusable by later settings groups:
 * status chip, sticky save bar, unsaved-exit bottom sheet, nav row, choice
 * card (radio), switch, stepper. Every tap target is at least 44px.
 * Callers pass already-localised strings.
 */

import type { ReactNode } from "react";

export type SaveStatus = "idle" | "saving" | "failed";

const TARGET = "min-h-[44px]";

export function StatusChip({
  status,
  unsaved,
  labels,
  className = "",
}: {
  className?: string;
  status: SaveStatus;
  unsaved: number;
  labels: { saved: string; unsaved: string; saving: string; failed: string };
}) {
  const [text, tone] =
    status === "saving"
      ? [labels.saving, "bg-black/[0.05] text-admin-ink-muted"]
      : status === "failed"
        ? [labels.failed, "bg-red-50 text-red-800"]
        : unsaved > 0
          ? [labels.unsaved.replace("{n}", String(unsaved)), "bg-amber-50 text-amber-900"]
          : [labels.saved, "bg-emerald-50 text-emerald-900"];
  return (
    <span role="status" aria-live="polite" className={`inline-flex shrink-0 items-center self-start rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone} ${className}`}>
      {text}
    </span>
  );
}

export function SaveBar({
  status,
  dirty,
  onDiscard,
  onSave,
  labels,
}: {
  status: SaveStatus;
  dirty: boolean;
  onDiscard: () => void;
  onSave: () => void;
  labels: { discard: string; save: string; saving: string; retry: string; nothing: string };
}) {
  const failed = status === "failed";
  const saving = status === "saving";
  const idle = !dirty && !failed && !saving;
  return (
    <div
      // Mobile: sit above the shell's fixed bottom nav (64px + safe area, same
      // as the shell's surface-main padding) and keep clear of the round
      // floating launcher at bottom-right.
      className="sticky bottom-0 z-10 -mx-4 mt-6 w-[calc(100%+2rem)] border-t border-admin-border-soft bg-white px-4 py-3 max-[720px]:bottom-[calc(64px+env(safe-area-inset-bottom,0px))] max-[720px]:pr-[76px]"
    >
      {/* Disabled buttons always say why. */}
      {idle ? <p id="ws-savebar-why" className="mb-2 text-[12.5px] text-admin-ink-muted">{labels.nothing}</p> : null}
      <div className="flex gap-2.5">
      <button
        type="button"
        onClick={onDiscard}
        disabled={(!dirty && !failed) || saving}
        aria-describedby={idle ? "ws-savebar-why" : undefined}
        className={`${TARGET} flex-1 rounded-lg border border-admin-border-soft bg-white px-4 text-[14px] font-semibold text-admin-ink disabled:opacity-40`}
      >
        {labels.discard}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={(!dirty && !failed) || saving}
        aria-describedby={idle ? "ws-savebar-why" : undefined}
        className={`${TARGET} flex-[2] rounded-lg bg-emerald-900 px-4 text-[14px] font-semibold text-white disabled:opacity-40`}
      >
        {saving ? labels.saving : failed ? labels.retry : labels.save}
      </button>
      </div>
    </div>
  );
}

/** One sheet, never stacked on another dialog. */
export function UnsavedExitSheet({
  title,
  body,
  onSaveAndLeave,
  onDiscard,
  onStay,
  labels,
}: {
  title: string;
  body: string;
  onSaveAndLeave: () => void;
  onDiscard: () => void;
  onStay: () => void;
  labels: { saveLeave: string; discard: string; stay: string };
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label={labels.stay} onClick={onStay} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-t-2xl bg-white px-5 pb-6 pt-5 font-admin-body shadow-xl"
      >
        <h2 className="text-[17px] font-semibold text-admin-ink">{title}</h2>
        <p className="mt-1 text-[14px] text-admin-ink-muted">{body}</p>
        <div className="mt-4 grid gap-2">
          <button type="button" onClick={onSaveAndLeave} className={`${TARGET} rounded-lg bg-emerald-900 text-[14px] font-semibold text-white`}>
            {labels.saveLeave}
          </button>
          <button type="button" onClick={onDiscard} className={`${TARGET} rounded-lg border border-red-200 bg-white text-[14px] font-semibold text-red-800`}>
            {labels.discard}
          </button>
          <button type="button" onClick={onStay} className={`${TARGET} rounded-lg border border-admin-border-soft bg-white text-[14px] font-semibold text-admin-ink`}>
            {labels.stay}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NavRow({ title, summary, onOpen }: { title: string; summary: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${TARGET} flex w-full items-center justify-between gap-3 border-b border-admin-border-soft px-4 py-3 text-left last:border-b-0 hover:bg-black/[0.02]`}
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-admin-ink">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-admin-ink-muted">{summary}</span>
      </span>
      <span aria-hidden className="text-[18px] text-admin-ink-dim">›</span>
    </button>
  );
}

export function SettingsCard({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-3 rounded-xl border border-admin-border-soft bg-white px-4 py-4">
      {title ? (
        <header className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-admin-ink">{title}</h2>
          {aside ? <span className="text-[12.5px] text-admin-ink-dim">{aside}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Operational groups say that nothing changes until Save. */
export function LiveOnSaveNote({ children }: { children: ReactNode }) {
  return <p className="mb-3 rounded-lg bg-black/[0.03] px-3.5 py-2.5 text-[12.5px] text-admin-ink-muted">{children}</p>;
}

export function ChoiceCard({
  checked,
  title,
  detail,
  disabledReason,
  onSelect,
}: {
  checked: boolean;
  title: string;
  detail?: string;
  /** When set the option is disabled and this says what is missing. */
  disabledReason?: string | null;
  onSelect: () => void;
}) {
  const disabled = Boolean(disabledReason);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      className={`${TARGET} flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left ${
        checked ? "border-emerald-900 bg-emerald-900/[0.04]" : "border-admin-border-soft bg-white"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span
        aria-hidden
        className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${checked ? "border-emerald-900 bg-emerald-900" : "border-admin-ink-dim"}`}
      />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-admin-ink">{title}</span>
        {disabledReason || detail ? (
          <span className="mt-0.5 block text-[12.5px] text-admin-ink-muted">{disabledReason ?? detail}</span>
        ) : null}
      </span>
    </button>
  );
}

export function Switch({
  checked,
  label,
  detail,
  onChange,
}: {
  checked: boolean;
  label: string;
  detail?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={`${TARGET} flex items-center justify-between gap-3 py-2`}>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-admin-ink">{label}</span>
        {detail ? <span className="mt-0.5 block text-[12.5px] text-admin-ink-muted">{detail}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="flex h-[44px] w-[52px] shrink-0 items-center"
      >
        <span className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-emerald-900" : "bg-black/[0.15]"}`}>
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
        </span>
      </button>
    </div>
  );
}

export function Stepper({
  label,
  detail,
  value,
  display,
  step,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  onChange,
  lessLabel,
  moreLabel,
}: {
  label: string;
  detail?: string;
  value: number;
  display: string;
  step: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  lessLabel: string;
  moreLabel: string;
}) {
  const btn = "flex size-[44px] items-center justify-center rounded-lg border border-admin-border-soft bg-white text-[18px] text-admin-ink";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-admin-border-soft py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-admin-ink">{label}</span>
        {detail ? <span className="mt-0.5 block text-[12.5px] text-admin-ink-muted">{detail}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label={`${lessLabel}: ${label}`} onClick={() => onChange(Math.max(min, value - step))} className={btn}>
          −
        </button>
        <output className="min-w-[64px] text-center text-[14px] font-semibold text-admin-ink">{display}</output>
        <button type="button" aria-label={`${moreLabel}: ${label}`} onClick={() => onChange(Math.min(max, value + step))} className={btn}>
          +
        </button>
      </span>
    </div>
  );
}

/** Inherited / Custom badge. Use only for fields where null means "use my default". */
export function SourceBadge({ source, t }: { source: "inherited" | "custom"; t: (s: string) => string }) {
  const custom = source === "custom";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
        custom ? "bg-amber-50 text-amber-900" : "bg-black/[0.05] text-admin-ink-muted"
      }`}
    >
      {custom ? t("Custom") : t("Inherited")}
    </span>
  );
}
