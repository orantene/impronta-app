/**
 * The Promotions page's presentation, server-renderable: the table head and
 * row, the small pill, a disabled button that carries its reason, the step
 * number. Token classes only.
 */

import type { ReactNode } from "react";

export function RowHead({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div role="row" className={`grid items-center gap-3 px-[18px] py-2.5 text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.05em] text-admin-ink-muted ${cols}`}>
      {children}
    </div>
  );
}

export function Row({ cols, name, children }: { cols: string; name: string; children: ReactNode }) {
  return (
    <div role="row" aria-label={name} className={`grid min-h-[50px] items-center gap-3 border-t border-admin-border-soft px-[18px] py-3 text-[12.5px] leading-[1.2] text-admin-ink ${cols}`}>
      {children}
    </div>
  );
}

export function Pill({ tone, children }: { tone: "green" | "slate"; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        tone === "green" ? "bg-admin-success-soft text-admin-green" : "bg-admin-amber-soft text-admin-amber"
      }`}
    >
      {children}
    </span>
  );
}

export function DisabledButton({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled
      title={reason}
      data-not-wired="true"
      className="inline-flex h-[30px] w-full cursor-not-allowed items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-admin-border bg-admin-card px-3 text-[12.5px] font-semibold leading-[1.2] text-admin-ink opacity-50"
    >
      {children}
    </button>
  );
}

/** W08's stacking step: `1 · Price list` as a grey chip; the live step carries its word in the brand's tint. */
export function StepChip({ n, children, reason, live }: { n: number; children: ReactNode; reason?: string; live?: string }) {
  return (
    <li
      title={reason}
      className={`inline-flex h-[20px] items-center gap-[6px] rounded-[6px] px-[8px] text-[11.5px] font-semibold leading-none ${
        reason ? "bg-admin-surface-alt text-admin-ink-muted" : "bg-admin-surface-alt text-admin-ink"
      }`}
    >
      {n} · {children}
      {live ? <span className="rounded-[4px] bg-admin-success-soft px-[5px] py-[1px] text-[10px] font-bold text-admin-success-deep">{live}</span> : null}
    </li>
  );
}
