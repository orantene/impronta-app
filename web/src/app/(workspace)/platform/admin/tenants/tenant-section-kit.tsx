"use client";

/**
 * Platform Admin — tenant management section primitives.
 *
 * Shared building blocks (accordion, buttons, confirm modal, inline
 * feedback, date helpers) for the section components in tenant-sections.tsx
 * and tenant-sections-manage.tsx. Split out to keep each file within the
 * file-size budget.
 */

import { useState, type ReactNode } from "react";
import { HQ, HQ_F, HQ_FD } from "./hq-kit";
import type { TenantManagementDetail } from "../../tenant-management-data";

export type OnChanged = () => void | Promise<void>;

export type SectionProps = {
  detail: TenantManagementDetail;
  onChanged: OnChanged;
  defaultOpen?: boolean;
};

// ─── Date helpers ──────────────────────────────────────────────────────────────

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

// ─── Accordion ─────────────────────────────────────────────────────────────────

export function Accordion({
  title,
  hint,
  trailing,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  trailing?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        fontFamily: HQ_F,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            color: HQ.inkDim,
            fontSize: 11,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            display: "inline-block",
            width: 10,
          }}
        >
          ▶
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.9,
            textTransform: "uppercase",
            color: HQ.ink,
          }}
        >
          {title}
        </span>
        {hint && (
          <span style={{ fontSize: 11.5, color: HQ.inkDim }}>{hint}</span>
        )}
        <span style={{ flex: 1 }} />
        {trailing}
      </button>
      {open && (
        <div
          style={{
            padding: "4px 14px 14px",
            borderTop: `1px solid ${HQ.borderSoft}`,
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

// ─── Feedback ──────────────────────────────────────────────────────────────────

export function Feedback({
  msg,
}: {
  msg: { tone: "ok" | "err"; text: string } | null;
}) {
  if (!msg) return null;
  const ok = msg.tone === "ok";
  return (
    <div
      role={ok ? "status" : "alert"}
      style={{
        marginTop: 10,
        padding: "8px 10px",
        borderRadius: 8,
        fontSize: 12,
        background: ok ? HQ.greenSoft : HQ.redSoft,
        color: ok ? HQ.green : HQ.red,
        border: `1px solid ${ok ? "rgba(93,211,160,0.25)" : "rgba(243,103,114,0.25)"}`,
      }}
    >
      {msg.text}
    </div>
  );
}

// ─── Button ────────────────────────────────────────────────────────────────────

export function Btn({
  children,
  onClick,
  tone = "neutral",
  disabled,
  type = "button",
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "neutral" | "primary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  size?: "sm" | "md";
}) {
  const palette =
    tone === "primary"
      ? { bg: HQ.greenSoft, color: HQ.green, border: "rgba(93,211,160,0.3)" }
      : tone === "danger"
        ? { bg: HQ.redSoft, color: HQ.red, border: "rgba(243,103,114,0.3)" }
        : { bg: HQ.cardSoft, color: HQ.ink, border: HQ.borderSoft };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: size === "sm" ? "4px 9px" : "7px 13px",
        borderRadius: 8,
        background: palette.bg,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        fontSize: size === "sm" ? 11.5 : 12.5,
        fontWeight: 600,
        fontFamily: HQ_F,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export const inputStyle: React.CSSProperties = {
  background: HQ.bg,
  border: `1px solid ${HQ.border}`,
  borderRadius: 8,
  color: HQ.ink,
  fontSize: 12.5,
  fontFamily: HQ_F,
  padding: "7px 9px",
  width: "100%",
  outline: "none",
};

// ─── Confirm modal ─────────────────────────────────────────────────────────────

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  pending,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: HQ.card,
          border: `1px solid ${HQ.border}`,
          borderRadius: 14,
          padding: 20,
          maxWidth: 380,
          width: "100%",
          fontFamily: HQ_F,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            color: HQ.ink,
            fontFamily: HQ_FD,
          }}
        >
          {title}
        </h3>
        <div style={{ margin: "8px 0 16px", fontSize: 12.5, color: HQ.inkMuted }}>
          {body}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn onClick={onCancel} disabled={pending}>
            Cancel
          </Btn>
          <Btn tone="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}
