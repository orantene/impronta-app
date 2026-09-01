"use client";

/**
 * MultiSelectionStylePanel — INS-2 (Builder Ecosystem 2026 · Wave 2).
 * FIELD-KIT MIGRATION — Inspector Reset P4 (2026-08-16).
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
 *
 * P4 audit finding: this panel was still on raw `<input type="color">` /
 * `<input type="number">` with a hand-rolled label row (`ROW_LABEL`) and the
 * OLD `kit/tokens.ts` `CHROME` palette — the exact "20 control patterns" shape
 * the field kit exists to replace, plus its own bespoke "Mixed" pill instead of
 * the shared `FieldRow` accessory slot. Corner radius specifically was a raw
 * `px` number with no preset chips and no honest resolved value (D9 item 1).
 * This pass moves every row onto `FieldRow`, and moves corner radius onto
 * `PresetNumberRow` + `RADIUS_PRESETS` — the same table `builder-node-content.tsx`
 * (P3) already uses for other px-shaped BuilderNodeStyle fields — with "Mixed"
 * modeled as the kit's own `unset` state plus a `Mixed` placeholder, so a
 * disagreeing selection reads exactly like an empty field, not a lit lie.
 * Text/background color and opacity stay on native inputs restyled onto
 * `FIELD_KIT` tokens: the field kit ships no color-picker primitive of its own
 * (the closest, `ColorPickerPopover`, needs a shared anchor/open-state seam
 * `inspector-dock.tsx` doesn't hand this panel), and opacity has no preset
 * scale in `preset-values.ts` to hang a `PresetNumberRow` off of. Both are
 * documented as deliberately left in the P4 PR census rather than silently
 * left inconsistent.
 */

import { useMemo, useState } from "react";

import {
  MIXED,
  resolveMultiSelectionStyle,
  type MultiSelectionBucket,
  type MultiSelectionStyleNode,
  type ResolvedMultiSelectionField,
} from "@/lib/site-admin/builder-node/multi-selection-style";
import type { LengthUnit } from "../kit/number-unit";
import { ColorSwatchButton } from "./color-swatch-button";
import { LockBadge } from "./kit";
import { useInspectorT } from "./kit/use-inspector-t";
import {
  FIELD_KIT,
  FieldRow,
  PresetNumberRow,
  RADIUS_PRESETS,
  UNSET_FIELD_VALUE,
  matchPreset,
  presetById,
  type FieldValue,
} from "./field-kit";

/** The scalar style fields the multi-select panel exposes — the props every
 *  freeform node has in common, matching the floating-toolbar BulkStylePanel so
 *  bulk + single edits stay consistent. */
const SHARED_FIELDS = [
  { field: "textColor", label: "Text color", kind: "color" as const },
  { field: "backgroundColor", label: "Background", kind: "color" as const },
  { field: "borderRadius", label: "Corner radius", kind: "radius" as const },
  { field: "opacity", label: "Opacity", kind: "opacity" as const },
];

const FIELD_KEYS = SHARED_FIELDS.map((f) => f.field);

const RADIUS_UNITS: readonly LengthUnit[] = ["px", "rem"] as const;

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
  const { t } = useInspectorT();
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
          style={{ color: FIELD_KIT.muted }}
        >
          {t("Editing {count} blocks").replace("{count}", String(nodes.length))}
        </span>
      </div>
      <p className="text-[11.5px] leading-snug" style={{ color: FIELD_KIT.muted }}>
        {t(
          'Shared styles apply to every selected block. "Mixed" means the blocks currently differ. Set a value to make them match.',
        )}
      </p>
      <div className="flex flex-col" style={{ gap: FIELD_KIT.gap.row }}>
        {SHARED_FIELDS.map((f) =>
          f.kind === "radius" ? (
            <MultiSelectionRadiusRow
              key={f.field}
              label={f.label}
              resolved={resolved[f.field]!}
              disabled={disabled}
              onEmit={emit}
            />
          ) : (
            <MultiSelectionStyleRow
              key={f.field}
              label={f.label}
              field={f.field}
              kind={f.kind}
              resolved={resolved[f.field]!}
              disabled={disabled}
              onEmit={emit}
            />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Corner radius — the one PX-shaped field with a real preset scale
 * (`RADIUS_PRESETS`, the same table `builder-node-content.tsx` uses). Storage
 * is a raw CSS string on `BuilderNodeStyle.borderRadius` (no token slot, unlike
 * the single-node standalone style panel's `radius`/`radiusFree` pair), so a
 * clicked chip and a typed number both resolve to `preset.css` / `Npx` before
 * they reach the bulk patch.
 */
function MultiSelectionRadiusRow({
  label,
  resolved,
  disabled,
  onEmit,
}: {
  label: string;
  resolved: ResolvedMultiSelectionField;
  disabled: boolean;
  onEmit: (patch: Record<string, unknown>) => void;
}) {
  const mixed = resolved.value === MIXED;
  const locked = resolved.locked;
  const raw = mixed ? undefined : (resolved.value as string | undefined);
  const numeric = parseRadiusLength(raw);
  const matched = numeric ? matchPreset(RADIUS_PRESETS, numeric) : null;

  const value: FieldValue = mixed
    ? UNSET_FIELD_VALUE
    : matched
      ? { kind: "preset", id: matched.id }
      : numeric
        ? { kind: "custom", numeric }
        : UNSET_FIELD_VALUE;

  return (
    <PresetNumberRow
      label={label}
      presets={RADIUS_PRESETS}
      value={value}
      units={RADIUS_UNITS}
      min={0}
      placeholder={mixed ? "Mixed" : "—"}
      hint={mixed ? "These blocks currently have different corner radii." : undefined}
      accessory={locked ? <LockBadge /> : undefined}
      disabled={disabled}
      locked={locked}
      dataControl="multi-selection-border-radius"
      onChange={(next) => {
        if (locked || disabled) return;
        if (next.kind === "preset") {
          const preset = presetById(RADIUS_PRESETS, next.id);
          onEmit({ borderRadius: preset && preset.css ? preset.css : null });
          return;
        }
        if (next.kind === "custom") {
          onEmit({
            borderRadius: `${next.numeric.value}${next.numeric.unit}`,
          });
          return;
        }
        onEmit({ borderRadius: null });
      }}
    />
  );
}

function parseRadiusLength(
  raw: string | undefined,
): { value: number; unit: LengthUnit } | null {
  if (!raw) return null;
  const match = /^(-?\d+(?:\.\d+)?)(px|rem)$/.exec(raw.trim());
  if (!match) return null;
  return { value: Number(match[1]), unit: match[2] as LengthUnit };
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
  kind: "color" | "opacity";
  resolved: ResolvedMultiSelectionField;
  disabled: boolean;
  onEmit: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useInspectorT();
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

  // Clears travel as `null`, NOT `undefined`: the patch is JSON.stringify'd on
  // its way to `patchSelectedBuilderNodesStyle`, and stringify silently DROPS
  // `undefined` keys — the clear arrived as `{}` and no-opped. On the far side
  // applyStylePatchKeys (multi-node-layout.ts) applies null as a key delete.
  const commit = (raw: string) => {
    if (locked || disabled) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      onEmit({ [field]: null });
      return;
    }
    if (kind === "opacity") {
      const n = Number.parseFloat(trimmed);
      // BuilderNodeStyle.opacity is a unitless NUMBER (0–1), not a string.
      onEmit({
        [field]: Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null,
      });
      return;
    }
    onEmit({ [field]: trimmed });
  };

  const inert = disabled || locked;
  const hasValue = !mixed && sharedValue !== "";

  return (
    <FieldRow
      label={label}
      accessory={
        <span className="inline-flex items-center gap-1.5">
          {locked ? <LockBadge /> : null}
          {hasValue ? (
            <button
              type="button"
              disabled={inert}
              onClick={() => {
                setDraft("");
                if (!inert) onEmit({ [field]: null });
              }}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontSize: FIELD_KIT.font.caption,
                fontWeight: FIELD_KIT.weight.label,
                letterSpacing: "0.02em",
                color: FIELD_KIT.muted,
                cursor: inert ? "not-allowed" : "pointer",
              }}
            >
              {t("Clear")}
            </button>
          ) : null}
        </span>
      }
      hint={mixed ? "These blocks currently have different values." : undefined}
      disabled={inert}
      dataControl={`multi-selection-${field}`}
    >
      {kind === "color" ? (
        // builder-2027 1I — ONE colour surface. This was an OS
        // `<input type="color">`, which drops the operator out of the branded
        // editor into the platform's own picker mid-gesture. `ColorSwatchButton`
        // opens the same in-app HSV popover every other colour control uses.
        // `inert` renders a dead swatch rather than a disabled OS input: there is
        // nothing to disable once the control is a button that opens a popover.
        <span style={inert ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
          <ColorSwatchButton
            color={draft || "#000000"}
            ariaLabel={`${label}${mixed ? " (mixed)" : ""} for all selected`}
            dataAttr={["data-multi-selection-color", field]}
            onChange={(next) => {
              setDraft(next);
              commit(next);
            }}
          />
        </span>
      ) : (
        <input
          type="number"
          disabled={inert}
          aria-label={`${label}${mixed ? " (mixed)" : ""} for all selected`}
          value={draft}
          min={0}
          max={1}
          step={0.1}
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
            width: 72,
            height: FIELD_KIT.size.control,
            padding: "0 7px",
            border: `1px solid ${FIELD_KIT.border}`,
            borderRadius: FIELD_KIT.radius.chip,
            background: FIELD_KIT.surface,
            color: FIELD_KIT.ink,
            fontSize: FIELD_KIT.font.value,
            fontWeight: FIELD_KIT.weight.label,
          }}
        />
      )}
    </FieldRow>
  );
}

/** Coerce a resolved shared value to the input's string form. */
function sharedStringValue(
  value: ResolvedMultiSelectionField["value"],
  kind: "color" | "opacity",
): string {
  if (value === undefined || value === null || value === MIXED) return "";
  if (kind === "opacity") {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : "";
  }
  return String(value);
}
