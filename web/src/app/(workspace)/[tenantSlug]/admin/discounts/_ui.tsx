/**
 * The Promotions page's presentation, server-renderable: the table head and
 * row, the small pill, a disabled button that carries its reason, the step
 * number. Token classes only.
 */

import type { ReactNode } from "react";

export function RowHead({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div role="row" className={`grid gap-3 px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-admin-ink-muted ${cols}`}>
      {children}
    </div>
  );
}

export function Row({ cols, name, children }: { cols: string; name: string; children: ReactNode }) {
  return (
    <div role="row" aria-label={name} className={`grid items-center gap-3 border-t border-admin-border-soft px-[18px] py-3 text-[12.5px] text-admin-ink ${cols}`}>
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
      className="inline-flex h-[30px] cursor-not-allowed items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-admin-border bg-admin-card px-3 text-[12px] font-semibold text-admin-ink opacity-50"
    >
      {children}
    </button>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-admin-surface-alt text-[10px] font-bold text-admin-ink-muted">{children}</span>;
}
