"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/shared — Phase 1d cross-cutting helpers.
//
// talent-drawers.tsx (6,204 LOC) decomposed into ./talent-drawers/*
// (byte-for-byte). This module owns the helpers used in 2+ extracted
// drawer chunks: SaveErrorBanner, StandardFooter, KvRow, SectionLabel,
// SubsectionLabel, ProfileSectionNotConnected, SummaryStat, ToggleRow.
// Bodies copied byte-for-byte; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useState, type ReactNode } from "react";
import { COLORS, FONTS, useAdminShell } from "../state";
import { Icon, PrimaryButton, SecondaryButton, Toggle } from "../primitives";

// Persistent error banner — stays until the user acts. Never toast-only.
export function SaveErrorBanner({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: "rgba(208,46,46,0.07)",
        border: "1px solid rgba(208,46,46,0.28)",
        borderRadius: 8,
        marginBottom: 12,
      }}
    >
      <span style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13, color: "#c0392b" }}>{error}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss error"
        style={{ background: "transparent", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}

export function StandardFooter({
  onSave,
  saveLabel = "Save",
  destructive,
}: {
  onSave?: () => void;
  saveLabel?: string;
  destructive?: { label: string; onClick: () => void };
}) {
  const { closeDrawer } = useAdminShell();
  return (
    <>
      {destructive && (
        <button
          onClick={destructive.onClick}
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            color: COLORS.red,
            padding: "8px 12px",
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            marginRight: "auto",
          }}
        >
          {destructive.label}
        </button>
      )}
      <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
      {onSave && <PrimaryButton onClick={onSave}>{saveLabel}</PrimaryButton>}
    </>
  );
}

export function KvRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", minWidth: 90 }} className="text-admin-ink-muted">
        {label}
      </span>
      <span style={{ fontFamily: FONTS.body, fontSize: 13.5 }} className="text-admin-ink">{value}</span>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }} className="text-admin-ink-muted">
      {children}
    </div>
  );
}

export function SubsectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">
      {children}
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  defaultOn,
  onChange,
}: {
  label: string;
  hint?: string;
  defaultOn?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const [on, setOn] = useState(defaultOn ?? false);
  const handleChange = (v: boolean) => { setOn(v); onChange?.(v); };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
      }}
    >
      <div className="flex-1">
        <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
          {label}
        </div>
        {hint && (
          <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">
            {hint}
          </div>
        )}
      </div>
      <Toggle on={on} onChange={handleChange} />
    </div>
  );
}

// ─── Profile-section panels: honest "not connected" state ────────
// These standalone drawers were prototype scaffolds rendering
// MY_TALENT_PROFILE fixtures with no real persistence. The real,
// DB-backed editor for every one of these domains is
// TalentProfileShellDrawer ("talent-profile-shell" / "talent-profile-edit").
// Phase 0A neutralises the mock bodies so a talent is never shown
// fabricated data as their own; live entry points were repointed to
// the real editor. See docs/phase-0a-deferred-drawers-2026-05-19.md.
export function ProfileSectionNotConnected({ section }: { section: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10 }} className="bg-admin-surface-alt">
      <div className="flex items-center gap-2.5">
        <Icon name="info" size={14} color={COLORS.inkMuted} />
        <span style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
          Not connected to your profile yet
        </span>
      </div>
      <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.6 }} className="text-admin-ink-muted">
        This {section} panel is not linked to your live profile yet. Nothing shown here is your
        real data, and saving is disabled so nothing incorrect is stored. Manage your real{" "}
        {section} from your profile editor (Edit profile).
      </p>
    </div>
  );
}

export function SummaryStat({ label, value, accent }: { label: string; value: string; accent: "green" | "ink" | "amber" }) {
  const tone = accent === "green" ? COLORS.green : accent === "amber" ? COLORS.amber : COLORS.ink;
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
      }}
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }} className="text-admin-ink-muted">
        {label}
      </div>
      <div style={{ fontFamily: FONTS.display, fontSize: 18, color: tone, marginTop: 4 }}>{value}</div>
    </div>
  );
}
