"use client";

import type { ReactNode } from "react";

import { COLORS, FONTS, RADIUS, Z } from "@/components/admin/shell/internal/state";
import type { PaymentDetailView } from "@/lib/money/money-spine-view";
import {
  formatMoneyMajor,
  formatMoneyShort,
} from "@/lib/money/money-spine-format";

export function PaymentDetailDrawer({
  detail,
  onClose,
}: {
  detail: PaymentDetailView;
  onClose: () => void;
}) {
  const { payment, refund } = detail;
  const isCard = payment.method === "card";

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
        aria-label="Payment"
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
              Payment
            </div>
            <div style={{ fontSize: 13.5, color: COLORS.inkMuted, marginTop: 3 }}>
              {detail.receivedLabel.split(" · ")[0]} · {payment.id}
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
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Avatar initials={detail.initials} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink }}>
                {payment.clientName}
              </div>
              <div style={{ fontSize: 14, color: COLORS.inkMuted }}>{payment.forLabel}</div>
            </div>
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {formatMoneyMajor(payment.amount)}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip label={detail.stateChip} tone={refund ? "idle" : "ok"} />
            <Chip label={isCard ? "Card · through Tulala" : detail.methodLine} tone="idle" />
          </div>

          <CardPad>
            <Kv label="Received" value={detail.receivedLabel} />
            <Divider />
            <Kv label="Method" value={detail.methodLine} />
            <Divider />
            <Kv label="Reference" value={detail.reference} mono />
            <Divider />
            <Kv label="For" value={detail.forLine} />
            {detail.payoutLine ? (
              <>
                <Divider />
                <Kv label="Payout" value={detail.payoutLine} accent />
              </>
            ) : null}
          </CardPad>

          <CardPad>
            <Line label="Agreed price" value={formatMoneyMajor(detail.agreed)} />
            {detail.priceLowered && refund ? (
              <Line
                label="Price lowered"
                value={`${formatMoneyShort(payment.amount)} → ${formatMoneyShort(detail.agreed)}`}
              />
            ) : null}
            <Line label="Paid so far" value={formatMoneyMajor(detail.paidSoFar)} />
            <Line label="Remaining" value={formatMoneyMajor(detail.remaining)} strong />
          </CardPad>

          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: COLORS.inkMuted,
                marginBottom: 8,
              }}
            >
              History
            </div>
            <CardPad>
              {detail.history.map((h) => (
                <div
                  key={`${h.when}-${h.text}`}
                  style={{
                    padding: "10px 0",
                    borderBottom: `1px solid ${COLORS.borderSoft}`,
                    fontSize: 13.5,
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontWeight: 600, color: COLORS.ink }}>{h.when}</div>
                  <div style={{ color: COLORS.inkMuted, marginTop: 2 }}>{h.text}</div>
                </div>
              ))}
            </CardPad>
          </div>
        </div>

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
          <OutlineBtn label="Message" />
          <OutlineBtn label="Receipt" />
          <OutlineBtn label={isCard ? "Refund" : "Correct record"} />
        </footer>
      </aside>
    </div>
  );
}

function Avatar({ initials, size }: { initials: string; size: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: "rgba(11,11,13,0.08)",
        color: COLORS.inkMuted,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.32,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "idle" | "risk" | "info";
}) {
  const styles =
    tone === "ok"
      ? { background: COLORS.successSoft, color: COLORS.successDeep }
      : tone === "risk"
        ? { background: COLORS.criticalSoft, color: COLORS.criticalDeep }
        : tone === "info"
          ? { background: COLORS.indigoSoft, color: COLORS.indigoDeep }
          : { background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted };
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
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
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
          color: accent ? COLORS.indigoDeep : COLORS.ink,
          fontFamily: mono ? FONTS.mono : FONTS.body,
          fontWeight: accent ? 600 : 500,
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
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        fontSize: 14,
        borderBottom: `1px solid ${COLORS.borderSoft}`,
      }}
    >
      <span style={{ color: COLORS.inkMuted }}>{label}</span>
      <span
        style={{
          fontWeight: strong ? 700 : 600,
          fontVariantNumeric: "tabular-nums",
          color: COLORS.ink,
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
