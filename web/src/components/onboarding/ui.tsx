"use client";

/**
 * Small presentational pieces the module's steps share. Tokens are the
 * marketing surface's `--tl-*` set (globals.css), so the overlay reads as the
 * same product as the page beneath it: bone paper, forest ink, one accent.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-forest-bright)" }}>
      {children}
    </p>
  );
}

export function Title({ children, size = 28, tone = "ink" }: { children: ReactNode; size?: number; tone?: "ink" | "inverse" }) {
  return (
    <h2
      className="tl-display mt-2 font-semibold leading-[1.1] tracking-[-0.03em]"
      style={{ color: tone === "inverse" ? "var(--tl-on-inverse)" : "var(--tl-ink)", fontSize: size }}
    >
      {children}
    </h2>
  );
}

export function Sub({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "inverse" }) {
  return (
    <p className="mt-2 text-[0.9375rem] leading-[1.5]" style={{ color: tone === "inverse" ? "var(--tl-on-inverse)" : "var(--tl-ink-soft)", opacity: tone === "inverse" ? 0.85 : 1 }}>
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

/**
 * A step list that visibly moves while a server call runs: done lines get a
 * tick, the current line a spinning ring, the rest wait. `activeIndex` is
 * the line in progress; everything before it is done.
 */
export function LoadingSteps({ items, activeIndex, tone = "ink" }: { items: string[]; activeIndex: number; tone?: "ink" | "inverse" }) {
  const inkColor = tone === "inverse" ? "var(--tl-on-inverse)" : "var(--tl-ink)";
  const mutedColor = tone === "inverse" ? "rgba(255,255,255,0.55)" : "var(--tl-muted)";
  return (
    <ul className="mt-5 flex flex-col gap-3" data-testid="onb-loading-steps" data-active={activeIndex}>
      {items.map((line, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li
            key={line}
            className="flex items-center gap-3 text-[0.9375rem] transition-colors duration-300"
            style={{ color: done || active ? inkColor : mutedColor, fontWeight: active ? 600 : 400 }}
          >
            {active ? (
              <span
                aria-hidden
                className="inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: "var(--tl-positive)", borderTopColor: "transparent" }}
              />
            ) : (
              <Tick done={done} />
            )}
            {line}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Time-based progress for a call whose length we can only estimate: fills to
 * 92% over `expectedMs`, then creeps, and snaps to 100% when `done`. Honest
 * enough (the estimate is measured) and never sits still, which is what keeps
 * a person on the screen.
 */
export function ProgressBar({ expectedMs, done, label }: { expectedMs: number; done?: boolean; label?: string }) {
  const [pct, setPct] = useState(0);
  const startRef = useRef<number>(0);
  useEffect(() => {
    startRef.current = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const base = Math.min(92, (elapsed / expectedMs) * 92);
      const creep = elapsed > expectedMs ? Math.min(6, ((elapsed - expectedMs) / expectedMs) * 6) : 0;
      setPct(base + creep);
    }, 250);
    return () => window.clearInterval(id);
  }, [expectedMs]);
  const value = done ? 100 : pct;
  return (
    <div className="mt-5" data-testid="onb-progress">
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--tl-stone-soft)" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
        <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${value}%`, background: "var(--tl-positive)" }} />
      </div>
      {label ? <p className="mt-2 text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{label}</p> : null}
    </div>
  );
}

/** Rotates through short lines while something runs, so the screen never reads as stuck. */
export function WhileYouWait({ lines, everyMs = 3500, tone = "ink" }: { lines: string[]; everyMs?: number; tone?: "ink" | "inverse" }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % lines.length), everyMs);
    return () => window.clearInterval(id);
  }, [lines.length, everyMs]);
  return (
    <p key={i} className="mt-4 min-h-[1.5em] text-[0.8125rem] italic animate-in fade-in duration-500" style={{ color: tone === "inverse" ? "var(--tl-on-inverse)" : "var(--tl-ink-soft)", opacity: tone === "inverse" ? 0.85 : 1 }} data-testid="onb-while-you-wait" aria-live="polite">
      {lines[i] ?? ""}
    </p>
  );
}
