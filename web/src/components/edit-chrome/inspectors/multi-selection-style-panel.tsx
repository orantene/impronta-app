"use client";

/**
 * MultiSelectionStylePanel — INS-2 (Builder Ecosystem 2026 · Wave 2).
 *
 * The Mixed-aware Style inspector shown when the operator has selected MORE THAN
 * ONE freeform node. For each shared scalar style field it shows the common
 * value, or a "Mixed" placeholder when the nodes disagree (resolved by the pure
 * `resolveMultiSelectionStyle` lib). Editing a field fans the change out to
 * EVERY selected node through the existing multi-node patch chokepoint
 * (`patchSelectedBuilderNodesStyle` → `mergeStylePatchIntoTree`), which honors
 * each node's INS-1 per-prop locks. There is NO parallel mutation system.
 *
 * Shared (not a fork): mounted by the ONE shared `inspector-dock.tsx`, so all
 * four surfaces (Builder Lab, Admin storefront, Talent Max profile, Talent Max
 * site) get the same Mixed-state bulk styling on the same inspector. The richer
 * counterpart to the floating-toolbar `BulkStylePanel` fallback (which has no
 * prefill); this dock surface PREFILLS the shared value and badges Mixed.
 *
 * Extracted into its own kit-adjacent component (NOT folded into the 9980-line
 * style-panel.tsx god-file) so the multi-select path stays small and reviewable
 * and the single-node panel is byte-untouched.
 */

import { useMemo, useState, type CSSProperties } from "react";

import {
  MIXED,
  resolveMultiSelectionStyle,
  type MultiSelectionBucket,
  type MultiSelectionStyleNode,
  type ResolvedMultiSelectionField,
} from "@/lib/site-admin/builder-node/multi-selection-style";
import { CHROME } from "../kit/tokens";
import { LockBadge } from "./kit";

/** The scalar style fields the multi-select panel exposes — the props every
 *  freeform node has in common, matching the floating-toolbar BulkStylePanel so
 *  bulk + single edits stay consistent. */
const SHARED_FIELDS = [
  { field: "textColor", label: "Text color", kind: "color" as const },
  { field: "backgroundColor", label: "Background", kind: "color" as const },
  { field: "borderRadius", label: "Corner radius", kind: "px" as const },
  { field: "opacity", label: "Opacity", kind: "opacity" as const },
];

const FIELD_KEYS = SHARED_FIELDS.map((f) => f.field);

const ROW_LABEL: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  fontSize: 12,
  fontWeight: 600,
  color: CHROME.text2,
};

export interface MultiSelectionStylePanelProps {
  /** The selected nodes (≥2). Section nodes contribute no style and are tolerated. */
  nodes: ReadonlyArray<MultiSelectionStyleNode>;
  /** Active responsive bucket — base (`null`) or a `"tablet"`/`"mobile"` override. */
  bucket?: MultiSelectionBucket;
  /** True while a save is in flight — disables the controls. */
  disabled?: boolean;
  /**
   * Apply a style patch to every selected node. The patch JSON + bucket are
   * forwarded to `patchSelectedBuilderNodesStyle` (the dock wires this), which
   * routes through the single atomic patch/undo op and the per-node lock guard.
   */
  onBulkStylePatch: (stylePatchJson: string, bucket: MultiSelectionBucket) => void;
}

export function MultiSelectionStylePanel({
  nodes,
  bucket = null,
  disabled = false,
  onBulkStylePatch,
}: MultiSelectionStylePanelProps) {
  const resolved = useMemo(
    () => resolveMultiSelectionStyle(nodes, FIELD_KEYS, bucket),
    [nodes, bucket],
  );
  const emit = (patch: Record<string, unknown>) =>
    onBulkStylePatch(JSON.stringify(patch), bucket);

  return (
    <div data-multi-selection-style-panel="" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: CHROME.muted }}
        >
          Editing {nodes.length} blocks
        </span>
      </div>
      <p className="text-[11.5px] leading-snug" style={{ color: CHROME.muted2 }}>
        Shared styles apply to every selected block. &ldquo;Mixed&rdquo; means the
        blocks currently differ — set a value to make them match.
      </p>
      <div className="flex flex-col gap-2.5">
        {SHARED_FIELDS.map((f) => (
          <MultiSelectionStyleRow
            key={f.field}
            label={f.label}
            field={f.field}
            kind={f.kind}
            resolved={resolved[f.field]!}
            disabled={disabled}
            onEmit={emit}
          />
        ))}
      </div>
    </div>
  );
}

function MixedBadge() {
  return (
    <span
      data-mixed-badge=""
      title="These blocks have different values for this property."
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 6,
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: CHROME.muted,
        background: CHROME.paper,
        border: `1px solid ${CHROME.lineMid}`,
        whiteSpace: "nowrap",
      }}
    >
      Mixed
    </span>
  );
}

function MultiSelectionStyleRow({
  label,
  field,
  kind,
  resolved,
  disabled,
  onEmit,
}: {
  label: string;
  field: string;
  kind: "color" | "px" | "opacity";
  resolved: ResolvedMultiSelectionField;
  disabled: boolean;
  onEmit: (patch: Record<string, unknown>) => void;
}) {
  const mixed = resolved.value === MIXED;
  const locked = resolved.locked;
  const sharedValue = mixed ? "" : sharedStringValue(resolved.value, kind);
  // Local input mirror so typing feels live; seeded from the shared value and
  // re-seeded whenever the resolved value changes (selection / bucket switch).
  const [draft, setDraft] = useState<string>(sharedValue);
  const [seed, setSeed] = useState<string>(`${mixed}:${sharedValue}`);
  const currentSeed = `${mixed}:${sharedValue}`;
  if (seed !== currentSeed) {
    setSeed(currentSeed);
    setDraft(sharedValue);
  }

  const commit = (raw: string) => {
    if (locked || disabled) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      onEmit({ [field]: undefined });
      return;
    }
    if (kind === "px") {
      const n = Number.parseFloat(trimmed);
      onEmit({ [field]: Number.isFinite(n) ? `${Math.max(0, n)}px` : undefined });
      return;
    }
    if (kind === "opacity") {
      const n = Number.parseFloat(trimmed);
      // BuilderNodeStyle.opacity is a unitless NUMBER (0–1), not a string.
      onEmit({
        [field]: Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined,
      });
      return;
    }
    onEmit({ [field]: trimmed });
  };

  return (
    <label style={ROW_LABEL}>
      <span
        className="flex min-w-0 items-center gap-1.5"
        style={{ flex: "1 1 auto" }}
      >
        <span className="truncate">{label}</span>
        {mixed && !locked ? <MixedBadge /> : null}
        {locked ? <LockBadge /> : null}
      </span>
      <span className="inline-flex items-center gap-1.5" style={{ flex: "0 0 auto" }}>
        {kind === "color" ? (
          <input
            type="color"
            disabled={disabled || locked}
            aria-label={`${label}${mixed ? " (mixed)" : ""} for all selected`}
            value={draft || "#000000"}
            onChange={(e) => {
              setDraft(e.target.value);
              commit(e.target.value);
            }}
            style={{
              width: 30,
              height: 24,
              padding: 0,
              border: `1px solid ${CHROME.lineMid}`,
              borderRadius: 6,
              background: mixed ? CHROME.paper : "transparent",
              cursor: disabled || locked ? "not-allowed" : "pointer",
              opacity: disabled || locked ? 0.55 : 1,
            }}
          />
        ) : (
          <input
            type="number"
            disabled={disabled || locked}
            aria-label={`${label}${mixed ? " (mixed)" : ""} for all selected`}
            value={draft}
            min={0}
            max={kind === "opacity" ? 1 : undefined}
            step={kind === "opacity" ? 0.1 : 1}
            placeholder={mixed ? "Mixed" : "—"}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit((e.target as HTMLInputElement).value);
              }
            }}
            style={{
              width: 64,
              height: 24,
              padding: "0 7px",
              border: `1px solid ${CHROME.lineMid}`,
              borderRadius: 6,
              background: CHROME.surface,
              color: CHROME.ink,
              fontSize: 12,
              fontWeight: 600,
              opacity: disabled || locked ? 0.55 : 1,
            }}
          />
        )}
        <button
          type="button"
          disabled={disabled || locked}
          aria-label={`Clear ${label} on all selected`}
          title={`Clear ${label}`}
          onClick={() => {
            setDraft("");
            if (!locked && !disabled) onEmit({ [field]: undefined });
          }}
          style={{
            width: 20,
            height: 20,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: 5,
            background: "transparent",
            color: CHROME.muted,
            cursor: disabled || locked ? "not-allowed" : "pointer",
            fontSize: 14,
            lineHeight: 1,
            opacity: disabled || locked ? 0.45 : 1,
          }}
        >
          ×
        </button>
      </span>
    </label>
  );
}

/** Coerce a resolved shared value to the input's string form. */
function sharedStringValue(
  value: ResolvedMultiSelectionField["value"],
  kind: "color" | "px" | "opacity",
): string {
  if (value === undefined || value === null || value === MIXED) return "";
  if (kind === "px") {
    // Strip the unit for the numeric input ("12px" → "12").
    const n = Number.parseFloat(String(value));
    return Number.isFinite(n) ? String(n) : "";
  }
  if (kind === "opacity") {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : "";
  }
  return String(value);
}
