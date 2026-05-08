"use client";

// ============================================================================
// _skill-discovery-panel.tsx — Phase 3.3: Discovery UI minimal scaffold.
//
// Renders an inline "Find by skill" expandable section above the roster
// grid. When a skill filter is applied, calls searchTalent and lists
// matched results with their proficiency dots + verification.
//
// V1 minimal — fixed filters (skill_slug, min_proficiency, verified_only).
// V2 strategic — full filter drawer, geographic filters, availability,
// rate range, search by inquiry brief.
// ============================================================================

import React, { useEffect, useState } from "react";
import {
  searchTalent,
  type SearchTalentResult,
} from "@/lib/server-actions/search-talent";
import {
  PROFICIENCY_LEVELS,
  PROFICIENCY_META,
  type ProficiencyLevel,
} from "@/lib/server-actions/admin-talent-skills.types";
import {
  getEnabledParentCategoriesForPicker,
  getTalentTypesUnderParent,
} from "@/lib/server-actions/admin-talent-skills";

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
  indigo: "#5B6BA0",
  indigoSoft: "rgba(91,107,160,0.12)",
  indigoDeep: "#3B4A75",
  gold: "#C99A4F",
  goldSoft: "rgba(201,154,79,0.16)",
};
const F_BODY = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function SkillDiscoveryPanel({
  onTalentClick,
}: {
  onTalentClick?: (talentProfileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [parents, setParents] = useState<
    Array<{ id: string; slug: string; name_en: string }>
  >([]);
  const [selectedParentSlug, setSelectedParentSlug] = useState<string | null>(null);
  const [skillTypes, setSkillTypes] = useState<
    Array<{ id: string; slug: string; name_en: string }>
  >([]);
  const [selectedSkillSlug, setSelectedSkillSlug] = useState<string | null>(null);
  const [minProficiency, setMinProficiency] = useState<ProficiencyLevel | "">("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [results, setResults] = useState<SearchTalentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load parent categories on first open.
  useEffect(() => {
    if (!open || parents.length > 0) return;
    getEnabledParentCategoriesForPicker().then((res) => {
      if (res.ok) setParents(res.parents);
    });
  }, [open, parents.length]);

  // Load talent_types when parent changes.
  useEffect(() => {
    if (!selectedParentSlug) {
      setSkillTypes([]);
      return;
    }
    const parent = parents.find((p) => p.slug === selectedParentSlug);
    if (!parent) return;
    getTalentTypesUnderParent({ parent_category_id: parent.id }).then((res) => {
      if (res.ok)
        setSkillTypes(
          res.types.map((t) => ({ id: t.id, slug: t.slug, name_en: t.name_en })),
        );
    });
  }, [selectedParentSlug, parents]);

  const handleSearch = async () => {
    setSearching(true);
    setError(null);
    const res = await searchTalent({
      skill_slugs: selectedSkillSlug ? [selectedSkillSlug] : undefined,
      parent_category_slugs: selectedParentSlug && !selectedSkillSlug
        ? [selectedParentSlug]
        : undefined,
      min_proficiency: minProficiency || undefined,
      verified_only: verifiedOnly || undefined,
      sort: "relevance",
      scope: "tenant",
      limit: 30,
    });
    setSearching(false);
    if (res.ok) {
      setResults(res.results);
      setTotalCount(res.total_count);
    } else {
      setError(res.error);
    }
  };

  const handleClear = () => {
    setSelectedParentSlug(null);
    setSelectedSkillSlug(null);
    setMinProficiency("");
    setVerifiedOnly(false);
    setResults([]);
    setTotalCount(0);
  };

  return (
    <div
      style={{
        marginBottom: 12,
        padding: open ? 16 : 0,
        borderRadius: 12,
        background: open ? T.surfaceWarm : "transparent",
        border: open ? `1px solid ${T.border}` : "1px solid transparent",
        fontFamily: F_BODY,
      }}
    >
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 999,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.ink,
            cursor: "pointer",
            fontFamily: F_BODY,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 13 }}>🔍</span>
          Find talent by skill
        </button>
      )}

      {open && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
              Find talent by skill
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                color: T.inkMuted,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: F_BODY,
              }}
            >
              ✕ Close
            </button>
          </div>

          {/* Parent picker */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMuted, marginBottom: 4 }}>
              Category
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {parents.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setSelectedParentSlug(
                      selectedParentSlug === p.slug ? null : p.slug,
                    )
                  }
                  style={{
                    padding: "5px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 999,
                    border: `1px solid ${selectedParentSlug === p.slug ? T.accent : T.border}`,
                    background: selectedParentSlug === p.slug ? T.accent : T.surface,
                    color: selectedParentSlug === p.slug ? "#fff" : T.ink,
                    cursor: "pointer",
                    fontFamily: F_BODY,
                  }}
                >
                  {p.name_en}
                </button>
              ))}
            </div>
          </div>

          {/* Skill picker (only when a parent is selected) */}
          {selectedParentSlug && skillTypes.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMuted, marginBottom: 4 }}>
                Specific skill
              </div>
              <select
                value={selectedSkillSlug ?? ""}
                onChange={(e) => setSelectedSkillSlug(e.target.value || null)}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  fontSize: 12,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  fontFamily: F_BODY,
                  background: T.surface,
                }}
              >
                <option value="">Any skill in this category</option>
                {skillTypes.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.name_en}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Min proficiency */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMuted, marginBottom: 4 }}>
              Minimum proficiency
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              <button
                type="button"
                onClick={() => setMinProficiency("")}
                style={{
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: `1px solid ${minProficiency === "" ? T.accent : T.border}`,
                  background: minProficiency === "" ? T.accent : T.surface,
                  color: minProficiency === "" ? "#fff" : T.ink,
                  cursor: "pointer",
                  fontFamily: F_BODY,
                }}
              >
                Any level
              </button>
              {PROFICIENCY_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setMinProficiency(lvl)}
                  style={{
                    padding: "5px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 999,
                    border: `1px solid ${minProficiency === lvl ? T.accent : T.border}`,
                    background: minProficiency === lvl ? T.accent : T.surface,
                    color: minProficiency === lvl ? "#fff" : T.ink,
                    cursor: "pointer",
                    fontFamily: F_BODY,
                  }}
                >
                  {PROFICIENCY_META[lvl].label}+
                </button>
              ))}
            </div>
          </div>

          {/* Verified only */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: T.ink,
              marginBottom: 12,
              cursor: "pointer",
              fontFamily: F_BODY,
            }}
          >
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
            />
            Only verified skills
          </label>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button
              type="button"
              disabled={searching}
              onClick={handleSearch}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                background: T.accent,
                color: "#fff",
                cursor: "pointer",
                fontFamily: F_BODY,
              }}
            >
              {searching ? "Searching…" : "Search"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: T.surface,
                color: T.inkMuted,
                cursor: "pointer",
                fontFamily: F_BODY,
              }}
            >
              Clear
            </button>
          </div>

          {error && (
            <div
              style={{
                padding: 10,
                marginBottom: 10,
                borderRadius: 8,
                background: "rgba(164,54,26,0.1)",
                border: `1px solid ${T.red}`,
                fontSize: 12,
                color: T.ink,
              }}
            >
              {error}
            </div>
          )}

          {totalCount > 0 && (
            <div
              style={{
                fontSize: 11.5,
                color: T.indigoDeep,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {totalCount} {totalCount === 1 ? "match" : "matches"} found
            </div>
          )}

          {results.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {results.map((r) => (
                <button
                  key={r.talent_profile_id}
                  type="button"
                  onClick={() => onTalentClick?.(r.talent_profile_id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${T.border}`,
                    background: T.surface,
                    cursor: "pointer",
                    fontFamily: F_BODY,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      background: T.surfaceAlt,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: T.inkMuted,
                    }}
                  >
                    {r.display_name
                      .split(" ")
                      .map((s) => s[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
                      {r.display_name}
                    </div>
                    <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>
                      {r.featured_skill_name ?? "No featured skill"}
                      {r.featured_proficiency && (
                        <>
                          {" · "}
                          <span
                            style={{
                              color:
                                r.featured_proficiency === "master"
                                  ? "#7a5a1f"
                                  : r.featured_proficiency === "expert"
                                    ? T.accent
                                    : T.inkMuted,
                              fontWeight: 600,
                            }}
                          >
                            {PROFICIENCY_META[r.featured_proficiency].label}
                            {r.featured_is_verified && " ✓"}
                          </span>
                        </>
                      )}
                      {r.home_base_city && ` · ${r.home_base_city}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 10.5, color: T.inkMuted }}>
                    score {r.score}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
