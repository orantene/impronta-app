"use client";

import type { ReactNode } from "react";

import { COLORS, FONTS, RADIUS, Z } from "@/components/admin/shell/internal/state";

/**
 * Shared task overlay for Money request / record / refund / correct sheets
 * (`mc_req_*`, `mc_record`, `mc_refund`, `mc_cash_correct`).
 */
export function MoneyTaskSheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  "data-money-sheet": dataAttr,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  "data-money-sheet"?: string;
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
        aria-label={title}
        data-money-sheet={dataAttr}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: wide ? "min(560px, calc(100vw - 16px))" : "min(480px, calc(100vw - 16px))",
          maxHeight: "min(820px, calc(100vh - 24px))",
          background: "#fff",
          zIndex: Z.drawerPanel,
          display: "flex",
          flexDirection: "column",
          borderRadius: RADIUS.lg,
          boxShadow: "0 24px 60px -28px rgba(0,0,0,0.45)",
          fontFamily: FONTS.body,
          overflow: "hidden",
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 19,
                fontWeight: 600,
                color: COLORS.ink,
              }}
            >
              {title}
            </div>
            {subtitle ? (
              <div style={{ fontSize: 13.5, color: COLORS.inkMuted, marginTop: 3 }}>{subtitle}</div>
            ) : null}
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
          {children}
        </div>
        {footer ? (
          <footer
            style={{
              padding: "14px 22px",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              background: COLORS.surfaceAlt,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

export function MoneySheetBtn({
  label,
  onClick,
  primary,
  disabled,
  danger,
}: {
  label: string;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 40,
        padding: "0 16px",
        borderRadius: RADIUS.md,
        border: primary || danger ? "none" : `1px solid ${COLORS.border}`,
        background: disabled
          ? "rgba(11,11,13,0.08)"
          : primary
            ? COLORS.ink
            : danger
              ? COLORS.critical
              : "#fff",
        color: disabled ? COLORS.inkMuted : primary || danger ? "#fff" : COLORS.ink,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: FONTS.body,
      }}
    >
      {label}
    </button>
  );
}

export function MoneyOpt({
  title,
  detail,
  selected,
  onClick,
}: {
  title: string;
  detail?: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        border: selected ? `2px solid ${COLORS.indigoDeep}` : `1px solid ${COLORS.border}`,
        background: selected ? COLORS.indigoSoft : "#fff",
        cursor: "pointer",
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ fontSize: 14.5, fontWeight: 700, color: COLORS.ink }}>{title}</div>
      {detail ? (
        <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginTop: 3, lineHeight: 1.4 }}>
          {detail}
        </div>
      ) : null}
    </button>
  );
}

export function MoneyField({
  label,
  value,
  onChange,
  hint,
  prefix,
  suffix,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          color: COLORS.inkMuted,
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          padding: "0 12px",
          background: "#fff",
          height: 42,
        }}
      >
        {prefix ? <span style={{ color: COLORS.inkMuted, fontWeight: 600 }}>{prefix}</span> : null}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 14.5,
            fontFamily: FONTS.body,
            background: "transparent",
            minWidth: 0,
          }}
        />
        {suffix ? <span style={{ color: COLORS.inkMuted, fontSize: 13 }}>{suffix}</span> : null}
      </span>
      {hint ? (
        <span style={{ display: "block", fontSize: 12.5, color: COLORS.inkDim, marginTop: 5 }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function MoneyNote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: RADIUS.md,
        background: "rgba(11,11,13,0.04)",
        fontSize: 13.5,
        lineHeight: 1.5,
        color: COLORS.inkMuted,
      }}
    >
      {children}
    </div>
  );
}

export function MoneyToast({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-money-toast
      style={{
        position: "fixed",
        left: "50%",
        bottom: 28,
        transform: "translateX(-50%)",
        zIndex: Z.drawerPanel + 2,
        background: COLORS.ink,
        color: "#fff",
        padding: "12px 18px",
        borderRadius: 99,
        fontSize: 13.5,
        fontWeight: 600,
        fontFamily: FONTS.body,
        boxShadow: "0 12px 32px -16px rgba(0,0,0,0.5)",
        maxWidth: "min(420px, calc(100vw - 32px))",
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}
