"use client";

// ============================================================================
// _skill-slot-panel.tsx — Multi-skill talent picker UI
//
// Replaces the old chip-grid picker in the Services accordion section.
// Renders 3 vertical "category cards" (Primary | Secondary 1 | Secondary 2)
// with up to N skills each (capped at 9 total across all cards).
//
// Each skill row has:
//   - Skill name + parent category breadcrumb
//   - 5-dot proficiency picker (interactive, semantic labels)
//   - Years of experience inline
//   - Verification ✓ if verified
//   - Remove button
//
// Above the cards: running counter (e.g. "5 / 9 skills · 1 primary + 2 secondary")
// ============================================================================

import React, { useEffect, useState, useMemo } from "react";
import {
  getResolvedSkills,
  addSkill,
  updateSkill,
  removeSkill,
  verifySkill,
  unverifySkill,
  setFeaturedSkill,
  getTalentTypesUnderParent,
  getEnabledParentCategoriesForPicker,
  requestNewTaxonomyTerm,
  getAspirations,
  addAspiration,
  removeAspiration,
} from "@/lib/server-actions/admin-talent-skills";
import {
  PROFICIENCY_LEVELS,
  PROFICIENCY_META,
  MAX_TOTAL_SKILLS,
  type ResolvedSkill,
  type ProficiencyLevel,
} from "@/lib/server-actions/admin-talent-skills.types";

// ─── Style tokens (kept inline to match _phase7-drawers pattern) ───────────

const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F2EB",
  surfaceWarm: "#F9F7F1",
  border: "#D5D2C7",
  borderSoft: "rgba(11,11,13,0.08)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.12)",
  red: "#A4361A",
  redSoft: "rgba(164,54,26,0.1)",
  amber: "#9B6D1F",
  amberSoft: "rgba(155,109,31,0.12)",
  indigo: "#5B6BA0",
  indigoSoft: "rgba(91,107,160,0.12)",
  indigoDeep: "#3B4A75",
  gold: "#C99A4F",
  goldSoft: "rgba(201,154,79,0.16)",
};

const F_BODY = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ─── ProficiencyDotPicker — interactive 5-dot picker ───────────────────────

export function ProficiencyDotPicker({
  value,
  onChange,
  size = "md",
  readOnly = false,
}: {
  value: ProficiencyLevel | null;
  onChange?: (next: ProficiencyLevel | null) => void;
  size?: "sm" | "md";
  readOnly?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const dotSize = size === "sm" ? 8 : 10;
  const gap = size === "sm" ? 3 : 4;
  const valueDots = value ? PROFICIENCY_META[value].dots : 0;

  const dotColor = (i: number, isFilled: boolean) => {
    if (!isFilled) return "rgba(11,11,13,0.15)";
    // Color by tier — gold for master, green for expert/advanced, indigo lower
    if (valueDots === 5) return T.gold;
    if (valueDots === 4) return T.accent;
    if (valueDots === 3) return T.indigoDeep;
    if (valueDots === 2) return T.indigo;
    return T.inkMuted;
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        cursor: readOnly ? "default" : "pointer",
      }}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const isFilled = hovered !== null ? i <= hovered : i <= valueDots;
        return (
          <button
            key={i}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHovered(i)}
            onClick={() => {
              if (readOnly) return;
              const newLevel = PROFICIENCY_LEVELS[i - 1];
              // Click same dot again → unset
              if (value && PROFICIENCY_META[value].dots === i) {
                onChange?.(null);
              } else {
                onChange?.(newLevel);
              }
            }}
            style={{
              width: dotSize + 4,
              height: dotSize + 4,
              padding: 0,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              cursor: readOnly ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title={
              readOnly
                ? PROFICIENCY_META[PROFICIENCY_LEVELS[i - 1]].label
                : `Set ${PROFICIENCY_META[PROFICIENCY_LEVELS[i - 1]].label} · ${PROFICIENCY_META[PROFICIENCY_LEVELS[i - 1]].description}`
            }
          >
            <span
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                background: dotColor(i, isFilled),
                transition: "background 0.15s",
              }}
            />
          </button>
        );
      })}
      {hovered !== null && !readOnly && (
        <span style={{ marginLeft: 6, fontSize: 10.5, color: T.inkMuted, fontFamily: F_BODY }}>
          {PROFICIENCY_META[PROFICIENCY_LEVELS[hovered - 1]].label}
        </span>
      )}
      {/* Q4: Unrated nudge — when proficiency_level is NULL and no hover,
          gently point users at the gesture. Hides on hover/click. */}
      {hovered === null && !readOnly && value === null && (
        <span style={{ marginLeft: 6, fontSize: 10.5, color: T.indigoDeep, fontFamily: F_BODY, fontStyle: "italic" }}>
          ← tap a dot to set level
        </span>
      )}
    </div>
  );
}

// ─── ProficiencyLabel — non-interactive display version ────────────────────

export function ProficiencyLabel({
  level,
  isVerified,
}: {
  level: ProficiencyLevel | null;
  isVerified: boolean;
}) {
  if (!level) {
    return (
      <span
        style={{
          fontSize: 10.5,
          padding: "2px 8px",
          borderRadius: 999,
          background: T.surfaceAlt,
          color: T.inkMuted,
          fontFamily: F_BODY,
        }}
      >
        Unrated
      </span>
    );
  }
  const meta = PROFICIENCY_META[level];
  const isHigh = level === "master" || level === "expert";
  const showHighWithoutVerification = isHigh && !isVerified;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10.5,
        padding: "2px 8px",
        borderRadius: 999,
        background:
          level === "master"
            ? T.goldSoft
            : level === "expert"
              ? T.accentSoft
              : level === "advanced"
                ? T.indigoSoft
                : T.surfaceAlt,
        color:
          level === "master"
            ? "#7a5a1f"
            : level === "expert"
              ? T.accent
              : level === "advanced"
                ? T.indigoDeep
                : T.inkMuted,
        fontFamily: F_BODY,
      }}
    >
      {meta.label}
      {showHighWithoutVerification && (
        <span style={{ fontSize: 9, opacity: 0.7 }}>(unverified)</span>
      )}
      {isVerified && <span style={{ fontWeight: 700 }}>✓</span>}
    </span>
  );
}

// ─── SkillSlotPanel — the main multi-skill picker ──────────────────────────

export function SkillSlotPanel({
  talentProfileId,
  isAdmin = true,
  viewMode = "admin",
  canChooseVerificationScope = false,
}: {
  talentProfileId: string;
  /** Show admin-only controls (Verify, scope toggle). Defaults to true. */
  isAdmin?: boolean;
  /** Phase 7.3 — when 'talent-self', hide admin actions (verify, override). */
  viewMode?: "admin" | "talent-self";
  /** Phase 4.4 — show platform vs agency scope picker in verify dialog.
   *  Set true for platform-staff role only. Defaults to false (agency only). */
  canChooseVerificationScope?: boolean;
}) {
  const [skills, setSkills] = useState<ResolvedSkill[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingTermIds, setSavingTermIds] = useState<Set<string>>(new Set());

  // Phase 7.3 — narrow isAdmin by viewMode. Talent-self mode hides admin
  // controls (Verify, scope toggle) regardless of caller's isAdmin.
  const adminControls = isAdmin && viewMode === "admin";

  const reload = async () => {
    setLoading(true);
    setError(null);
    const res = await getResolvedSkills({ talent_profile_id: talentProfileId });
    if (res.ok) setSkills(res.skills);
    else setError(res.error);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talentProfileId]);

  const setSaving = (termId: string, on: boolean) => {
    setSavingTermIds((p) => {
      const n = new Set(p);
      if (on) n.add(termId);
      else n.delete(termId);
      return n;
    });
  };

  // Group skills by parent_category + role.
  const grouped = useMemo(() => {
    const m = new Map<
      string,
      {
        parent_id: string;
        parent_name: string;
        role: "primary_role" | "secondary_role";
        skills: ResolvedSkill[];
      }
    >();
    if (!skills) return m;
    for (const s of skills) {
      const key = `${s.relationship_type}|${s.parent_category_id}`;
      if (!m.has(key)) {
        m.set(key, {
          parent_id: s.parent_category_id ?? "",
          parent_name: s.parent_category_name_en ?? "Unknown",
          role: s.relationship_type,
          skills: [],
        });
      }
      m.get(key)!.skills.push(s);
    }
    return m;
  }, [skills]);

  const totalSkills = skills?.length ?? 0;
  const primaryGroup = useMemo(() => {
    for (const [k, g] of grouped) {
      if (g.role === "primary_role") return { key: k, ...g };
    }
    return null;
  }, [grouped]);

  const secondaryGroups = useMemo(() => {
    const arr: Array<{ key: string; parent_id: string; parent_name: string; skills: ResolvedSkill[] }> = [];
    for (const [k, g] of grouped) {
      if (g.role === "secondary_role") arr.push({ key: k, parent_id: g.parent_id, parent_name: g.parent_name, skills: g.skills });
    }
    return arr;
  }, [grouped]);

  const handleProficiencyChange = async (
    skill: ResolvedSkill,
    next: ProficiencyLevel | null,
  ) => {
    setSaving(skill.skill_term_id, true);
    // Optimistic
    setSkills((prev) =>
      prev
        ? prev.map((s) =>
            s.skill_term_id === skill.skill_term_id
              ? { ...s, proficiency_level: next }
              : s,
          )
        : prev,
    );
    const res = await updateSkill({
      talent_profile_id: talentProfileId,
      talent_type_term_id: skill.skill_term_id,
      proficiency_level: next,
    });
    setSaving(skill.skill_term_id, false);
    if (!res.ok) {
      setError(res.error);
      reload();
    }
  };

  const handleYearsChange = async (skill: ResolvedSkill, yearsStr: string) => {
    const years = yearsStr === "" ? null : Number(yearsStr);
    if (years !== null && (Number.isNaN(years) || years < 0)) return;
    setSaving(skill.skill_term_id, true);
    setSkills((prev) =>
      prev
        ? prev.map((s) =>
            s.skill_term_id === skill.skill_term_id
              ? { ...s, years_experience: years }
              : s,
          )
        : prev,
    );
    const res = await updateSkill({
      talent_profile_id: talentProfileId,
      talent_type_term_id: skill.skill_term_id,
      years_experience: years,
    });
    setSaving(skill.skill_term_id, false);
    if (!res.ok) {
      setError(res.error);
      reload();
    }
  };

  const handleRemove = async (skill: ResolvedSkill) => {
    if (!confirm(`Remove "${skill.skill_name_en}" from this profile?`)) return;
    setSaving(skill.skill_term_id, true);
    const res = await removeSkill({
      talent_profile_id: talentProfileId,
      talent_type_term_id: skill.skill_term_id,
    });
    setSaving(skill.skill_term_id, false);
    if (res.ok) reload();
    else setError(res.error);
  };

  // Q5: Verification flow opens a confirmation modal capturing the admin's
  // intent + an optional note. Note persists to verification_note in DB.
  const [verifyDialog, setVerifyDialog] = useState<ResolvedSkill | null>(null);
  const handleOpenVerify = (skill: ResolvedSkill) => {
    if (skill.is_verified) {
      // Unverify is one-click — it's a revert, not a stake.
      handleConfirmUnverify(skill);
    } else {
      setVerifyDialog(skill);
    }
  };

  const handleConfirmVerify = async (
    skill: ResolvedSkill,
    note: string | null,
    scope: "platform" | "agency",
  ) => {
    setSaving(skill.skill_term_id, true);
    const res = await verifySkill({
      talent_profile_id: talentProfileId,
      talent_type_term_id: skill.skill_term_id,
      scope,
      note,
    });
    setSaving(skill.skill_term_id, false);
    setVerifyDialog(null);
    if (res.ok) reload();
    else setError(res.error);
  };

  const handleConfirmUnverify = async (skill: ResolvedSkill) => {
    setSaving(skill.skill_term_id, true);
    const res = await unverifySkill({
      talent_profile_id: talentProfileId,
      talent_type_term_id: skill.skill_term_id,
    });
    setSaving(skill.skill_term_id, false);
    if (res.ok) reload();
    else setError(res.error);
  };

  const handleSetFeatured = async (skill: ResolvedSkill) => {
    setSaving(skill.skill_term_id, true);
    const res = await setFeaturedSkill({
      talent_profile_id: talentProfileId,
      talent_type_term_id: skill.skill_term_id,
    });
    setSaving(skill.skill_term_id, false);
    if (res.ok) reload();
    else setError(res.error);
  };

  // Compute the featured skill (lowest display_order across all skills).
  const featuredSkillId = useMemo(() => {
    if (!skills || skills.length === 0) return null;
    const sorted = [...skills].sort((a, b) => a.display_order - b.display_order);
    return sorted[0]?.skill_term_id ?? null;
  }, [skills]);

  const [addingForRole, setAddingForRole] = useState<{
    role: "primary" | "secondary";
    parent_id?: string;
  } | null>(null);

  const distinctSecondaryParents = new Set(
    secondaryGroups.map((g) => g.parent_id),
  ).size;
  const canAddSecondaryParent = distinctSecondaryParents < 2;

  return (
    <div style={{ fontFamily: F_BODY }}>
      {/* Header counter */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderRadius: 10,
          background: T.indigoSoft,
          border: `1px solid rgba(91,107,160,0.18)`,
          fontSize: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontWeight: 600, color: T.indigoDeep }}>
            {totalSkills} of {MAX_TOTAL_SKILLS} skills used
          </div>
          <div style={{ fontSize: 10.5, color: T.inkMuted }}>
            One primary category · up to two secondary categories · max 9 skills total
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {Array.from({ length: MAX_TOTAL_SKILLS }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: i < totalSkills ? T.indigoDeep : "rgba(11,11,13,0.15)",
              }}
            />
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
            borderRadius: 8,
            background: T.redSoft,
            border: `1px solid ${T.red}`,
            fontSize: 12,
            color: T.ink,
          }}
        >
          {error}
        </div>
      )}

      {loading && !skills && (
        <div style={{ color: T.inkMuted, fontSize: 12, padding: 8 }}>Loading skills…</div>
      )}

      {/* PRIMARY card */}
      <SkillCategoryCard
        roleLabel="Primary category"
        roleEmoji="★"
        parentName={primaryGroup?.parent_name ?? null}
        skills={primaryGroup?.skills ?? []}
        onAddClick={() =>
          setAddingForRole({ role: "primary", parent_id: primaryGroup?.parent_id })
        }
        onProficiencyChange={handleProficiencyChange}
        onYearsChange={handleYearsChange}
        onRemove={handleRemove}
        onToggleVerify={handleOpenVerify}
        onSetFeatured={handleSetFeatured}
        featuredSkillId={featuredSkillId}
        savingTermIds={savingTermIds}
        canAddSkill={totalSkills < MAX_TOTAL_SKILLS}
        isAdmin={isAdmin}
      />

      {/* SECONDARY cards */}
      {secondaryGroups.map((g, i) => (
        <SkillCategoryCard
          key={g.key}
          roleLabel={`Secondary category ${i + 1}`}
          roleEmoji="◆"
          parentName={g.parent_name}
          skills={g.skills}
          onAddClick={() => setAddingForRole({ role: "secondary", parent_id: g.parent_id })}
          onProficiencyChange={handleProficiencyChange}
          onYearsChange={handleYearsChange}
          onRemove={handleRemove}
          onToggleVerify={handleOpenVerify}
          onSetFeatured={handleSetFeatured}
          featuredSkillId={featuredSkillId}
          savingTermIds={savingTermIds}
          canAddSkill={totalSkills < MAX_TOTAL_SKILLS}
          isAdmin={isAdmin && viewMode === "admin"}
        />
      ))}

      {/* Add new secondary category button */}
      {canAddSecondaryParent && totalSkills < MAX_TOTAL_SKILLS && (
        <button
          type="button"
          onClick={() => setAddingForRole({ role: "secondary" })}
          style={{
            width: "100%",
            padding: "12px",
            marginTop: 8,
            borderRadius: 10,
            border: `1px dashed ${T.border}`,
            background: "transparent",
            color: T.inkMuted,
            cursor: "pointer",
            fontFamily: F_BODY,
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          + Add {secondaryGroups.length === 0 ? "first" : "second"} secondary category
        </button>
      )}

      {/* Q2: Career interests / aspirations — talent_types they're open to
          growing into. Stored in talent_profile_taxonomy with
          relationship_type='aspiration' (added via 20260907220000). */}
      <CareerInterestsSection
        talentProfileId={talentProfileId}
        existingSkillIds={new Set((skills ?? []).map((s) => s.skill_term_id))}
      />

      {/* Add-skill drawer */}
      {addingForRole && (
        <AddSkillSearch
          role={addingForRole.role}
          fixedParentId={addingForRole.parent_id}
          existingSkillIds={new Set((skills ?? []).map((s) => s.skill_term_id))}
          onClose={() => setAddingForRole(null)}
          onAdded={() => {
            setAddingForRole(null);
            reload();
          }}
          talentProfileId={talentProfileId}
        />
      )}

      {/* Verification confirmation dialog */}
      {verifyDialog && (
        <VerifyConfirmDialog
          skill={verifyDialog}
          canChooseScope={canChooseVerificationScope}
          onCancel={() => setVerifyDialog(null)}
          onConfirm={(note, scope) => handleConfirmVerify(verifyDialog, note, scope)}
        />
      )}
    </div>
  );
}

// ─── VerifyConfirmDialog — Q5 confirmation modal ──────────────────────────

function VerifyConfirmDialog({
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
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
          Verify {skill.skill_name_en}?
        </div>
        <div style={{ fontSize: 13, color: T.inkMuted, lineHeight: 1.5, marginBottom: 12 }}>
          You're staking your agency's reputation on this assessment. Verified
          skills are surfaced to clients as trusted; only verify what you've
          witnessed firsthand or have evidence for.
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
            <div style={{ fontSize: 10.5, color: T.inkMuted, marginBottom: 2 }}>
              Verifying at level
            </div>
            <div style={{ fontWeight: 700, color: T.ink }}>
              {proficiency.label} ({proficiency.dots} of 5 dots)
            </div>
            <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2 }}>
              {proficiency.description}
            </div>
          </div>
        )}

        {canChooseScope && (
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: T.ink,
                marginBottom: 4,
              }}
            >
              Verification scope
            </label>
            <div style={{ display: "flex", gap: 6 }}>
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
                <div style={{ fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                  This agency
                </div>
                <div style={{ fontSize: 11, color: T.inkMuted }}>
                  Visible to this tenant only.
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
                <div style={{ fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                  Platform-wide
                </div>
                <div style={{ fontSize: 11, color: T.inkMuted }}>
                  Tulala-verified, visible to all tenants.
                </div>
              </button>
            </div>
          </div>
        )}

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 4 }}>
          Verification note (optional, internal)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. 'Saw them perform at the Maya Beach Club opening, May 2026.'"
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

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
            Cancel
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
            {submitting ? "Verifying…" : `✓ Verify${canChooseScope ? ` (${scope})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SkillCategoryCard — one per role/parent_category pair ────────────────

function SkillCategoryCard({
  roleLabel,
  roleEmoji,
  parentName,
  skills,
  onAddClick,
  onProficiencyChange,
  onYearsChange,
  onRemove,
  onToggleVerify,
  onSetFeatured,
  featuredSkillId,
  savingTermIds,
  canAddSkill,
  isAdmin,
}: {
  roleLabel: string;
  roleEmoji: string;
  parentName: string | null;
  skills: ResolvedSkill[];
  onAddClick: () => void;
  onProficiencyChange: (skill: ResolvedSkill, next: ProficiencyLevel | null) => void;
  onYearsChange: (skill: ResolvedSkill, yearsStr: string) => void;
  onRemove: (skill: ResolvedSkill) => void;
  onToggleVerify: (skill: ResolvedSkill) => void;
  onSetFeatured: (skill: ResolvedSkill) => void;
  featuredSkillId: string | null;
  savingTermIds: Set<string>;
  canAddSkill: boolean;
  isAdmin: boolean;
}) {
  return (
    <div
      style={{
        marginBottom: 10,
        borderRadius: 12,
        background: T.surface,
        border: `1px solid ${T.border}`,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: skills.length > 0 ? `1px solid ${T.borderSoft}` : "none",
          background: T.surfaceWarm,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14 }}>{roleEmoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: T.inkMuted, textTransform: "uppercase" }}>
            {roleLabel}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, marginTop: 1 }}>
            {parentName ?? "Not set"}
          </div>
        </div>
        <span style={{ fontSize: 11, color: T.inkMuted }}>
          {skills.length} {skills.length === 1 ? "skill" : "skills"}
        </span>
      </div>

      {/* Skill rows */}
      {skills.length > 0 && (
        <div>
          {skills.map((s) => (
            <SkillRow
              key={s.skill_term_id}
              skill={s}
              isSaving={savingTermIds.has(s.skill_term_id)}
              isFeatured={featuredSkillId === s.skill_term_id}
              onProficiencyChange={(next) => onProficiencyChange(s, next)}
              onYearsChange={(v) => onYearsChange(s, v)}
              onRemove={() => onRemove(s)}
              onToggleVerify={() => onToggleVerify(s)}
              onSetFeatured={() => onSetFeatured(s)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Add-skill button */}
      {canAddSkill && (
        <button
          type="button"
          onClick={onAddClick}
          style={{
            width: "100%",
            padding: "10px",
            border: "none",
            borderTop: skills.length > 0 ? `1px dashed ${T.border}` : "none",
            background: "transparent",
            color: T.inkMuted,
            cursor: "pointer",
            fontFamily: F_BODY,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          + Add {skills.length === 0 ? "skill" : "another skill"} in this category
        </button>
      )}
    </div>
  );
}

// ─── SkillRow — single skill with proficiency, years, verify, remove ──────

function SkillRow({
  skill,
  isSaving,
  isFeatured,
  onProficiencyChange,
  onYearsChange,
  onRemove,
  onToggleVerify,
  onSetFeatured,
  isAdmin,
}: {
  skill: ResolvedSkill;
  isSaving: boolean;
  isFeatured: boolean;
  onProficiencyChange: (next: ProficiencyLevel | null) => void;
  onYearsChange: (years: string) => void;
  onRemove: () => void;
  onToggleVerify: () => void;
  onSetFeatured: () => void;
  isAdmin: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: `1px solid ${T.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: isFeatured ? T.goldSoft : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={isFeatured ? undefined : onSetFeatured}
          disabled={isFeatured}
          title={isFeatured ? "Featured on roster card" : "Set as featured skill"}
          style={{
            width: 24,
            height: 24,
            padding: 0,
            borderRadius: 6,
            border: `1px solid ${isFeatured ? T.gold : T.border}`,
            background: isFeatured ? T.gold : T.surface,
            color: isFeatured ? "#fff" : T.inkMuted,
            cursor: isFeatured ? "default" : "pointer",
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: F_BODY,
            flexShrink: 0,
          }}
        >
          ★
        </button>
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: T.ink,
          }}
        >
          {skill.skill_name_en}
          {isFeatured && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 9.5,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 3,
                background: T.gold,
                color: "#fff",
                letterSpacing: 0.4,
              }}
            >
              FEATURED
            </span>
          )}
          {isSaving && (
            <span style={{ marginLeft: 8, fontSize: 10.5, color: T.inkMuted, fontWeight: 400 }}>
              saving…
            </span>
          )}
        </span>
        <ProficiencyLabel level={skill.proficiency_level} isVerified={skill.is_verified} />
        <button
          type="button"
          onClick={onRemove}
          title="Remove skill"
          style={{
            width: 24,
            height: 24,
            padding: 0,
            borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.red,
            cursor: "pointer",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: F_BODY,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <ProficiencyDotPicker value={skill.proficiency_level} onChange={onProficiencyChange} />
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.inkMuted }}>
          <span>Years:</span>
          <input
            type="number"
            min={0}
            max={80}
            defaultValue={skill.years_experience ?? ""}
            onBlur={(e) => {
              if (e.target.value !== String(skill.years_experience ?? "")) {
                onYearsChange(e.target.value);
              }
            }}
            placeholder="—"
            style={{
              width: 50,
              padding: "3px 6px",
              border: `1px solid ${T.border}`,
              borderRadius: 4,
              fontSize: 11.5,
              fontFamily: F_BODY,
              background: T.surface,
            }}
          />
        </label>
        {isAdmin && (
          <button
            type="button"
            onClick={onToggleVerify}
            style={{
              padding: "3px 9px",
              fontSize: 10.5,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${skill.is_verified ? T.accent : T.border}`,
              background: skill.is_verified ? T.accentSoft : T.surface,
              color: skill.is_verified ? T.accent : T.inkMuted,
              cursor: "pointer",
              fontFamily: F_BODY,
            }}
          >
            {skill.is_verified ? "✓ Verified" : "Verify proficiency"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── AddSkillSearch — modal-ish picker for new skills ──────────────────────

function AddSkillSearch({
  role,
  fixedParentId,
  existingSkillIds,
  onClose,
  onAdded,
  talentProfileId,
}: {
  role: "primary" | "secondary";
  fixedParentId: string | undefined;
  existingSkillIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
  talentProfileId: string;
}) {
  const [parents, setParents] = useState<Array<{ id: string; slug: string; name_en: string; emoji: string }>>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(fixedParentId ?? null);
  const [types, setTypes] = useState<Array<{ id: string; name_en: string; category_group_name: string | null }>>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [submittingTypeId, setSubmittingTypeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Load parent_categories on mount via server action.
  useEffect(() => {
    if (fixedParentId) return; // Don't load when a parent is fixed
    getEnabledParentCategoriesForPicker().then((res) => {
      if (res.ok) {
        setParents(
          res.parents.map((p) => ({
            ...p,
            emoji: PARENT_EMOJI[p.slug] ?? "•",
          })),
        );
      }
    });
  }, [fixedParentId]);

  // Load talent_types when a parent is selected.
  useEffect(() => {
    if (!selectedParentId) {
      setTypes([]);
      return;
    }
    setLoadingTypes(true);
    getTalentTypesUnderParent({
      parent_category_id: selectedParentId,
      query: searchQuery || undefined,
    })
      .then((res) => {
        if (res.ok) setTypes(res.types);
        else setError(res.error);
      })
      .finally(() => setLoadingTypes(false));
  }, [selectedParentId, searchQuery]);

  const handleAdd = async (typeId: string) => {
    setSubmittingTypeId(typeId);
    setError(null);
    const res = await addSkill({
      talent_profile_id: talentProfileId,
      talent_type_term_id: typeId,
      role,
      proficiency_level: "intermediate",
    });
    setSubmittingTypeId(null);
    if (res.ok) onAdded();
    else setError(res.error);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(11,11,13,0.45)",
        fontFamily: F_BODY,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface,
          borderRadius: "16px 16px 0 0",
          maxWidth: 560,
          width: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "20px 24px 12px", borderBottom: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
            Add a {role === "primary" ? "primary" : "secondary"} skill
          </div>
          <div style={{ fontSize: 12, color: T.inkMuted }}>
            {fixedParentId
              ? "Pick a talent type within this category."
              : role === "primary"
                ? "Pick the category that defines this person's main work."
                : "Pick a category they also work in."}
          </div>
        </div>

        {/* Parent picker (skip when fixedParentId is set) */}
        {!fixedParentId && (
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.borderSoft}` }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 8,
              }}
            >
              {parents.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedParentId(p.id)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${selectedParentId === p.id ? T.accent : T.border}`,
                    background: selectedParentId === p.id ? T.accentSoft : T.surface,
                    color: T.ink,
                    cursor: "pointer",
                    fontFamily: F_BODY,
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{p.emoji}</span>
                  {p.name_en}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        {selectedParentId && (
          <div style={{ padding: "10px 20px", borderBottom: `1px solid ${T.borderSoft}` }}>
            <input
              autoFocus
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                fontSize: 13,
                fontFamily: F_BODY,
              }}
            />
          </div>
        )}

        {/* Types list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {!selectedParentId && (
            <div style={{ padding: 16, color: T.inkMuted, fontSize: 12, textAlign: "center" }}>
              Pick a category above to see specific roles.
            </div>
          )}
          {loadingTypes && (
            <div style={{ padding: 12, color: T.inkMuted, fontSize: 12 }}>Loading…</div>
          )}
          {selectedParentId && !loadingTypes && types.length === 0 && (
            <div style={{ padding: 12, color: T.inkMuted, fontSize: 12 }}>
              No matching types.
            </div>
          )}
          {types.map((t) => {
            const alreadyAdded = existingSkillIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={alreadyAdded || submittingTypeId === t.id}
                onClick={() => handleAdd(t.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  marginBottom: 4,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: alreadyAdded ? T.surfaceAlt : T.surface,
                  cursor: alreadyAdded ? "not-allowed" : "pointer",
                  fontFamily: F_BODY,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: alreadyAdded ? 0.6 : 1,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{t.name_en}</div>
                  {t.category_group_name && (
                    <div style={{ fontSize: 10.5, color: T.inkMuted, marginTop: 1 }}>
                      {t.category_group_name}
                    </div>
                  )}
                </div>
                {alreadyAdded && (
                  <span style={{ fontSize: 10.5, color: T.inkMuted, fontWeight: 600 }}>
                    Already added
                  </span>
                )}
                {submittingTypeId === t.id && (
                  <span style={{ fontSize: 10.5, color: T.inkMuted }}>adding…</span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div
            style={{
              margin: "0 20px 12px",
              padding: 10,
              borderRadius: 8,
              background: T.redSoft,
              border: `1px solid ${T.red}`,
              fontSize: 12,
              color: T.ink,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            padding: "14px 20px",
            borderTop: `1px solid ${T.borderSoft}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* Don't see your skill? — opens the request flow */}
          <button
            type="button"
            onClick={() => setShowRequestForm(true)}
            style={{
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: `1px dashed ${T.border}`,
              background: "transparent",
              color: T.indigoDeep,
              cursor: "pointer",
              fontFamily: F_BODY,
            }}
          >
            ✦ Don't see your skill? Suggest one →
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
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
            Done
          </button>
        </div>
      </div>

      {/* Request flow — submits a taxonomy_term_requests row that platform
          staff later review. Eventually wires to a support inbox / chat. */}
      {showRequestForm && (
        <RequestNewSkillForm
          parentId={selectedParentId}
          parentLabel={
            parents.find((p) => p.id === selectedParentId)?.name_en ?? null
          }
          talentProfileId={talentProfileId}
          query={searchQuery}
          onClose={() => setShowRequestForm(false)}
          onSubmitted={() => {
            setShowRequestForm(false);
            setSubmitted(true);
            window.setTimeout(() => setSubmitted(false), 4000);
          }}
        />
      )}

      {/* Toast confirmation */}
      {submitted && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 300,
            padding: "10px 18px",
            borderRadius: 999,
            background: T.accent,
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: F_BODY,
            boxShadow: "0 4px 14px rgba(15,79,62,0.25)",
          }}
        >
          ✓ Skill suggestion sent. We'll review it and let you know.
        </div>
      )}
    </div>
  );
}

// ─── CareerInterestsSection — Q2: aspirations / "open to grow into" ──────

function CareerInterestsSection({
  talentProfileId,
  existingSkillIds,
}: {
  talentProfileId: string;
  existingSkillIds: Set<string>;
}) {
  const [aspirations, setAspirations] = useState<
    Array<{ term_id: string; slug: string; name_en: string }>
  >([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const res = await getAspirations({ talent_profile_id: talentProfileId });
    if (res.ok) setAspirations(res.aspirations);
    setLoaded(true);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talentProfileId]);

  const handleRemove = async (termId: string) => {
    await removeAspiration({
      talent_profile_id: talentProfileId,
      taxonomy_term_id: termId,
    });
    reload();
  };

  const handleAdded = () => {
    setAdding(false);
    reload();
  };

  if (!loaded) return null;

  return (
    <div
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: 10,
        background: T.surfaceWarm,
        border: `1px solid ${T.borderSoft}`,
        fontFamily: F_BODY,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: T.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        Career interests · open to grow into
      </div>
      <div style={{ fontSize: 11.5, color: T.inkMuted, marginBottom: 10 }}>
        Talent types this person is open to learning / accepting if invited.
        Doesn't count toward the 9-skill cap.
      </div>

      {aspirations.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 10,
          }}
        >
          {aspirations.map((a) => (
            <span
              key={a.term_id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                background: T.surface,
                border: `1px solid ${T.border}`,
                fontSize: 12,
                color: T.ink,
              }}
            >
              {a.name_en}
              <button
                type="button"
                onClick={() => handleRemove(a.term_id)}
                title="Remove interest"
                style={{
                  border: "none",
                  background: "transparent",
                  color: T.inkMuted,
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        style={{
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 8,
          border: `1px dashed ${T.border}`,
          background: "transparent",
          color: T.indigoDeep,
          cursor: "pointer",
          fontFamily: F_BODY,
        }}
      >
        + Add interest
      </button>

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 6,
            background: T.redSoft,
            border: `1px solid ${T.red}`,
            fontSize: 11.5,
            color: T.ink,
          }}
        >
          {error}
        </div>
      )}

      {adding && (
        <AddAspirationPicker
          existingSkillIds={existingSkillIds}
          existingAspirationIds={new Set(aspirations.map((a) => a.term_id))}
          onClose={() => setAdding(false)}
          onAdded={handleAdded}
          onError={setError}
          talentProfileId={talentProfileId}
        />
      )}
    </div>
  );
}

function AddAspirationPicker({
  talentProfileId,
  existingSkillIds,
  existingAspirationIds,
  onClose,
  onAdded,
  onError,
}: {
  talentProfileId: string;
  existingSkillIds: Set<string>;
  existingAspirationIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
  onError: (msg: string) => void;
}) {
  const [parents, setParents] = useState<
    Array<{ id: string; slug: string; name_en: string; emoji: string }>
  >([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [types, setTypes] = useState<
    Array<{ id: string; name_en: string }>
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [submittingTypeId, setSubmittingTypeId] = useState<string | null>(null);

  useEffect(() => {
    getEnabledParentCategoriesForPicker().then((res) => {
      if (res.ok) {
        setParents(
          res.parents.map((p) => ({
            ...p,
            emoji: PARENT_EMOJI[p.slug] ?? "•",
          })),
        );
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedParentId) {
      setTypes([]);
      return;
    }
    setLoadingTypes(true);
    getTalentTypesUnderParent({
      parent_category_id: selectedParentId,
      query: searchQuery || undefined,
    })
      .then((res) => {
        if (res.ok) {
          // Hide types already a skill or already an aspiration.
          setTypes(
            res.types
              .filter(
                (t) =>
                  !existingSkillIds.has(t.id) &&
                  !existingAspirationIds.has(t.id),
              )
              .map((t) => ({ id: t.id, name_en: t.name_en })),
          );
        }
      })
      .finally(() => setLoadingTypes(false));
  }, [selectedParentId, searchQuery, existingSkillIds, existingAspirationIds]);

  const handlePick = async (termId: string) => {
    setSubmittingTypeId(termId);
    const res = await addAspiration({
      talent_profile_id: talentProfileId,
      taxonomy_term_id: termId,
    });
    setSubmittingTypeId(null);
    if (res.ok) onAdded();
    else onError(res.error);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(11,11,13,0.45)",
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
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          padding: 20,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
          Add a career interest
        </div>
        <div style={{ fontSize: 12, color: T.inkMuted, marginBottom: 12 }}>
          A talent type they're open to growing into. Doesn't replace
          current skills.
        </div>

        {!selectedParentId ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 6,
              maxHeight: 300,
              overflowY: "auto",
              marginBottom: 12,
            }}
          >
            {parents.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedParentId(p.id)}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.surface,
                  cursor: "pointer",
                  fontFamily: F_BODY,
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 14 }}>{p.emoji}</span>
                {p.name_en}
              </button>
            ))}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelectedParentId(null)}
              style={{
                fontSize: 11,
                color: T.indigoDeep,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                marginBottom: 8,
                fontFamily: F_BODY,
                textAlign: "left",
              }}
            >
              ← Back to categories
            </button>
            <input
              autoFocus
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                fontSize: 12,
                fontFamily: F_BODY,
                marginBottom: 8,
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                maxHeight: 250,
                overflowY: "auto",
                marginBottom: 12,
              }}
            >
              {loadingTypes && (
                <div style={{ padding: 8, color: T.inkMuted, fontSize: 11.5 }}>
                  Loading…
                </div>
              )}
              {!loadingTypes && types.length === 0 && (
                <div style={{ padding: 8, color: T.inkMuted, fontSize: 11.5 }}>
                  No matching types.
                </div>
              )}
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handlePick(t.id)}
                  disabled={submittingTypeId === t.id}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    marginBottom: 4,
                    borderRadius: 6,
                    border: `1px solid ${T.border}`,
                    background: T.surface,
                    cursor: "pointer",
                    fontFamily: F_BODY,
                    fontSize: 12,
                  }}
                >
                  {t.name_en}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.inkMuted,
              cursor: "pointer",
              fontFamily: F_BODY,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── RequestNewSkillForm — "Don't see your skill?" capture modal ──────────
//
// Posts to taxonomy_term_requests via requestNewTaxonomyTerm. Platform staff
// review pending requests later via a (future) support inbox. Pre-fills
// the proposed name with whatever the user was searching for, so the
// suggestion captures their actual intent.

function RequestNewSkillForm({
  parentId,
  parentLabel,
  talentProfileId,
  query,
  onClose,
  onSubmitted,
}: {
  parentId: string | null;
  parentLabel: string | null;
  talentProfileId: string;
  query: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [proposedName, setProposedName] = useState(query.trim());
  const [contextNote, setContextNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const name = proposedName.trim();
    if (name.length < 2) {
      setError("Skill name must be at least 2 characters.");
      return;
    }
    setSubmitting(true);
    const res = await requestNewTaxonomyTerm({
      parent_category_id: parentId ?? null,
      proposed_name: name,
      context_note: contextNote.trim() || null,
      talent_profile_id: talentProfileId,
      source: "skill_picker",
    });
    setSubmitting(false);
    if (res.ok) {
      onSubmitted();
    } else {
      setError(res.error);
    }
  };

  return (
    <div
      onClick={onClose}
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
          maxWidth: 500,
          width: "calc(100% - 32px)",
          padding: 24,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
          Suggest a new skill
        </div>
        <div style={{ fontSize: 13, color: T.inkMuted, lineHeight: 1.5, marginBottom: 16 }}>
          Don't see what you're looking for in our catalog? Tell us what's
          missing. Our team reviews suggestions and adds genuine gaps to the
          master catalog (typically within a few business days).
          {parentLabel && (
            <>
              {" "}
              We'll file this under <strong>{parentLabel}</strong>.
            </>
          )}
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 4 }}>
          Skill name
        </label>
        <input
          value={proposedName}
          onChange={(e) => setProposedName(e.target.value)}
          placeholder="e.g. Doula, Sound Healer, Underwater Photographer"
          autoFocus
          maxLength={120}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            fontSize: 13,
            fontFamily: F_BODY,
            marginBottom: 14,
            boxSizing: "border-box",
          }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 4 }}>
          Why do you need this? <span style={{ fontWeight: 400, color: T.inkMuted }}>(optional, but helpful)</span>
        </label>
        <textarea
          value={contextNote}
          onChange={(e) => setContextNote(e.target.value)}
          placeholder="e.g. 'We book 3-5 doulas per month and they don't fit any existing category.'"
          rows={3}
          maxLength={500}
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

        {error && (
          <div
            style={{
              padding: 10,
              marginBottom: 12,
              borderRadius: 8,
              background: T.redSoft,
              border: `1px solid ${T.red}`,
              fontSize: 12,
              color: T.ink,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
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
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || proposedName.trim().length < 2}
            onClick={handleSubmit}
            style={{
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background:
                proposedName.trim().length < 2 ? T.inkMuted : T.accent,
              color: "#fff",
              cursor:
                proposedName.trim().length < 2 ? "not-allowed" : "pointer",
              fontFamily: F_BODY,
            }}
          >
            {submitting ? "Sending…" : "Send suggestion"}
          </button>
        </div>
      </div>
    </div>
  );
}

const PARENT_EMOJI: Record<string, string> = {
  models: "👤",
  "hosts-promo": "🎤",
  performers: "✨",
  "music-djs": "🎧",
  "chefs-culinary": "👨‍🍳",
  "wellness-beauty": "🌿",
  "photo-video-creative": "📷",
  "influencers-creators": "📱",
  "event-staff": "🛎",
  "hospitality-property": "🏨",
  "travel-concierge": "🧭",
  transportation: "🚙",
  "home-technical-services": "🛠",
  "security-protection": "🛡",
  "sports-fitness": "🏃",
  "kids-family-services": "👨‍👩‍👧",
  "speakers-coaches-experts": "🎙",
  "production-bts": "🎬",
  "animals-specialty-acts": "🐾",
};
