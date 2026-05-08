"use client";

// ============================================================================
// _skill-row.tsx — SkillCategoryCard + SkillRow
//
// Extracted from the original _skill-slot-panel.tsx during the Phase 2
// refactor. SkillCategoryCard wraps a list of SkillRows for one
// (relationship_type, parent_category) group. SkillRow renders a single
// skill with proficiency dots, years, verify, remove, set-featured.
// ============================================================================

import type {
  ProficiencyLevel,
  ResolvedSkill,
} from "@/lib/server-actions/admin-talent-skills.types";

import {
  ProficiencyDotPicker,
  ProficiencyLabel,
} from "./_skill-proficiency";
import { F_BODY, T } from "./_skill-tokens";

// ─── SkillCategoryCard — one per role/parent_category pair ────────────────

export function SkillCategoryCard({
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
  onProficiencyChange: (
    skill: ResolvedSkill,
    next: ProficiencyLevel | null,
  ) => void;
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
          borderBottom:
            skills.length > 0 ? `1px solid ${T.borderSoft}` : "none",
          background: T.surfaceWarm,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14 }}>{roleEmoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              color: T.inkMuted,
              textTransform: "uppercase",
            }}
          >
            {roleLabel}
          </div>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: T.ink,
              marginTop: 1,
            }}
          >
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
            borderTop:
              skills.length > 0 ? `1px dashed ${T.border}` : "none",
            background: "transparent",
            color: T.inkMuted,
            cursor: "pointer",
            fontFamily: F_BODY,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          + Add {skills.length === 0 ? "skill" : "another skill"} in this
          category
        </button>
      )}
    </div>
  );
}

// ─── SkillRow — single skill with proficiency, years, verify, remove ──────

export function SkillRow({
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
          title={
            isFeatured ? "Featured on roster card" : "Set as featured skill"
          }
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
            <span
              style={{
                marginLeft: 8,
                fontSize: 10.5,
                color: T.inkMuted,
                fontWeight: 400,
              }}
            >
              saving…
            </span>
          )}
        </span>
        <ProficiencyLabel
          level={skill.proficiency_level}
          isVerified={skill.is_verified}
        />
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <ProficiencyDotPicker
          value={skill.proficiency_level}
          onChange={onProficiencyChange}
        />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11.5,
            color: T.inkMuted,
          }}
        >
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
