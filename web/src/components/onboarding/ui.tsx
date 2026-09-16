"use client";

/**
 * Small presentational pieces the module's steps share. Tokens are the
 * marketing surface's `--tl-*` set (globals.css), so the overlay reads as the
 * same product as the page beneath it: bone paper, forest ink, one accent.
 */

import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-forest-bright)" }}>
      {children}
    </p>
  );
}

export function Title({ children, size = 28 }: { children: ReactNode; size?: number }) {
  return (
    <h2
      className="tl-display mt-2 font-semibold leading-[1.1] tracking-[-0.03em]"
      style={{ color: "var(--tl-ink)", fontSize: size }}
    >
      {children}
    </h2>
  );
}

export function Sub({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-[0.9375rem] leading-[1.5]" style={{ color: "var(--tl-ink-soft)" }}>
      {children}
    </p>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  testId?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold transition-opacity disabled:opacity-40"
      style={{ background: "var(--tl-forest)", color: "var(--tl-forest-on)" }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium transition-colors disabled:opacity-40"
      style={{ background: "transparent", color: "var(--tl-ink)", border: "1px solid var(--tl-hairline-strong)" }}
    >
      {children}
    </button>
  );
}

export function GhostLink({ children, onClick, testId }: { children: ReactNode; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="text-[0.875rem] font-medium underline-offset-4 hover:underline"
      style={{ color: "var(--tl-forest)" }}
    >
      {children}
    </button>
  );
}

export function Notice({ children, tone = "muted", testId }: { children: ReactNode; tone?: "muted" | "warn" | "error"; testId?: string }) {
  const color = tone === "error" ? "var(--tl-error)" : tone === "warn" ? "var(--tl-warning)" : "var(--tl-muted)";
  const bg = tone === "error" ? "var(--tl-error-bg)" : tone === "warn" ? "var(--tl-warning-bg)" : "var(--tl-stone-soft)";
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      aria-live="polite"
      data-testid={testId}
      className="mt-3 rounded-[14px] px-3 py-2 text-[0.8125rem] leading-[1.45]"
      style={{ color, background: bg }}
    >
      {children}
    </p>
  );
}

export function MicGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function StopGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function Tick({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center rounded-full text-[0.7rem]"
      style={{
        background: done ? "var(--tl-positive)" : "transparent",
        color: done ? "#fff" : "var(--tl-muted)",
        border: done ? "none" : "1px solid var(--tl-hairline-strong)",
      }}
    >
      {done ? "✓" : ""}
    </span>
  );
}
