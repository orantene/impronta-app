"use client";

import type { ReactNode } from "react";

import { COLORS, FONTS, RADIUS, Z } from "@/components/admin/shell/internal/state";
import type { PayoutDetailView } from "@/lib/money/money-spine-view";

export function PayoutDetailDrawer({
  detail,
  onClose,
  onOpenPayment,
  onUpdateAccount,
}: {
  detail: PayoutDetailView;
  onClose: () => void;
  onOpenPayment?: (paymentId: string) => void;
  onUpdateAccount?: () => void;
}) {
  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.drawerBackdrop,
        background: "rgba(18,23,26,0.3)",
      }}
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-label="Payout"
        data-money-payout-detail={detail.failed ? "failed" : detail.payout.id}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "min(500px, 100vw)",
          background: "#fff",
          zIndex: Z.drawerPanel,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-20px 0 50px -30px rgba(0,0,0,0.4)",
          fontFamily: FONTS.body,
        }}
      >
        <header
          style={{
            padding: "18px 22px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 19,
                fontWeight: 600,
                color: COLORS.ink,
              }}
            >
              Payout
            </div>
            <div style={{ fontSize: 13.5, color: COLORS.inkMuted, marginTop: 3 }}>
              {detail.dayLabel}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.inkMuted,
              fontSize: 18,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            padding: "16px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div
              style={{
                flex: 1,
                fontFamily: FONTS.display,
                fontSize: 28,
                fontWeight: 700,
                color: COLORS.ink,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
              }}
            >
              {detail.netLabel}
            </div>
            <Chip label={detail.stateChip} tone={detail.stateTone} />
          </div>

          {detail.alert ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: RADIUS.md,
                background: COLORS.criticalSoft,
                color: COLORS.criticalDeep,
                fontSize: 13.5,
                lineHeight: 1.5,
              }}
            >
              <b>{detail.alert.title}</b>
              <br />
              {detail.alert.body}
            </div>
          ) : null}

          <CardPad>
            <Kv label="To" value={detail.toBank} />
            <Divider />
            <Kv label={detail.arrivedKey} value={detail.arrivedLabel} />
            <Divider />
            <Kv label="Reference" value={detail.reference} mono />
          </CardPad>

          <CardPad>
            {detail.lines.map((line, i) => {
              const isPay = line.kind === "payment" && line.paymentId && onOpenPayment;
              const row = (
                <Line
                  key={`${line.kind}-${line.label}-${i}`}
                  label={line.label}
                  value={line.amountLabel}
                  strong={line.strong}
                  last={i === detail.lines.length - 1}
                />
              );
              if (!isPay) return row;
              return (
                <button
                  key={`${line.kind}-${line.label}-${i}`}
                  type="button"
                  onClick={() => onOpenPayment!(line.paymentId!)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: 0,
                    margin: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: FONTS.body,
                  }}
                >
                  {row}
                </button>
              );
            })}
          </CardPad>

          {detail.estimatedNote ? (
            <p style={{ margin: 0, fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
              {detail.estimatedNote}
            </p>
          ) : null}
        </div>

        {detail.failed ? (
          <footer
            style={{
              padding: "14px 22px",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              background: COLORS.surfaceAlt,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <PrimaryBtn
              label="Update payout account"
              onClick={() => {
                onUpdateAccount?.();
              }}
              grow
            />
            <span data-money-desk-po-cta>
              <OutlineBtn label="Contact support" />
            </span>
          </footer>
        ) : detail.showDownloadStatement ? (
          <footer
            data-money-desk-po-cta
            style={{
              padding: "14px 22px",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              background: COLORS.surfaceAlt,
            }}
          >
            <OutlineBtn label="Download statement" />
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "info" | "risk";
}) {
  const styles =
    tone === "ok"
      ? { background: COLORS.successSoft, color: COLORS.successDeep }
      : tone === "risk"
        ? { background: COLORS.criticalSoft, color: COLORS.criticalDeep }
        : { background: COLORS.indigoSoft, color: COLORS.indigoDeep };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...styles,
      }}
    >
      {label}
    </span>
  );
}

function CardPad({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.lg,
        padding: "4px 16px",
        background: "#fff",
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: `1px solid ${COLORS.borderSoft}` }} />;
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "11px 0",
        fontSize: 13.5,
        alignItems: "baseline",
      }}
    >
      <span style={{ width: 100, flexShrink: 0, color: COLORS.inkMuted }}>{label}</span>
      <span
        style={{
          flex: 1,
          color: COLORS.ink,
          fontFamily: mono ? FONTS.mono : FONTS.body,
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  last,
}: {
  label: string;
  value: string;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        fontSize: 14,
        borderBottom: last ? "none" : `1px solid ${COLORS.borderSoft}`,
      }}
    >
      <span style={{ color: strong ? COLORS.ink : COLORS.inkMuted, fontWeight: strong ? 700 : 500 }}>
        {label}
      </span>
      <span
        style={{
          fontWeight: strong ? 700 : 600,
          fontVariantNumeric: "tabular-nums",
          color: COLORS.ink,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function OutlineBtn({ label }: { label: string }) {
  return (
    <button
      type="button"
      style={{
        height: 38,
        padding: "0 14px",
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.border}`,
        background: "#fff",
        fontSize: 13.5,
        fontWeight: 600,
        color: COLORS.ink,
        cursor: "pointer",
        fontFamily: FONTS.body,
      }}
    >
      {label}
    </button>
  );
}

function PrimaryBtn({
  label,
  onClick,
  grow,
}: {
  label: string;
  onClick?: () => void;
  grow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 38,
        padding: "0 14px",
        borderRadius: RADIUS.md,
        border: "none",
        background: COLORS.ink,
        fontSize: 13.5,
        fontWeight: 600,
        color: "#fff",
        cursor: "pointer",
        fontFamily: FONTS.body,
        flex: grow ? 1 : undefined,
      }}
    >
      {label}
    </button>
  );
}
