"use client";

// ============================================================================
// _skill-aspirations.tsx — CareerInterestsSection + AddAspirationPicker.
//
// Extracted from the original _skill-slot-panel.tsx during the Phase 2
// refactor. CareerInterestsSection lists the talent's "aspiration" rows
// (talent_types they're open to growing into) and lets admins add or
// remove them. The picker modal is the AddAspirationPicker child.
// ============================================================================

import { useEffect, useState } from "react";

import {
  addAspiration,
  getAspirations,
  getEnabledParentCategoriesForPicker,
  getTalentTypesUnderParent,
  removeAspiration,
} from "@/lib/server-actions/admin-talent-skills";

import { useDashboardText } from "./dashboard-i18n";
import { F_BODY, PARENT_EMOJI, T } from "./skill-tokens";

// ─── CareerInterestsSection — Q2: aspirations / "open to grow into" ──────

export function CareerInterestsSection({
  talentProfileId,
  existingSkillIds,
  initialAspirations,
}: {
  talentProfileId: string;
  existingSkillIds: Set<string>;
  /** Pre-loaded by parent. When provided, skips the initial fetch. */
  initialAspirations?: Array<{ term_id: string; slug: string; name_en: string }>;
}) {
  const copy = useDashboardText();
  const [aspirations, setAspirations] = useState<
    Array<{ term_id: string; slug: string; name_en: string }>
  >(initialAspirations ?? []);
  const [loaded, setLoaded] = useState(initialAspirations !== undefined);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when parent fetches fresh data (cache hit or post-mutation reload).
  useEffect(() => {
    if (initialAspirations !== undefined) {
      setAspirations(initialAspirations);
      setLoaded(true);
    }
  }, [initialAspirations]);

  const reload = async () => {
    const res = await getAspirations({ talent_profile_id: talentProfileId });
    if (res.ok) setAspirations(res.aspirations);
    setLoaded(true);
  };

  // Only fetch independently when no parent-supplied data exists.
  useEffect(() => {
    if (initialAspirations !== undefined) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload closes over talentProfileId and stable setters; re-fetch when the talent changes
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
        marginTop: 20,
        fontFamily: F_BODY,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: T.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {copy.t("Career interests · open to grow into")}
      </div>
      <div
        style={{ fontSize: 11.5, color: T.inkMuted, marginBottom: 10 }}
      >
        {copy.t("Talent types this person is open to learning / accepting if invited. Doesn't count toward the 9-skill cap.")}
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
              {copy.term(a.name_en)}
              <button
                type="button"
                onClick={() => handleRemove(a.term_id)}
                title={copy.t("Remove interest")}
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
        {copy.t("+ Add interest")}
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

// ─── AddAspirationPicker — modal for adding career-interest rows ──────────

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
  const copy = useDashboardText();
  const [parents, setParents] = useState<
    Array<{ id: string; slug: string; name_en: string; emoji: string }>
  >([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    null,
  );
  const [types, setTypes] = useState<Array<{ id: string; name_en: string; name_es?: string | null }>>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [submittingTypeId, setSubmittingTypeId] = useState<string | null>(
    null,
  );

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
              .map((t) => ({ id: t.id, name_en: t.name_en, name_es: t.name_es })),
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
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: T.ink,
            marginBottom: 4,
          }}
        >
          {copy.t("Add a career interest")}
        </div>
        <div
          style={{ fontSize: 12, color: T.inkMuted, marginBottom: 12 }}
        >
          {copy.t("A talent type they're open to growing into. Doesn't replace current skills.")}
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
                <span className="text-sm">{p.emoji}</span>
                {copy.term(p.name_en)}
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
              {copy.t("← Back to categories")}
            </button>
            <input
              autoFocus
              placeholder={copy.t("Search…")}
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
                <div
                  style={{ padding: 8, color: T.inkMuted, fontSize: 11.5 }}
                >
                  {copy.t("Loading…")}
                </div>
              )}
              {!loadingTypes && types.length === 0 && (
                <div
                  style={{ padding: 8, color: T.inkMuted, fontSize: 11.5 }}
                >
                  {copy.t("No matching types.")}
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
                  {copy.term(t.name_en, t.name_es)}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end">
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
            {copy.t("Done")}
          </button>
        </div>
      </div>
    </div>
  );
}
