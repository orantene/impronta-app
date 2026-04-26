"use client";

/**
 * Phase 13 — contrast checker for the Theme Drawer.
 *
 * Shows the WCAG contrast ratio for the most important brand pairings
 * (primary text on background, ink on surface, etc.) so the operator
 * sees at a glance which combinations pass AA / AAA.
 *
 * Pure read of the resolved token map — never mutates colors. The
 * operator fixes a fail by editing the underlying color in the same
 * tab.
 */

import {
  classifyContrast,
  contrastRatio,
  type ContrastVerdict,
} from "@/lib/site-admin/a11y/contrast";

interface Pair {
  label: string;
  fgKey: string;
  bgKey: string;
  /** Optional fallback if a token is unset — uses platform defaults. */
  fgFallback?: string;
  bgFallback?: string;
}

const PAIRS: ReadonlyArray<Pair> = [
  {
    label: "Ink on Surface",
    fgKey: "color.ink",
    bgKey: "color.surface-raised",
    fgFallback: "#111111",
    bgFallback: "#ffffff",
  },
  {
    label: "Primary on Background",
    fgKey: "color.primary",
    bgKey: "color.background",
    fgFallback: "#111111",
    bgFallback: "#ffffff",
  },
  {
    label: "Secondary on Surface",
    fgKey: "color.secondary",
    bgKey: "color.surface-raised",
    fgFallback: "#444444",
    bgFallback: "#ffffff",
  },
  {
    label: "Muted text on Surface",
    fgKey: "color.muted",
    bgKey: "color.surface-raised",
    fgFallback: "#666666",
    bgFallback: "#ffffff",
  },
  {
    label: "Accent on Background",
    fgKey: "color.accent",
    bgKey: "color.background",
    fgFallback: "#111111",
    bgFallback: "#ffffff",
  },
];

const VERDICT_LABEL: Record<ContrastVerdict, string> = {
  fail: "Fails AA",
  "aa-large": "AA large only",
  aa: "AA pass",
  aaa: "AAA pass",
};

const VERDICT_TONE: Record<ContrastVerdict, string> = {
  fail: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "aa-large": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  aa: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  aaa: "bg-emerald-600/20 text-emerald-800 dark:text-emerald-200",
};

interface ContrastCheckerProps {
  draft: Record<string, string>;
}

export function ContrastChecker({ draft }: ContrastCheckerProps) {
  const rows = PAIRS.map((p) => {
    const fg = draft[p.fgKey] || p.fgFallback || "#000000";
    const bg = draft[p.bgKey] || p.bgFallback || "#ffffff";
    const ratio = contrastRatio(fg, bg);
    const verdict = classifyContrast(ratio);
    return { ...p, fg, bg, ratio, verdict };
  });
  const failing = rows.filter((r) => r.verdict === "fail").length;

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          WCAG contrast
        </span>
        {failing > 0 ? (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
            {failing} failing
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
            All pass
          </span>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-border/40">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-5 w-5 rounded-md ring-1 ring-border/40"
                style={{
                  background: r.bg,
                  color: r.fg,
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                }}
                aria-hidden
              >
                Aa
              </span>
              <span className="text-[12px]">{r.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {r.ratio ? r.ratio.toFixed(2) : "—"}:1
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${VERDICT_TONE[r.verdict]}`}
              >
                {VERDICT_LABEL[r.verdict]}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
