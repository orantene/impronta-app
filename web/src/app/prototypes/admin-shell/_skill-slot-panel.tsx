"use client";

// ============================================================================
// _skill-slot-panel.tsx — Multi-skill talent picker UI (Phase 2 refactor)
//
// Renders the primary + (up to 2) secondary category cards for a talent's
// skill catalog. Each card lists the skills in that role/parent group with
// proficiency, years, verify, and remove controls. Capped at 9 skills total.
//
// This file used to be a 2080-line god-component. Phase 2 split it into:
//   _skill-tokens.ts          shared style tokens + parent emojis
//   _skill-helpers.ts         pure grouping/featuring/counting helpers (+ tests)
//   _skill-proficiency.tsx    ProficiencyDotPicker + ProficiencyLabel
//   _skill-row.tsx            SkillCategoryCard + SkillRow
//   _skill-add-search.tsx     AddSkillSearch + RequestNewSkillForm
//   _skill-verify-dialog.tsx  VerifyConfirmDialog
//   _skill-aspirations.tsx    CareerInterestsSection + AddAspirationPicker
//
// This file orchestrates them. The exported public API is unchanged:
// SkillSlotPanel (default-imported by callers) plus ProficiencyDotPicker /
// ProficiencyLabel re-exports for any downstream consumers.
// ============================================================================

import { useEffect, useMemo, useState } from "react";

import {
  getAspirations,
  getResolvedSkills,
  removeSkill,
  setFeaturedSkill,
  unverifySkill,
  updateSkill,
  verifySkill,
} from "@/lib/server-actions/admin-talent-skills";

// ─── Module-level skills cache ─────────────────────────────────────────────
// Keyed by talentProfileId. Survives drawer open/close within the same session
// so re-opening the same talent is instant. Mutations always bypass it.
type CacheEntry = {
  skills: ResolvedSkill[];
  aspirations: Array<{ term_id: string; slug: string; name_en: string }>;
  ts: number;
};
const CACHE_TTL = 60_000;
const _skillsCache = new Map<string, CacheEntry>();
// In-flight dedup — prevents React Strict Mode's double-invoke from firing two
// simultaneous server action calls for the same talentProfileId.
const _inflight = new Map<string, Promise<void>>();
import {
  MAX_TOTAL_SKILLS,
  type ProficiencyLevel,
  type ResolvedSkill,
} from "@/lib/server-actions/admin-talent-skills.types";

import { AddSkillSearch } from "./_skill-add-search";
import { CareerInterestsSection } from "./_skill-aspirations";
import {
  countSecondaryParents,
  groupSkillsByRoleParent,
  pickFeaturedSkillTermId,
} from "./_skill-helpers";
import { SkillCategoryCard } from "./_skill-row";
import { F_BODY, T } from "./_skill-tokens";
import { VerifyConfirmDialog } from "./_skill-verify-dialog";

// Re-exports — back-compat for anything importing primitives from this file.
export {
  ProficiencyDotPicker,
  ProficiencyLabel,
} from "./_skill-proficiency";

/**
 * Fire-and-forget prefetch — call when a talent drawer opens so skills data
 * is in the module cache before the user clicks the Services tab.
 * Safe to call multiple times; deduplicates against in-flight and cached entries.
 */
export function prefetchSkillsData(talentProfileId: string): void {
  const hit = _skillsCache.get(talentProfileId);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return;
  if (_inflight.has(talentProfileId)) return;

  const promise = (async () => {
    const [skillsRes, aspirationsRes] = await Promise.all([
      getResolvedSkills({ talent_profile_id: talentProfileId }),
      getAspirations({ talent_profile_id: talentProfileId }),
    ]);
    if (skillsRes.ok) {
      const asp = aspirationsRes.ok ? aspirationsRes.aspirations : [];
      _skillsCache.set(talentProfileId, { skills: skillsRes.skills, aspirations: asp, ts: Date.now() });
    }
  })();
  _inflight.set(talentProfileId, promise);
  promise.finally(() => _inflight.delete(talentProfileId));
}

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
  const [aspirations, setAspirations] = useState<
    Array<{ term_id: string; slug: string; name_en: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingTermIds, setSavingTermIds] = useState<Set<string>>(new Set());

  // Phase 7.3 — narrow isAdmin by viewMode. Talent-self mode hides admin
  // controls (Verify, scope toggle) regardless of caller's isAdmin.
  const adminControls = isAdmin && viewMode === "admin";

  const fetchData = async (useCache: boolean) => {
    if (useCache) {
      const hit = _skillsCache.get(talentProfileId);
      if (hit && Date.now() - hit.ts < CACHE_TTL) {
        setSkills(hit.skills);
        setAspirations(hit.aspirations);
        return;
      }
      // Deduplicate concurrent calls (React Strict Mode fires effects twice).
      const existing = _inflight.get(talentProfileId);
      if (existing) {
        await existing;
        const fresh = _skillsCache.get(talentProfileId);
        if (fresh) { setSkills(fresh.skills); setAspirations(fresh.aspirations); }
        return;
      }
    }

    setLoading(true);
    setError(null);

    const promise = (async () => {
      const [skillsRes, aspirationsRes] = await Promise.all([
        getResolvedSkills({ talent_profile_id: talentProfileId }),
        getAspirations({ talent_profile_id: talentProfileId }),
      ]);
      setLoading(false);
      if (skillsRes.ok) {
        const asp = aspirationsRes.ok ? aspirationsRes.aspirations : [];
        _skillsCache.set(talentProfileId, {
          skills: skillsRes.skills,
          aspirations: asp,
          ts: Date.now(),
        });
        setSkills(skillsRes.skills);
        setAspirations(asp);
      } else {
        setError(skillsRes.error);
      }
    })();

    if (useCache) {
      _inflight.set(talentProfileId, promise);
      promise.finally(() => _inflight.delete(talentProfileId));
    }
    await promise;
  };

  const reload = () => fetchData(false);

  useEffect(() => {
    fetchData(true);
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

  const grouped = useMemo(
    () => (skills ? groupSkillsByRoleParent(skills) : new Map()),
    [skills],
  );

  const totalSkills = skills?.length ?? 0;
  const primaryGroup = useMemo(() => {
    for (const [k, g] of grouped) {
      if (g.role === "primary_role") return { key: k, ...g };
    }
    return null;
  }, [grouped]);

  const secondaryGroups = useMemo(() => {
    const arr: Array<{
      key: string;
      parent_id: string;
      parent_name: string;
      skills: ResolvedSkill[];
    }> = [];
    for (const [k, g] of grouped) {
      if (g.role === "secondary_role")
        arr.push({
          key: k,
          parent_id: g.parent_id,
          parent_name: g.parent_name,
          skills: g.skills,
        });
    }
    return arr;
  }, [grouped]);

  const handleProficiencyChange = async (
    skill: ResolvedSkill,
    next: ProficiencyLevel | null,
  ) => {
    setSaving(skill.skill_term_id, true);
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

  const handleYearsChange = async (
    skill: ResolvedSkill,
    yearsStr: string,
  ) => {
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

  const featuredSkillId = useMemo(
    () => pickFeaturedSkillTermId(skills),
    [skills],
  );

  const [addingForRole, setAddingForRole] = useState<{
    role: "primary" | "secondary";
    parent_id?: string;
  } | null>(null);

  const distinctSecondaryParents = countSecondaryParents(skills);
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
            One primary category · up to two secondary categories · max 9
            skills total
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
                background:
                  i < totalSkills ? T.indigoDeep : "rgba(11,11,13,0.15)",
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
        <div style={{ color: T.inkMuted, fontSize: 12, padding: 8 }}>
          Loading skills…
        </div>
      )}

      {/* PRIMARY card */}
      <SkillCategoryCard
        roleLabel="Primary category"
        roleEmoji="★"
        parentName={primaryGroup?.parent_name ?? null}
        skills={primaryGroup?.skills ?? []}
        onAddClick={() =>
          setAddingForRole({
            role: "primary",
            parent_id: primaryGroup?.parent_id,
          })
        }
        onProficiencyChange={handleProficiencyChange}
        onYearsChange={handleYearsChange}
        onRemove={handleRemove}
        onToggleVerify={handleOpenVerify}
        onSetFeatured={handleSetFeatured}
        featuredSkillId={featuredSkillId}
        savingTermIds={savingTermIds}
        canAddSkill={totalSkills < MAX_TOTAL_SKILLS}
        isAdmin={adminControls}
      />

      {/* SECONDARY cards */}
      {secondaryGroups.map((g, i) => (
        <SkillCategoryCard
          key={g.key}
          roleLabel={`Secondary category ${i + 1}`}
          roleEmoji="◆"
          parentName={g.parent_name}
          skills={g.skills}
          onAddClick={() =>
            setAddingForRole({ role: "secondary", parent_id: g.parent_id })
          }
          onProficiencyChange={handleProficiencyChange}
          onYearsChange={handleYearsChange}
          onRemove={handleRemove}
          onToggleVerify={handleOpenVerify}
          onSetFeatured={handleSetFeatured}
          featuredSkillId={featuredSkillId}
          savingTermIds={savingTermIds}
          canAddSkill={totalSkills < MAX_TOTAL_SKILLS}
          isAdmin={adminControls}
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
          + Add{" "}
          {secondaryGroups.length === 0 ? "first" : "second"} secondary
          category
        </button>
      )}

      {/* Q2: Career interests / aspirations — talent_types they're open to
          growing into. Stored in talent_profile_taxonomy with
          relationship_type='aspiration' (added via 20260907220000). */}
      <CareerInterestsSection
        talentProfileId={talentProfileId}
        existingSkillIds={new Set((skills ?? []).map((s) => s.skill_term_id))}
        initialAspirations={aspirations}
      />

      {/* Add-skill drawer */}
      {addingForRole && (
        <AddSkillSearch
          role={addingForRole.role}
          fixedParentId={addingForRole.parent_id}
          existingSkillIds={
            new Set((skills ?? []).map((s) => s.skill_term_id))
          }
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
          onConfirm={(note, scope) =>
            handleConfirmVerify(verifyDialog, note, scope)
          }
        />
      )}
    </div>
  );
}
