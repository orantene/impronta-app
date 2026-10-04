"use client";

import { COLORS, FONTS, RADIUS } from "@/components/admin/shell/internal/state";
import {
  buildBreakdownView,
  type BreakdownLine,
} from "@/lib/money/money-spine-view";

/**
 * M5 — Money · View breakdown (reconciliation) — Part1 p19–p21 `mc_breakdown`.
 * Opens from Payouts "View breakdown"; back returns to Money spine.
 */
export function MoneyBreakdownPanel({ onBack }: { onBack: () => void }) {
  const view = buildBreakdownView();

  return (
    <div data-money-breakdown="m5" style={{ fontFamily: FONTS.body }}>
      <style>{`
        @media (max-width: 720px) {
          [data-money-breakdown] [data-money-bd-layout] {
            flex-direction: column !important;
          }
          [data-money-breakdown] [data-money-bd-why] {
            max-width: none !important;
            margin-top: 4px;
          }
        }
      `}</style>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          data-money-bd-back
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            height: 32,
            padding: "0 2px",
            border: "none",
            background: "transparent",
            color: COLORS.indigoDeep,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: FONTS.body,
          }}
        >
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
            ‹
          </span>
          Money
        </button>
        <h1
          data-tulala-h1
          style={{
            margin: 0,
            flex: 1,
            fontFamily: FONTS.display,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: -0.35,
            color: COLORS.ink,
            lineHeight: 1.2,
          }}
        >
          {view.title}
        </h1>
      </header>

      <div
        data-money-bd-layout
        style={{ display: "flex", gap: 20, alignItems: "flex-start" }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <BreakdownCard title={view.processorTitle} lines={view.processorLines} />
          <BreakdownCard
            title={view.outsideTitle}
            lines={view.outsideLines}
            foot={view.outsideFoot}
          />
          <BreakdownCard lines={view.collectedLines} />
        </div>

        <aside
          data-money-bd-why
          style={{
            width: 260,
            maxWidth: "36%",
            flexShrink: 0,
            padding: "14px 16px",
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.borderSoft}`,
            background: "rgba(11,11,13,0.03)",
          }}
        >
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: COLORS.ink,
              lineHeight: 1.35,
              marginBottom: 8,
            }}
          >
            {view.whyTitle}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: COLORS.inkMuted,
              lineHeight: 1.5,
            }}
          >
            {view.whyBody}
          </p>
        </aside>
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  lines,
  foot,
}: {
  title?: string;
  lines: readonly BreakdownLine[];
  foot?: string;
}) {
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.lg,
        padding: title ? "14px 4px 6px" : "6px 4px",
      }}
    >
      {title ? (
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: COLORS.ink,
            padding: "0 14px 8px",
          }}
        >
          {title}
        </div>
      ) : null}
      {lines.map((line, i) => (
        <BreakdownRow key={`${line.label}-${i}`} line={line} first={i === 0 && !title} />
      ))}
      {foot ? (
        <p
          style={{
            margin: "4px 14px 10px",
            fontSize: 12.5,
            color: COLORS.inkDim,
            lineHeight: 1.45,
            fontStyle: "italic",
          }}
        >
          {foot}
        </p>
      ) : null}
    </section>
  );
}

function BreakdownRow({ line, first }: { line: BreakdownLine; first?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        padding: "12px 14px",
        borderTop: first ? "none" : `1px solid ${COLORS.borderSoft}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: line.strong ? 700 : 500,
            color: COLORS.ink,
            lineHeight: 1.35,
          }}
        >
          {line.label}
        </div>
        {line.sub ? (
          <div
            style={{
              fontSize: 12.5,
              color: COLORS.inkMuted,
              marginTop: 3,
              lineHeight: 1.4,
            }}
          >
            {line.sub}
          </div>
        ) : null}
      </div>
      <div
        style={{
          flexShrink: 0,
          fontSize: 14.5,
          fontWeight: line.strong ? 700 : 600,
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {line.amountLabel}
      </div>
    </div>
  );
}
