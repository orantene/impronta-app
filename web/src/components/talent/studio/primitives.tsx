"use client";

import type { ReactNode } from "react";

export type ChipTone = "ok" | "info" | "warn" | "risk" | "idle" | "brand";

const CHIP: Record<ChipTone, string> = {
  ok: "bg-admin-green-soft text-admin-green",
  info: "bg-[rgba(91,107,160,0.10)] text-[#5B6BA0]",
  warn: "bg-[rgba(82,96,109,0.10)] text-[#52606D]",
  risk: "bg-[rgba(176,48,58,0.10)] text-[#B0303A]",
  idle: "bg-[rgba(11,11,13,0.05)] text-[rgba(11,11,13,0.55)]",
  brand: "bg-admin-brand-soft text-admin-brand",
};

export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${CHIP[tone]}`}>
      {children}
    </span>
  );
}

type BtnKind = "primary" | "sec" | "qt" | "dgr";

const BTN: Record<BtnKind, string> = {
  primary: "bg-admin-brand text-white",
  sec: "border border-admin-border bg-white text-admin-ink",
  qt: "bg-transparent text-admin-ink-muted",
  dgr: "bg-[rgba(176,48,58,0.10)] text-[#B0303A]",
};

export function Btn({
  kind = "primary",
  size = "lg",
  children,
  ...rest
}: {
  kind?: BtnKind;
  size?: "sm" | "lg";
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-4 py-2 text-[14px]";
  return (
    <button type="button" className={`rounded-[10px] font-semibold ${pad} ${BTN[kind]}`} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[12px] border border-admin-border-soft bg-white shadow-admin-rest ${className}`}>
      {children}
    </div>
  );
}

export function SunkCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[12px] bg-admin-surface ${className}`}>{children}</div>
  );
}

export function SheetMobile({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[calc(100%-48px)] w-full flex-col rounded-t-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <footer className="border-t border-admin-border-soft p-4">{footer}</footer>}
      </div>
    </div>
  );
}

export function DialogDesktop({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white"
        style={{ maxHeight: "calc(100% - 48px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <footer className="border-t border-admin-border-soft px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}

export function TimelineRow({ when, children }: { when: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-[13px]">
      <span className="text-admin-ink-muted">{when}</span>
      <span>{children}</span>
    </div>
  );
}

/** A missing figure is "not shared". It is never rendered as 0. */
export function StatLine({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-admin-ink-muted">{label}</span>
      <span className="font-semibold">{value == null ? "not shared" : value}</span>
    </div>
  );
}
