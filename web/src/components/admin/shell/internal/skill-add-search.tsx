"use client";

// ============================================================================
// _skill-add-search.tsx — AddSkillSearch + RequestNewSkillForm
//
// Two-step picker: category grid → multi-select skills list.
// Selecting a category swaps the view in-place; a "← Back" button returns
// to the grid. Skills are toggled (multi-select) and committed in one batch
// via "Add N skill(s)". The remaining-capacity counter updates live.
// ============================================================================

import { useEffect, useRef, useState } from "react";

import {
  getEnabledParentCategoriesForPicker,
  getTalentTypesUnderParent,
  requestNewTaxonomyTerm,
} from "@/lib/server-actions/admin-talent-skills";
import { MAX_TOTAL_SKILLS } from "@/lib/server-actions/admin-talent-skills.types";

import { useDashboardText } from "./dashboard-i18n";
import { F_BODY, PARENT_EMOJI, T } from "./skill-tokens";

type SkillPickerParent = {
  id: string;
  slug: string;
  name_en: string;
  name_es?: string | null;
  emoji: string;
};

type SkillPickerType = {
  id: string;
  name_en: string;
  name_es: string | null;
  category_group_name: string | null;
};

export function AddSkillSearch({
  role,
  fixedParentId,
  existingSkillIds,
  totalSkills,
  onClose,
  onAdded,
  talentProfileId,
}: {
  role: "primary" | "secondary";
  fixedParentId: string | undefined;
  existingSkillIds: Set<string>;
  totalSkills: number;
  onClose: () => void;
  /** P5 — parent owns the write (one setAll server action). We hand up
   *  the picked term ids + role, PLUS each item's display metadata and the
   *  parent category, so the parent can render the add OPTIMISTICALLY (an
   *  add issued right before a remove must already be in the authoritative
   *  desired-state ref or the remove's setAll drops it). On error we keep
   *  the dialog open with the selection intact (fallback-safe). */
  onAdded: (picked: {
    ids: string[];
    role: "primary" | "secondary";
    items: Array<{ id: string; name_en: string; name_es: string | null }>;
    parentId: string | null;
    parentName: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  talentProfileId: string;
}) {
  const copy = useDashboardText();
  const [parents, setParents] = useState<SkillPickerParent[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    fixedParentId ?? null,
  );
  const [selectedParentName, setSelectedParentName] = useState<string | null>(null);
  const [types, setTypes] = useState<SkillPickerType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTypes, setLoadingTypes] = useState(false);
  // Multi-select: IDs the user has toggled on in this session.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Accumulates display metadata for every type seen, so a selection made
  // before a search-filter change still resolves its name at submit time
  // (the optimistic chip the parent renders needs the label).
  const typeMetaRef = useRef<
    Map<string, { name_en: string; name_es: string | null }>
  >(new Map());

  const remainingSlots = MAX_TOTAL_SKILLS - totalSkills - selected.size;

  // Load parent categories on mount (skip when fixedParentId is set).
  useEffect(() => {
    if (fixedParentId) return;
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

  // Load talent types when a parent is selected.
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
          setTypes(res.types);
          for (const t of res.types) {
            typeMetaRef.current.set(t.id, {
              name_en: t.name_en,
              name_es: t.name_es,
            });
          }
        } else setError(res.error);
      })
      .finally(() => setLoadingTypes(false));
  }, [selectedParentId, searchQuery]);

  const parentLabel = (parent: SkillPickerParent) =>
    copy.term(parent.name_en, parent.name_es);
  const selectedParentLabel =
    selectedParentName ??
    (selectedParentId
      ? (() => {
          const parent = parents.find((p) => p.id === selectedParentId);
          return parent ? parentLabel(parent) : null;
        })()
      : null);

  const handleSelectParent = (id: string, name: string) => {
    setSelected(new Set()); // reset selection when switching category
    setSearchQuery("");
    setError(null);
    setSelectedParentId(id);
    setSelectedParentName(name);
  };

  const handleBack = () => {
    setSelectedParentId(fixedParentId ?? null);
    setSelectedParentName(null);
    setSelected(new Set());
    setSearchQuery("");
    setError(null);
  };

  const toggleSkill = (id: string) => {
    if (existingSkillIds.has(id)) return; // already on profile
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (remainingSlots <= 0 && !next.has(id)) return prev; // at cap
        next.add(id);
      }
      return next;
    });
    setError(null);
  };

  const handleAddSelected = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    const selectedIds = Array.from(selected);
    // P5 — single setAll write owned by the parent. No append-only
    // addSkill/addSkills + reload cascade. Pass display metadata + parent
    // so the parent can optimistically merge into its desired-state ref.
    const items = selectedIds.map((id) => {
      const meta = typeMetaRef.current.get(id);
      return {
        id,
        name_en: meta?.name_en ?? "…",
        name_es: meta?.name_es ?? null,
      };
    });
    const res = await onAdded({
      ids: selectedIds,
      role,
      items,
      parentId: selectedParentId,
      parentName: selectedParentLabel,
    });
    if (!res.ok) {
      setError(res.error ?? "Couldn't save. Try again.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    // Parent closes the dialog (setAddingForRole(null)) on success.
  };

  // ── Subview: category grid ──────────────────────────────────────────
  const showGrid = !selectedParentId;

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
        {/* ── Header ── */}
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${T.borderSoft}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div className="flex-1 min-w-0">
            {/* Back link — only when inside a category */}
            {selectedParentId && !fixedParentId && (
              <button
                type="button"
                onClick={handleBack}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  padding: "0 0 8px",
                  cursor: "pointer",
                  fontFamily: F_BODY,
                  fontSize: 12,
                  fontWeight: 600,
                  color: T.inkMuted,
                }}
              >
                {copy.t("← Back")}
              </button>
            )}
            <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 2 }}>
              {showGrid
                ? copy.addSkillTitle(role)
                : selectedParentLabel ?? copy.t("Pick a skill")}
            </div>
            <div style={{ fontSize: 12, color: T.inkMuted }}>
              {showGrid
                ? copy.t("Pick a category, then choose the specific role.")
                : copy.t("Select one or more skills to add.")}
            </div>
          </div>

          {/* Skills remaining badge */}
          <div
            style={{
              flexShrink: 0,
              padding: "4px 10px",
              borderRadius: 999,
              background: remainingSlots <= 2 ? "rgba(220,38,38,0.08)" : T.accentSoft,
              border: `1px solid ${remainingSlots <= 2 ? "rgba(220,38,38,0.2)" : "rgba(15,79,62,0.15)"}`,
              fontSize: 11.5,
              fontWeight: 700,
              color: remainingSlots <= 2 ? "#dc2626" : T.accent,
              whiteSpace: "nowrap",
            }}
          >
            {copy.skillsLeft(remainingSlots, MAX_TOTAL_SKILLS)}
          </div>
        </div>

        {/* ── Category grid ── */}
        {showGrid && (
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 8,
              }}
            >
              {parents.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectParent(p.id, parentLabel(p))}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${T.border}`,
                    background: T.surface,
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
                  {parentLabel(p)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Types list (multi-select) ── */}
        {!showGrid && (
          <>
            {/* Search */}
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.borderSoft}` }}>
              <input
                autoFocus
                placeholder={copy.t("Search…")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  fontSize: 13,
                  fontFamily: F_BODY,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  margin: "10px 16px 0",
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

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {loadingTypes && (
                <div style={{ padding: 12, color: T.inkMuted, fontSize: 12 }}>{copy.t("Loading…")}</div>
              )}
              {!loadingTypes && types.length === 0 && (
                <div style={{ padding: 12, color: T.inkMuted, fontSize: 12 }}>{copy.t("No matching roles.")}</div>
              )}
              {types.map((t) => {
                const alreadyAdded = existingSkillIds.has(t.id);
                const isSelected = selected.has(t.id);
                const atCap = remainingSlots <= 0 && !isSelected;

                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={alreadyAdded || (atCap && !isSelected)}
                    onClick={() => toggleSkill(t.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      marginBottom: 4,
                      borderRadius: 8,
                      border: `1px solid ${isSelected ? T.accent : alreadyAdded ? T.borderSoft : T.border}`,
                      background: isSelected ? T.accentSoft : alreadyAdded ? T.surfaceAlt : T.surface,
                      cursor: alreadyAdded || atCap ? "default" : "pointer",
                      opacity: alreadyAdded ? 0.5 : atCap && !isSelected ? 0.4 : 1,
                      fontFamily: F_BODY,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    {/* Checkbox indicator */}
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        flexShrink: 0,
                        border: `1.5px solid ${isSelected ? T.accent : alreadyAdded ? T.borderSoft : T.border}`,
                        background: isSelected ? T.accent : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        color: "#fff",
                      }}
                    >
                      {isSelected ? "✓" : alreadyAdded ? "✓" : ""}
                    </span>

                    <div className="flex-1">
                      <div style={{ fontSize: 13, fontWeight: 600, color: alreadyAdded ? T.inkMuted : T.ink }}>
                        {copy.term(t.name_en, t.name_es)}
                      </div>
                      {t.category_group_name && (
                        <div style={{ fontSize: 10.5, color: T.inkMuted, marginTop: 1 }}>
                          {copy.term(t.category_group_name)}
                        </div>
                      )}
                    </div>

                    {alreadyAdded && (
                      <span style={{ fontSize: 10.5, color: T.inkMuted, fontWeight: 600, flexShrink: 0 }}>
                        {copy.t("On profile")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Footer ── */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: `1px solid ${T.borderSoft}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
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
            {copy.t("✦ Don't see your skill? Suggest one →")}
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Add selected button — only when skills are picked */}
            {selected.size > 0 && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleAddSelected}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "none",
                  background: submitting ? T.inkMuted : T.accent,
                  color: "#fff",
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontFamily: F_BODY,
                  whiteSpace: "nowrap",
                }}
              >
                {submitting ? copy.t("Adding…") : copy.addSkillsButton(selected.size)}
              </button>
            )}
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
              {copy.t("Close")}
            </button>
          </div>
        </div>
      </div>

      {showRequestForm && (
        <RequestNewSkillForm
          parentId={selectedParentId}
          parentLabel={
            selectedParentLabel
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
          {copy.t("✓ Skill suggestion sent. We'll review it and let you know.")}
        </div>
      )}
    </div>
  );
}

// ─── RequestNewSkillForm ──────────────────────────────────────────────────────

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
  const copy = useDashboardText();
  const [proposedName, setProposedName] = useState(query.trim());
  const [contextNote, setContextNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const name = proposedName.trim();
    if (name.length < 2) {
      setError(copy.t("Skill name must be at least 2 characters."));
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
    if (res.ok) onSubmitted();
    else setError(res.error);
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
          {copy.t("Suggest a new skill")}
        </div>
        <div style={{ fontSize: 13, color: T.inkMuted, lineHeight: 1.5, marginBottom: 16 }}>
          {copy.t("Don't see what you're looking for? Tell us what's missing. Our team reviews suggestions and adds genuine gaps to the catalog within a few business days.")}
          {parentLabel && <> {copy.t("We'll file this under")} <strong>{parentLabel}</strong>.</>}
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 4 }}>
          {copy.t("Skill name")}
        </label>
        <input
          value={proposedName}
          onChange={(e) => setProposedName(e.target.value)}
          placeholder={copy.t("e.g. Doula, Sound Healer, Underwater Photographer")}
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
          {copy.t("Why do you need this?")}{" "}
          <span style={{ fontWeight: 400, color: T.inkMuted }}>{copy.t("(optional)")}</span>
        </label>
        <textarea
          value={contextNote}
          onChange={(e) => setContextNote(e.target.value)}
          placeholder={copy.t("e.g. 'We book 3–5 doulas per month and they don't fit any existing category.'")}
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
            {copy.t("Cancel")}
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
              background: proposedName.trim().length < 2 ? T.inkMuted : T.accent,
              color: "#fff",
              cursor: proposedName.trim().length < 2 ? "not-allowed" : "pointer",
              fontFamily: F_BODY,
            }}
          >
            {submitting ? copy.t("Sending…") : copy.t("Send suggestion")}
          </button>
        </div>
      </div>
    </div>
  );
}
