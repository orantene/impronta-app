"use client";

// ============================================================================
// _skill-overrides-panel.tsx — Per-agency skill override editor (Phase 7.1)
//
// Renders inside the talent quick-view drawer (admin viewMode only).
// Each row corresponds to one of the talent's resolved skills and lets the
// admin control how that skill appears on their agency site:
//
//   • Visible on this agency's site — toggle (default true / no override row)
//   • Featured for this agency — radio-like flag (server enforces ≤1 per talent)
//   • Display-order override — optional integer 0–9999
//   • Custom label — optional 120-char rename
//   • Notes — optional 500-char internal note (never shown to clients)
//
// Persistence is immediate: each control calls upsertAgencySkillOverride on
// change. When all fields return to defaults the row is deleted via
// clearAgencySkillOverride to keep the table sparse.
// ============================================================================

import React, { useEffect, useState, useTransition } from "react";
import {
  getResolvedSkills,
  getAgencySkillOverrides,
  upsertAgencySkillOverride,
  clearAgencySkillOverride,
} from "@/lib/server-actions/admin-talent-skills";
import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";

// ─── Local type for the override row (mirrors DB schema) ────────────────────
// Defined here rather than imported from the "use server" file to avoid
// client-bundle issues with non-async re-exports.

type AgencySkillOverride = {
  id: string;
  taxonomy_term_id: string;
  is_visible_on_agency_site: boolean;
  is_featured_for_agency: boolean;
  display_order_override: number | null;
  custom_label: string | null;
  notes: string | null;
};

// ─── Merged row — one per resolved skill ────────────────────────────────────

type SkillRow = {
  skill: ResolvedSkill;
  override: AgencySkillOverride | null;
};

// ─── Style tokens — matches the neutral palette from _skill-slot-panel ──────

const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  inkDim: "rgba(11,11,13,0.38)",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F2EB",
  surfaceWarm: "#F9F7F1",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  accentDeep: "#093328",
  green: "#2E7D5B",
};

const F = "Inter, system-ui, sans-serif";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** True when all fields are at their default state → can clear the override row. */
function isAllDefault(o: {
  visible: boolean;
  featured: boolean;
  order: number | null;
  label: string;
  notes: string;
}): boolean {
  return (
    o.visible === true &&
    o.featured === false &&
    (o.order === null || o.order.toString() === "") &&
    o.label.trim() === "" &&
    o.notes.trim() === ""
  );
}

// ─── SavedPill — tiny inline feedback ────────────────────────────────────────

function SavedPill({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;
  const color =
    status === "saved" ? T.accent : status === "error" ? "#C82828" : T.inkMuted;
  const bg =
    status === "saved"
      ? T.accentSoft
      : status === "error"
        ? "rgba(200,40,40,0.08)"
        : "rgba(11,11,13,0.05)";
  const label =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Error";
  return (
    <span
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        background: bg,
        color,
        fontFamily: F,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
        transition: "opacity 0.15s",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
        }}
      />
      {label}
    </span>
  );
}

// ─── SkillOverrideRow — one row per skill ────────────────────────────────────

function SkillOverrideRow({
  row,
  allRows,
  talentProfileId,
  onFeaturedChange,
}: {
  row: SkillRow;
  /** All rows in the panel — needed to clear featured state on siblings. */
  allRows: SkillRow[];
  talentProfileId: string;
  /** Callback when featured changes so siblings can update optimistically. */
  onFeaturedChange: (taxonomy_term_id: string, featured: boolean) => void;
}) {
  const { skill, override } = row;

  // Local controlled state — initialised from current override (or defaults).
  const [visible, setVisible] = useState<boolean>(
    override?.is_visible_on_agency_site ?? true,
  );
  const [featured, setFeatured] = useState<boolean>(
    override?.is_featured_for_agency ?? false,
  );
  const [order, setOrder] = useState<string>(
    override?.display_order_override != null
      ? String(override.display_order_override)
      : "",
  );
  const [label, setLabel] = useState<string>(override?.custom_label ?? "");
  const [notes, setNotes] = useState<string>(override?.notes ?? "");

  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [, startTransition] = useTransition();

  // Sync state when parent passes a new override (e.g. after featured cleared
  // by a sibling row).
  useEffect(() => {
    setVisible(override?.is_visible_on_agency_site ?? true);
    setFeatured(override?.is_featured_for_agency ?? false);
    setOrder(
      override?.display_order_override != null
        ? String(override.display_order_override)
        : "",
    );
    setLabel(override?.custom_label ?? "");
    setNotes(override?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: sync on override object change; all setters are stable; override reference changes when parent re-fetches
  }, [override]);

  async function persist(patch: {
    visible: boolean;
    featured: boolean;
    order: string;
    label: string;
    notes: string;
  }) {
    const orderNum =
      patch.order.trim() !== "" && !isNaN(Number(patch.order))
        ? Number(patch.order)
        : null;

    if (
      isAllDefault({
        visible: patch.visible,
        featured: patch.featured,
        order: orderNum,
        label: patch.label,
        notes: patch.notes,
      })
    ) {
      // Clear sparse row.
      const result = await clearAgencySkillOverride({
        talent_profile_id: talentProfileId,
        taxonomy_term_id: skill.skill_term_id,
      });
      return result.ok;
    }

    const result = await upsertAgencySkillOverride({
      talent_profile_id: talentProfileId,
      taxonomy_term_id: skill.skill_term_id,
      is_visible_on_agency_site: patch.visible,
      is_featured_for_agency: patch.featured,
      display_order_override: orderNum,
      custom_label: patch.label.trim() || null,
      notes: patch.notes.trim() || null,
    });
    return result.ok;
  }

  function save(patch: {
    visible?: boolean;
    featured?: boolean;
    order?: string;
    label?: string;
    notes?: string;
  }) {
    const next = {
      visible: patch.visible ?? visible,
      featured: patch.featured ?? featured,
      order: patch.order ?? order,
      label: patch.label ?? label,
      notes: patch.notes ?? notes,
    };
    setStatus("saving");
    startTransition(async () => {
      const ok = await persist(next);
      setStatus(ok ? "saved" : "error");
      // Clear "Saved" pill after 1.8 s.
      if (ok) {
        setTimeout(() => setStatus("idle"), 1800);
      }
    });
  }

  const skillDisplayName =
    label.trim() ||
    skill.skill_name_en ||
    (skill.skill_name_es ?? skill.skill_slug);

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: T.surface,
        border: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* ── Row header: skill name + save pill ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span
            style={{
              fontFamily: F,
              fontSize: 13,
              fontWeight: 600,
              color: T.ink,
            }}
          >
            {skillDisplayName}
          </span>
          {skill.parent_category_name_en && (
            <span
              style={{
                fontFamily: F,
                fontSize: 11,
                color: T.inkMuted,
                marginLeft: 6,
              }}
            >
              {skill.parent_category_name_en}
            </span>
          )}
          {skill.relationship_type === "primary_role" && (
            <span
              style={{
                fontFamily: F,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: T.accent,
                marginLeft: 6,
                padding: "2px 6px",
                background: T.accentSoft,
                borderRadius: 999,
              }}
            >
              Primary
            </span>
          )}
        </div>
        <SavedPill status={status} />
      </div>

      {/* ── Controls grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 12px",
        }}
      >
        {/* Visible toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => {
              const next = e.target.checked;
              setVisible(next);
              save({ visible: next });
            }}
            style={{ accentColor: T.accent, width: 14, height: 14 }}
          />
          <span style={{ fontFamily: F, fontSize: 12, color: T.ink }}>
            Visible on your site
          </span>
        </label>

        {/* Featured flag */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => {
              const next = e.target.checked;
              setFeatured(next);
              if (next) {
                // Optimistically clear siblings so the UI reflects
                // "one featured at a time" without waiting for server.
                onFeaturedChange(skill.skill_term_id, true);
              }
              save({ featured: next });
            }}
            style={{ accentColor: T.accent, width: 14, height: 14 }}
          />
          <span style={{ fontFamily: F, fontSize: 12, color: T.ink }}>
            Featured for your agency
          </span>
        </label>
      </div>

      {/* Display-order override */}
      <div className="flex items-center gap-2">
        <span
          style={{
            fontFamily: F,
            fontSize: 11.5,
            color: T.inkMuted,
            whiteSpace: "nowrap",
            minWidth: 100,
          }}
        >
          Display order
        </span>
        <input
          type="number"
          min={0}
          max={9999}
          step={1}
          value={order}
          placeholder="—"
          onChange={(e) => setOrder(e.target.value)}
          onBlur={() => save({ order })}
          style={{
            width: 72,
            padding: "5px 8px",
            borderRadius: 7,
            border: `1px solid ${T.border}`,
            fontFamily: F,
            fontSize: 12,
            color: T.ink,
            outline: "none",
            background: T.surface,
            boxSizing: "border-box",
          }}
        />
        <span style={{ fontFamily: F, fontSize: 11, color: T.inkDim }}>
          optional · blank = no override
        </span>
      </div>

      {/* Custom label */}
      <div className="flex flex-col gap-1">
        <span
          style={{
            fontFamily: F,
            fontSize: 11.5,
            color: T.inkMuted,
          }}
        >
          Custom label
          <span
            style={{
              fontSize: 10.5,
              color: T.inkDim,
              marginLeft: 6,
            }}
          >
            optional · max 120 chars · overrides the default skill name
          </span>
        </span>
        <input
          type="text"
          maxLength={120}
          value={label}
          placeholder={skill.skill_name_en ?? skill.skill_slug}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => save({ label })}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "7px 10px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            fontFamily: F,
            fontSize: 12.5,
            color: T.ink,
            outline: "none",
            background: T.surface,
          }}
        />
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1">
        <span
          style={{
            fontFamily: F,
            fontSize: 11.5,
            color: T.inkMuted,
          }}
        >
          Internal note
          <span
            style={{
              fontSize: 10.5,
              color: T.inkDim,
              marginLeft: 6,
            }}
          >
            not shown to clients · max 500 chars
          </span>
        </span>
        <textarea
          maxLength={500}
          rows={2}
          value={notes}
          placeholder="e.g. Only book for editorial — not events."
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => save({ notes })}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "7px 10px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            fontFamily: F,
            fontSize: 12.5,
            color: T.ink,
            outline: "none",
            background: T.surface,
            resize: "vertical",
            minHeight: 50,
          }}
        />
      </div>
    </div>
  );
}

// ─── SkillOverridesPanel — exported default ───────────────────────────────

export default function SkillOverridesPanel({
  talentProfileId,
  viewMode,
}: {
  talentProfileId: string;
  /** Only render admin controls when viewMode is "admin". */
  viewMode: "admin" | "talent-self";
}) {
  // Only admins see this panel.
  if (viewMode !== "admin") return null;

  return <SkillOverridesPanelInner talentProfileId={talentProfileId} />;
}

// ─── Inner component (separated so the early return above is clean) ──────────

function SkillOverridesPanelInner({
  talentProfileId,
}: {
  talentProfileId: string;
}) {
  const [skills, setSkills] = useState<ResolvedSkill[] | null>(null);
  const [overrides, setOverrides] = useState<AgencySkillOverride[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch resolved skills + overrides on mount.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [skillsResult, overridesResult] = await Promise.all([
        getResolvedSkills({ talent_profile_id: talentProfileId }),
        getAgencySkillOverrides({ talent_profile_id: talentProfileId }),
      ]);

      if (cancelled) return;

      if (!skillsResult.ok) {
        setLoadError(skillsResult.error);
        setSkills([]);
        return;
      }
      setSkills(skillsResult.skills);

      if (overridesResult.ok) {
        setOverrides(overridesResult.overrides);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [talentProfileId]);

  // Merge: one SkillRow per resolved skill.
  const rows: SkillRow[] = (skills ?? []).map((s) => ({
    skill: s,
    override: overrides.find((o) => o.taxonomy_term_id === s.skill_term_id) ?? null,
  }));

  // Optimistic featured-change: clear featured on all other rows so the UI
  // reflects "one featured at a time" before the server responds.
  function handleFeaturedChange(featuringTermId: string, isFeatured: boolean) {
    if (!isFeatured) return;
    setOverrides((prev) =>
      prev.map((o) =>
        o.taxonomy_term_id === featuringTermId
          ? o
          : { ...o, is_featured_for_agency: false },
      ),
    );
  }

  // ── Loading state ────────────────────────────────────────────────────
  if (skills === null) {
    return (
      <div
        style={{
          padding: "16px 0 8px",
          fontFamily: F,
          fontSize: 12,
          color: T.inkMuted,
        }}
      >
        Loading skill overrides…
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div
        style={{
          padding: "12px 0",
          fontFamily: F,
          fontSize: 12,
          color: "#C82828",
        }}
      >
        Couldn&apos;t load skills: {loadError}
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: "14px 16px",
          borderRadius: 10,
          background: T.surfaceAlt,
          border: `1px solid ${T.border}`,
          fontFamily: F,
          fontSize: 12.5,
          color: T.inkMuted,
        }}
      >
        This talent has no skills yet — add some via the skill panel above.
      </div>
    );
  }

  // ── Full panel ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      {/* Summary line */}
      <div
        style={{
          fontFamily: F,
          fontSize: 11,
          color: T.inkMuted,
          marginBottom: 2,
        }}
      >
        {rows.length} skill{rows.length !== 1 ? "s" : ""} ·{" "}
        {overrides.length} with custom settings
      </div>

      {rows.map((row) => (
        <SkillOverrideRow
          key={row.skill.skill_term_id}
          row={row}
          allRows={rows}
          talentProfileId={talentProfileId}
          onFeaturedChange={handleFeaturedChange}
        />
      ))}
    </div>
  );
}
