"use client";

// ============================================================================
// _skill-verify-dialog.tsx — Verify-skill confirmation modal.
//
// Extracted from the original _skill-slot-panel.tsx during the Phase 2
// refactor. The dialog stakes the agency's reputation on a skill-level
// assertion, capturing an optional internal note + (when enabled) a
// platform-vs-agency scope choice.
// ============================================================================

import { useState } from "react";

import {
  PROFICIENCY_META,
  type ResolvedSkill,
} from "@/lib/server-actions/admin-talent-skills.types";

import { useDashboardText } from "./dashboard-i18n";
import { F_BODY, T } from "./skill-tokens";

export function VerifyConfirmDialog({
  skill,
  canChooseScope,
  onCancel,
  onConfirm,
}: {
  skill: ResolvedSkill;
  /** Phase 4.4: when true, dialog offers scope choice (platform vs agency).
   *  Set true only for platform-staff role. Defaults to agency-only. */
  canChooseScope?: boolean;
  onCancel: () => void;
  onConfirm: (note: string | null, scope: "platform" | "agency") => void;
}) {
  const copy = useDashboardText();
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<"platform" | "agency">("agency");
  const [submitting, setSubmitting] = useState(false);
  const proficiency = skill.proficiency_level
    ? PROFICIENCY_META[skill.proficiency_level]
    : null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(11,11,13,0.55)",
        fontFamily: F_BODY,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface,
          borderRadius: 14,
          maxWidth: 480,
          width: "calc(100% - 32px)",
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: T.ink,
            marginBottom: 4,
          }}
        >
          {copy.verifyTitle(copy.term(skill.skill_name_en, skill.skill_name_es))}
        </div>
        <div
          style={{
            fontSize: 13,
            color: T.inkMuted,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          {copy.t("You're staking your agency's reputation on this assessment. Verified skills are surfaced to clients as trusted; only verify what you've witnessed firsthand or have evidence for.")}
        </div>

        {proficiency && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: T.surfaceWarm,
              border: `1px solid ${T.border}`,
              fontSize: 12.5,
              marginBottom: 14,
            }}
          >
            <div
              style={{ fontSize: 10.5, color: T.inkMuted, marginBottom: 2 }}
            >
              {copy.t("Verifying at level")}
            </div>
            <div style={{ fontWeight: 700, color: T.ink }}>
              {copy.proficiencyDots(proficiency.label, proficiency.dots)}
            </div>
            <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2 }}>
              {copy.t(proficiency.description)}
            </div>
          </div>
        )}

        {canChooseScope && (
          <div className="mb-3.5">
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: T.ink,
                marginBottom: 4,
              }}
            >
              {copy.t("Verification scope")}
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setScope("agency")}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${scope === "agency" ? T.accent : T.border}`,
                  background: scope === "agency" ? T.accentSoft : T.surface,
                  cursor: "pointer",
                  fontFamily: F_BODY,
                  fontSize: 12,
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: T.ink,
                    marginBottom: 2,
                  }}
                >
                  {copy.t("This agency")}
                </div>
                <div style={{ fontSize: 11, color: T.inkMuted }}>
                  {copy.t("Visible to this tenant only.")}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setScope("platform")}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${scope === "platform" ? T.accent : T.border}`,
                  background: scope === "platform" ? T.accentSoft : T.surface,
                  cursor: "pointer",
                  fontFamily: F_BODY,
                  fontSize: 12,
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: T.ink,
                    marginBottom: 2,
                  }}
                >
                  {copy.t("Platform-wide")}
                </div>
                <div style={{ fontSize: 11, color: T.inkMuted }}>
                  {copy.t("Tulala-verified, visible to all tenants.")}
                </div>
              </button>
            </div>
          </div>
        )}

        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: T.ink,
            marginBottom: 4,
          }}
        >
          {copy.t("Verification note (optional, internal)")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy.t("e.g. 'Saw them perform at the Maya Beach Club opening, May 2026.'")}
          rows={3}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            fontSize: 13,
            fontFamily: F_BODY,
            resize: "vertical",
            marginBottom: 16,
            boxSizing: "border-box",
          }}
        />

        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
        >
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            style={{
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.inkMuted,
              cursor: "pointer",
              fontFamily: F_BODY,
            }}
          >
            {copy.t("Cancel")}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setSubmitting(true);
              onConfirm(note.trim() || null, scope);
            }}
            style={{
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: T.accent,
              color: "#fff",
              cursor: "pointer",
              fontFamily: F_BODY,
            }}
          >
            {submitting
              ? copy.t("Verifying…")
              : copy.verifyButton(scope, !!canChooseScope)}
          </button>
        </div>
      </div>
    </div>
  );
}
