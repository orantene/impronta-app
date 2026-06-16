"use client";

/**
 * ComponentStylesEditor (Builder Lab → Site Defaults → Component Styles) — the
 * UI for the per-component default-style cascade (`default_component_styles`).
 *
 * The load/save pipeline already exists: `SiteDefaultsEditor` loads
 * `componentStyles` (a `ComponentStyleDefaults` map = component-kind →
 * style overrides) and saves it through the same per-surface action set as the
 * theme tokens. This component is a PURE UI surface over that state — it never
 * touches the pipeline/schema. It lets a super-admin pick a component kind and
 * set a small CURATED set of closed-enum default styles (align/tone/size/
 * background/radius/padding/margin) for that kind; every value round-trips
 * cleanly through `normalizeComponentStyleDefaults`.
 *
 * Layer 2 of the cascade: an operator says "all headings center + Ink" once and
 * every heading starts there, while any single heading can still override in the
 * inspector. See `component-style-defaults.ts` for the resolution semantics.
 */

import { useState } from "react";

import { LAB as T, RADII, fieldStyle, SectionLabel } from "./ui";
import {
  STYLEABLE_KINDS,
  controlsForKind,
  setCountForKind,
  setComponentStyleProp,
  readComponentStyleProp,
  UNSET,
} from "./component-style-controls";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";

export function ComponentStylesEditor({
  value,
  onChange,
}: {
  value: ComponentStyleDefaults;
  /** Optimistic update — the parent owns the working copy + Save. */
  onChange: (next: ComponentStyleDefaults) => void;
}) {
  const [activeKind, setActiveKind] = useState<BuilderNodeKind>(STYLEABLE_KINDS[0].kind);
  const controls = controlsForKind(activeKind);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionLabel>Component default styles</SectionLabel>
      <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.5, marginTop: -4 }}>
        Set the base style every new component of a kind starts from. A single
        component can still override any of these in the inspector.
      </div>

      {/* Kind picker — each chip shows how many curated props are set. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {STYLEABLE_KINDS.map(({ kind, label }) => {
          const active = activeKind === kind;
          const count = setCountForKind(value, kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setActiveKind(kind)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: RADII.control,
                border: `1px solid ${active ? T.accent : T.border}`,
                background: active ? T.accentSoft : T.field,
                color: active ? T.accent : T.ink,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
              {count > 0 ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: active ? T.accent : T.inkMuted,
                    background: active ? "transparent" : "rgba(255,255,255,0.07)",
                    borderRadius: RADII.pill,
                    padding: active ? 0 : "1px 6px",
                  }}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Curated controls for the active kind. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
          padding: 14,
          borderRadius: RADII.card,
          border: `1px solid ${T.borderSoft}`,
          background: T.cardSoft,
        }}
      >
        {controls.map((c) => {
          const current = readComponentStyleProp(value, activeKind, c.prop);
          return (
            <label key={c.prop as string} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, color: T.inkMuted }}>{c.label}</span>
              <select
                value={current}
                onChange={(e) =>
                  onChange(setComponentStyleProp(value, activeKind, c.prop, e.target.value))
                }
                style={{ ...fieldStyle, padding: "6px 8px", borderRadius: RADII.icon }}
              >
                <option value={UNSET}>— (theme default)</option>
                {c.options.map((o) => (
                  <option key={o} value={o}>
                    {c.optionLabels?.[o] ?? o}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
