"use client";

// ============================================================================
// _skill-add-search.tsx — AddSkillSearch + RequestNewSkillForm
//
// Extracted from the original _skill-slot-panel.tsx during the Phase 2
// refactor. AddSkillSearch is the modal-ish parent_category → talent_type
// picker for adding a new skill. RequestNewSkillForm is the
// "Don't see your skill?" capture form, only invoked from inside
// AddSkillSearch — so the two ship together.
// ============================================================================

import { useEffect, useState } from "react";

import {
  addSkill,
  getEnabledParentCategoriesForPicker,
  getTalentTypesUnderParent,
  requestNewTaxonomyTerm,
} from "@/lib/server-actions/admin-talent-skills";

import { F_BODY, PARENT_EMOJI, T } from "./_skill-tokens";

export function AddSkillSearch({
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
  const [parents, setParents] = useState<
    Array<{ id: string; slug: string; name_en: string; emoji: string }>
  >([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    fixedParentId ?? null,
  );
  const [types, setTypes] = useState<
    Array<{
      id: string;
      name_en: string;
      category_group_name: string | null;
    }>
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [submittingTypeId, setSubmittingTypeId] = useState<string | null>(
    null,
  );
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
        <div
          style={{
            padding: "20px 24px 12px",
            borderBottom: `1px solid ${T.borderSoft}`,
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
          <div
            style={{
              padding: "12px 20px",
              borderBottom: `1px solid ${T.borderSoft}`,
            }}
          >
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
                    background:
                      selectedParentId === p.id ? T.accentSoft : T.surface,
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
          <div
            style={{
              padding: "10px 20px",
              borderBottom: `1px solid ${T.borderSoft}`,
            }}
          >
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
            <div
              style={{
                padding: 16,
                color: T.inkMuted,
                fontSize: 12,
                textAlign: "center",
              }}
            >
              Pick a category above to see specific roles.
            </div>
          )}
          {loadingTypes && (
            <div style={{ padding: 12, color: T.inkMuted, fontSize: 12 }}>
              Loading…
            </div>
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
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: T.ink }}
                  >
                    {t.name_en}
                  </div>
                  {t.category_group_name && (
                    <div
                      style={{
                        fontSize: 10.5,
                        color: T.inkMuted,
                        marginTop: 1,
                      }}
                    >
                      {t.category_group_name}
                    </div>
                  )}
                </div>
                {alreadyAdded && (
                  <span
                    style={{
                      fontSize: 10.5,
                      color: T.inkMuted,
                      fontWeight: 600,
                    }}
                  >
                    Already added
                  </span>
                )}
                {submittingTypeId === t.id && (
                  <span style={{ fontSize: 10.5, color: T.inkMuted }}>
                    adding…
                  </span>
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
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: T.ink,
            marginBottom: 4,
          }}
        >
          Suggest a new skill
        </div>
        <div
          style={{
            fontSize: 13,
            color: T.inkMuted,
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
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

        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: T.ink,
            marginBottom: 4,
          }}
        >
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

        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: T.ink,
            marginBottom: 4,
          }}
        >
          Why do you need this?{" "}
          <span style={{ fontWeight: 400, color: T.inkMuted }}>
            (optional, but helpful)
          </span>
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
