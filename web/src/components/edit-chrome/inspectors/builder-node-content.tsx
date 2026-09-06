"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { RichEditor } from "@/components/edit-chrome/rich-editor";
import {
  BUILDER_ICON_REGISTRY,
  BUILDER_NODE_COMPOSITION_PRESETS,
  BUILDER_NODE_REGISTRY,
  gateNestedInsertKinds,
  type BuilderIconDefinition,
  type BuilderIconName,
  type BuilderNode,
  type BuilderNodeCompositionPresetId,
  type BuilderNodeKind,
} from "@/lib/site-admin/builder-node";
import {
  useEditContext,
  type BuilderBlockPreset,
  type BuilderNodePastePreview,
} from "../edit-context";
import { siblingDropGapToMoveIndex } from "@/lib/site-admin/builder-node/sibling-drop-gap";
import {
  overlayHasProp,
  setOverlayProp,
} from "@/lib/site-admin/builder-node/i18n-overlay";
import { stripLockedKeysFromPatch } from "@/lib/site-admin/builder-node/prop-lock";
import { createBuilderNode } from "@/lib/site-admin/builder-node/create";
import {
  applyNativeVariant,
  type AddGalleryNativeVariant,
} from "@/lib/site-admin/add-gallery";
import { ElementLibraryInsertPicker } from "../element-library-insert-picker";
import { Card, CardBody, CardHead, Field, FieldLabel, Helper, Segmented, Stepper, TextInput, Toggle } from "../kit";
import { CHROME } from "../kit/tokens";
import {
  MobileNavThumb_Dropdown,
  MobileNavThumb_DrawerRight,
  MobileNavThumb_FullScreen,
  MobileNavThumb_SheetBottom,
} from "./site-header/thumbnails";
import type { LengthUnit } from "../kit/number-unit";
import { IconPicker } from "./field-kit/icon-picker";
import {
  addGrandchild,
  patchFeatured,
  patchGrandchild,
  removeGrandchild,
} from "./nav-link-tree-edits";
import { ColorSwatchButton } from "./color-swatch-button";
import { DraggableList } from "./kit/draggable-list";
import { useInspectorT } from "./kit/use-inspector-t";
import { KIT } from "./kit/tokens";
import { QrCodeLinkPicker } from "./qr-code-link-picker";
import { InspectorLabelWithInfo, MediaField, toMediaValue } from "./kit";
import { AiGenerateImageButton } from "./ai-generate-image-button";
import { BackgroundMediaCard } from "./background-media-card";
import { InlineNameInput } from "./kit/inline-name-input";
import { MyBlocksPanel } from "./my-blocks-panel";
import { ComponentLibraryPanel } from "./component-library-panel";
import { GenericContent } from "./generic-content";
import { builder2027SecondaryLabel } from "../builder-2027-secondary-label";
import {
  Builder2027ContentInspector,
  isBuilder2027InspectorKind,
  type Builder2027Node,
} from "./builder-2027-node-content";
import { LocaleFieldTabs } from "./locale-field-tabs";
import { useActiveContentLocale } from "../active-content-locale-bridge";
import {
  removeItemAt,
  resolveClearableMediaSrc,
} from "./builder-node-content-utils";
import {
  GlyphTiles,
  PresetNumberRow,
  ICON_SIZE_PRESETS,
  SPACER_PRESETS,
  type FieldValue,
  type GlyphTileOption,
} from "./field-kit";
import { VariantIntentCards } from "./variant-intent-cards";
import { CarouselSettingsPanel } from "./carousel";
import { FormNodeContentInspector } from "./form-node-content";
import { BuilderNodeNestedTextFields } from "./nested-text-fields";
import { ResponsiveImageSourceField } from "./responsive-image-source-field";

interface BuilderNodeContentInspectorProps {
  node: Exclude<BuilderNode, { kind: "section" }>;
  tenantId: string;
}

/** Flat inspector shell — no nested cards (canvas-first mockup). */

/**
 * Mobile hamburger presentation options for the `nav` node.
 *
 * Same variants the curated header offers, with the curated header's own
 * thumbnails and helper copy — a freeform nav and a curated header should not
 * teach an operator two different vocabularies for the same decision.
 */
/**
 * Surfaces, in the operator's words. The schema calls them bar/menu; an
 * operator thinks "the row across the top" and "the phone menu".
 */
const NAV_LINK_PLACEMENT_OPTIONS = [
  { value: "both", label: "Both" },
  { value: "bar", label: "Top bar only" },
  { value: "menu", label: "Phone menu only" },
] as const;

const NAV_MOBILE_MENU_OPTIONS: Array<{
  value: string;
  label: string;
  helper: string;
  Thumb: React.ComponentType;
}> = [
  {
    value: "dropdown",
    label: "Dropdown",
    helper: "Opens under the toggle. Simplest, no overlay.",
    Thumb: MobileNavThumb_Dropdown,
  },
  {
    value: "drawer-right",
    label: "Drawer right",
    helper: "Slides in from the right. Classic mobile pattern.",
    Thumb: MobileNavThumb_DrawerRight,
  },
  {
    value: "sheet-bottom",
    label: "Sheet bottom",
    helper: "Slides up from below. Modern app feel.",
    Thumb: MobileNavThumb_SheetBottom,
  },
  {
    value: "full-screen-fade",
    label: "Full screen",
    helper: "Covers the page. Editorial, immersive.",
    Thumb: MobileNavThumb_FullScreen,
  },
];

function BuilderNodeFlatPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function BuilderNodeSection({
  title,
  info,
  children,
}: {
  title: string;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>
        {info ? <InspectorLabelWithInfo label={title} info={info} /> : title}
      </h3>
      {children}
    </section>
  );
}

// ═══ Inspector Reset P3 — field-kit helpers for this panel ═════════════════
//
// D8 audit note: most of this file's per-kind controls are structural content
// config (tree operations, item lists, data bindings) with no Style-tab
// equivalent, so they stay put. The controls migrated below are the D9-shaped
// violations the audit actually found in Content: preset scales that never
// showed their resolved value (icon size, spacer size, social icon size) and
// visual choices rendered as plain words instead of a glyph (the icon picker
// itself, divider tone, social icon shape). See the PR body for the full
// census.

/**
 * Parse a "Free" CSS-length string (e.g. "26px", "1.5rem") into the
 * `{value, unit}` shape `NumberUnit` / `PresetNumberRow` speak. Mirrors the
 * convention `builderNodeStyleSchema` already uses for fields like
 * `marginTopFree` — a plain CSS string, not a structured value — so
 * `sizeFree` round-trips the same way every other "Free" escape does.
 */
function parseFreeLength(
  raw: string | undefined,
): { value: number; unit: LengthUnit } | null {
  if (!raw) return null;
  const match = /^(-?\d+(?:\.\d+)?)(px|rem|em|%|vw|vh)$/.exec(raw.trim());
  if (!match) return null;
  return { value: Number(match[1]), unit: match[2] as LengthUnit };
}

function formatFreeLength(
  numeric: { value: number; unit: LengthUnit } | null,
): string | undefined {
  return numeric ? `${numeric.value}${numeric.unit}` : undefined;
}

/**
 * The icon glyph itself — the same path/circle/polygon data
 * `render.tsx` draws on the live canvas, at tile scale. Owner: "i need you to
 * add icons... example for things" — a control that PICKS an icon should show
 * the icon, not its name in a `<select>`.
 */
function BuilderIconTileGlyph({
  icon,
  color,
}: {
  icon: BuilderIconDefinition;
  color: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {icon.paths.map((path) => (
        <path key={path} d={path} />
      ))}
      {icon.circles?.map((circle) => (
        <circle
          key={`${circle.cx}-${circle.cy}-${circle.r}`}
          cx={circle.cx}
          cy={circle.cy}
          r={circle.r}
        />
      ))}
      {icon.polygons?.map((points) => (
        <polygon key={points} points={points} />
      ))}
    </svg>
  );
}

/** Divider tone has a look — a fainter rule — so D9 rule 3 puts it on a
 * glyph, not just a word, even though it isn't a numeric preset. */
function DividerToneGlyph({ muted, color }: { muted: boolean; color: string }) {
  return (
    <svg viewBox="0 0 26 26" width={26} height={26} aria-hidden focusable="false">
      <line
        x1={4}
        y1={13}
        x2={22}
        y2={13}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={muted ? 0.35 : 1}
      />
    </svg>
  );
}

/** Social-link icon shape has a look — bare / circle / square chip — so it is
 * glyphed rather than named (D9 rule 3). */
function SocialShapeGlyph({
  shape,
  color,
}: {
  shape: "bare" | "circle" | "square";
  color: string;
}) {
  if (shape === "bare") {
    return (
      <svg viewBox="0 0 26 26" width={26} height={26} aria-hidden focusable="false">
        <circle cx="13" cy="13" r="3" fill={color} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 26 26" width={26} height={26} aria-hidden focusable="false">
      {shape === "circle" ? (
        <circle cx="13" cy="13" r="8" fill="none" stroke={color} strokeWidth={1.8} />
      ) : (
        <rect x={5} y={5} width={16} height={16} rx={4} fill="none" stroke={color} strokeWidth={1.8} />
      )}
      <circle cx="13" cy="13" r="2.5" fill={color} />
    </svg>
  );
}

/**
 * Social-link icon SIZE has no schema-level "Free" companion yet — the chip
 * diameter lives inside `render.tsx`'s inline CSS-string block (28/36/44px
 * per `data-bn-size`), not a `const NAME = {...} as const` map, so it cannot
 * be mirrored by the mechanical `preset-values.ts` parity guard the way
 * ICON_SIZE / SPACER_BY_SIZE are. Captions below are hand-verified against
 * those literal CSS lines; see the PR body for the explicit "custom number"
 * gap this leaves (deferred, not silently dropped).
 */
function SocialSizeGlyph({ diameter, color }: { diameter: number; color: string }) {
  return (
    <svg viewBox="0 0 26 26" width={26} height={26} aria-hidden focusable="false">
      <circle cx="13" cy="13" r={diameter / 2} fill="none" stroke={color} strokeWidth={1.8} />
    </svg>
  );
}

const SOCIAL_ICON_SIZE_OPTIONS: ReadonlyArray<GlyphTileOption> = [
  {
    id: "sm",
    label: "Small",
    valueCaption: "28",
    glyph: (ink) => <SocialSizeGlyph diameter={11} color={ink} />,
  },
  {
    id: "md",
    label: "Medium",
    valueCaption: "36",
    glyph: (ink) => <SocialSizeGlyph diameter={15} color={ink} />,
  },
  {
    id: "lg",
    label: "Large",
    valueCaption: "44",
    glyph: (ink) => <SocialSizeGlyph diameter={19} color={ink} />,
  },
];

const SOCIAL_ICON_SHAPE_OPTIONS: ReadonlyArray<GlyphTileOption> = [
  { id: "bare", label: "Bare", glyph: (ink) => <SocialShapeGlyph shape="bare" color={ink} /> },
  { id: "circle", label: "Circle", glyph: (ink) => <SocialShapeGlyph shape="circle" color={ink} /> },
  { id: "square", label: "Square", glyph: (ink) => <SocialShapeGlyph shape="square" color={ink} /> },
];

const DIVIDER_TONE_OPTIONS: ReadonlyArray<GlyphTileOption> = [
  { id: "default", label: "Default", glyph: (ink) => <DividerToneGlyph muted={false} color={ink} /> },
  { id: "muted", label: "Muted", glyph: (ink) => <DividerToneGlyph muted color={ink} /> },
];

/**
 * ONE seam for nested-text editing. Every kind — including `form`, which
 * delegates to its own inspector below — renders through this function, so
 * appending the generic editor here gives every component a locale editor for
 * its nested text without touching a single kind branch. Building it per kind
 * would mean re-solving it for the next component that grows nested copy, and
 * the gap would silently reopen each time.
 */
export function BuilderNodeContentInspector(
  props: BuilderNodeContentInspectorProps,
) {
  return (
    <>
      <BuilderNodeContentInspectorBody {...props} />
      <BuilderNodeNestedTextFields node={props.node} />
    </>
  );
}

function BuilderNodeContentInspectorBody({
  node,
  tenantId,
}: BuilderNodeContentInspectorProps) {
  // WAVE 4.6 — most of this panel's copy is translated at the inspector kit
  // boundary (wave 4.4), but a handful of strings are COMPOSED here out of a
  // builder-REGISTRY node-kind label ("Container blocks", "Card pattern"…).
  // A composed string can never match a catalog key, so it is built from a
  // `{label}` template and the label is translated on its own.
  const { t } = useInspectorT();
  const {
    copiedBuilderNodeKind,
    builderBlockPresets,
    copyBuilderNode,
    duplicateBuilderNode,
    getCopiedBuilderNodePastePreview,
    insertBuilderNode,
    insertBuilderNodeCompositionPreset,
    moveBuilderNodeToParentIndex,
    moveBuilderNodeWithinParent,
    pasteCopiedBuilderNode,
    pasteBuilderBlockPreset,
    patchBuilderNodeProps,
    removeBuilderNode,
    removeBuilderBlockPreset,
    reportMutationError,
    saveCopiedBuilderNodeAsPreset,
    selectBuilderNode,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
    navLinkFocusRequest,
    pinnedNavSubmenu,
    setPinnedNavSubmenu,
    // The canvas viewport being edited. Per-device image sources write to the
    // SAME device the style controls do, so the image panel reads it too.
    device,
  } = useEditContext();

  /**
   * The link the operator clicked on the canvas, if it belongs to the nav being
   * shown. Scoped to this node so a stale request from another nav (two navs on
   * one page) cannot highlight an unrelated row here.
   */
  const navLinkFocus =
    navLinkFocusRequest && navLinkFocusRequest.nodeId === node.id
      ? navLinkFocusRequest
      : null;

  async function commitPatch(patch: Record<string, unknown>) {
    // Builder Studio (WS-C) — honor admin per-prop locks in the UI. The server
    // re-strips in `patchBuilderNodeProps` (the trusted chokepoint); this mirror
    // gives instant feedback and a clear "locked by admin" message instead of a
    // silent no-op. Nested locks (`style.x`) restore the leaf and let the rest
    // of the patch through; a fully-locked top-level key drops the whole patch.
    const guarded = stripLockedKeysFromPatch(
      patch,
      node.props as Record<string, unknown>,
      node.lockedProps,
    );
    if (Object.keys(guarded).length === 0 && Object.keys(patch).length > 0) {
      reportMutationError("That field is locked by the platform admin and can’t be changed.");
      return;
    }
    const result = await patchBuilderNodeProps(node.id, guarded);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  const commitTextInput =
    (key: string, currentValue: string, allowEmpty = false) =>
    async (nextValue: string) => {
      const next = nextValue.trim();
      if (!allowEmpty && next.length === 0) return;
      const normalized = allowEmpty ? next || undefined : next;
      if (normalized === currentValue || (normalized ?? "") === currentValue) return;
      await commitPatch({ [key]: normalized });
    };

  // QA 2026-05-13 — `commit` used to be `() => {}` at every call site,
  // relying on the subsequent `event.currentTarget.blur()` to trigger
  // the field's `onBlur` save handler. That works on desktop browsers
  // but is fragile on mobile virtual keyboards where Enter doesn't
  // always dispatch a synchronous blur, and on iOS where the blur can
  // be skipped if focus is being moved programmatically elsewhere.
  // Callers now pass a `commit(value)` that fires the save directly;
  // the blur still fires as a belt-and-suspenders. Idempotency lives
  // in `commitTextInput` (no-op when value === currentValue).
  const handleCommitKey =
    (commit: (value: string) => void) =>
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      commit(event.currentTarget.value);
      event.currentTarget.blur();
    };

  async function commitInsert(kind: BuilderNodeKind, index?: number) {
    const result = await insertBuilderNode(node.id, kind, index);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitInsertCompositionPreset(
    presetId: BuilderNodeCompositionPresetId,
    index?: number,
  ) {
    const result = await insertBuilderNodeCompositionPreset(node.id, presetId, index);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitRemove(nodeId: string) {
    const result = await removeBuilderNode(nodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitDuplicate(nodeId: string) {
    const result = await duplicateBuilderNode(nodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  function commitCopy(nodeId: string) {
    const result = copyBuilderNode(nodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitPaste(targetNodeId: string) {
    const result = await pasteCopiedBuilderNode(targetNodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  // INS-3: commitSavePreset now accepts the name from the inline naming overlay
  // rendered inside NestedBlocksCard (replaces window.prompt).
  const defaultPresetName = copiedBuilderNodeKind
    ? t("{label} pattern").replace(
        "{label}",
        t(BUILDER_NODE_REGISTRY[copiedBuilderNodeKind].label),
      )
    : t("Saved block pattern");

  const commitSavePreset = useCallback(
    (name: string) => {
      const trimmed = name.trim() || defaultPresetName;
      void saveCopiedBuilderNodeAsPreset(trimmed).then((result) => {
        if (!result.ok && result.error) {
          reportMutationError(result.error);
        }
      });
    },
    [defaultPresetName, saveCopiedBuilderNodeAsPreset, reportMutationError],
  );

  async function commitPastePreset(presetId: string, targetNodeId: string) {
    const result = await pasteBuilderBlockPreset(presetId, targetNodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitMove(nodeId: string, direction: "up" | "down") {
    const result = await moveBuilderNodeWithinParent(nodeId, direction);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitMoveToIndex(
    nodeId: string,
    parentNodeId: string,
    targetIndex: number,
  ) {
    const result = await moveBuilderNodeToParentIndex(
      nodeId,
      parentNodeId,
      targetIndex,
    );
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  const nestedChildren = childNodes(node);
  const quickAddKinds = useMemo(
    () =>
      gateNestedInsertKinds(
        allowedChildKinds(node),
        advancedElementLibraryEnabled,
        canInsertRawHtmlElements,
      ),
    [node, advancedElementLibraryEnabled, canInsertRawHtmlElements],
  );
  const groupPastePreview = getCopiedBuilderNodePastePreview(node.id);

  if (node.kind === "heading") {
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Heading">
          <div className={KIT.field}>
            <label className={KIT.label}>Text</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="text"
              tenantId={tenantId}
              fieldKind="rich-single"
              baseValue={node.props.text}
              ariaLabel="Heading text"
              className={KIT.inputLg}
              onCommitBase={(next) => commitTextInput("text", node.props.text)(next)}
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Level</label>
            <Segmented
              fullWidth
              compact
              value={String(node.props.level) as "1" | "2" | "3" | "4"}
              onChange={(next) => {
                void commitPatch({ level: Number.parseInt(next, 10) });
              }}
              options={[
                { value: "1", label: "H1" },
                { value: "2", label: "H2" },
                { value: "3", label: "H3" },
                { value: "4", label: "H4" },
              ]}
            />
          </div>
          <VariantPicker node={node} commitPatch={(p) => void commitPatch(p)} />
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  if (node.kind === "paragraph") {
    return (
      <BuilderNodeFlatPanel>
        <div className={KIT.field}>
          <label className={KIT.label}>Copy</label>
          <BuilderNodeLocalizableTextField
            node={node}
            prop="text"
            tenantId={tenantId}
            fieldKind="rich-multi"
            baseValue={node.props.text}
            ariaLabel="Paragraph copy"
            className={`${KIT.textarea} min-h-[128px] whitespace-pre-wrap break-words`}
            onCommitBase={(next) => commitTextInput("text", node.props.text)(next)}
            patch={commitPatch}
          />
        </div>
        <VariantPicker node={node} commitPatch={(p) => void commitPatch(p)} />
      </BuilderNodeFlatPanel>
    );
  }

  if (node.kind === "section_embed") {
    const embedConfig = (node.props.config ?? {}) as Record<string, unknown>;
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead
            title="Tulala block"
            sub={node.props.sectionTypeKey}
            iconAccent="blue"
          />
          <CardBody>
            <GenericContent
              key={`${node.id}:embed`}
              sectionTypeKey={node.props.sectionTypeKey}
              schemaVersion={1}
              tenantId={tenantId}
              draftProps={embedConfig}
              onChange={(next) => {
                void commitPatch({ config: next });
              }}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (node.kind === "code") {
    if (!canInsertRawHtmlElements) {
      return (
        <BuilderNodeFlatPanel>
          <p className={KIT.hint}>
            Raw HTML blocks can only be edited by a platform owner. The block
            stays live on the page. Ask an owner to change its markup.
          </p>
        </BuilderNodeFlatPanel>
      );
    }
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="HTML">
          <div className={KIT.field}>
            <label className={KIT.label}>Markup</label>
            <textarea
              key={`${node.id}:html`}
              defaultValue={node.props.html}
              className={`${KIT.textarea} min-h-[200px] whitespace-pre break-all font-mono text-[12px]`}
              spellCheck={false}
              aria-label="Raw HTML"
              onBlur={(event) => {
                const next = event.currentTarget.value;
                if (next !== node.props.html) {
                  void commitPatch({ html: next });
                }
              }}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Min height (px)</label>
            <input
              type="number"
              min={40}
              max={5000}
              key={`${node.id}:minHeight:${node.props.minHeight ?? ""}`}
              defaultValue={node.props.minHeight ?? 120}
              className={KIT.input}
              onBlur={(event) => {
                const parsed = Number.parseInt(event.currentTarget.value, 10);
                if (Number.isFinite(parsed)) {
                  void commitPatch({
                    minHeight: Math.min(Math.max(parsed, 40), 5000),
                  });
                }
              }}
            />
          </div>
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  if (node.kind === "button") {
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Button">
          <div className={KIT.field}>
            <label className={KIT.label}>Text</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="label"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={node.props.label}
              ariaLabel="Button text"
              className={KIT.input}
              onCommitBase={(next) => commitTextInput("label", node.props.label)(next)}
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Link</label>
            <input
              key={`${node.id}:href:${node.props.href}`}
              defaultValue={node.props.href}
              className={KIT.input}
              placeholder="/contact or https://..."
              onBlur={(event) => {
                void commitTextInput("href", node.props.href)(event.currentTarget.value);
              }}
              onKeyDown={handleCommitKey((value) => {
                void commitTextInput("href", node.props.href)(value);
              })}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Tone</label>
            <Segmented
              fullWidth
              compact
              value={node.props.tone ?? "primary"}
              onChange={(next) => {
                void commitPatch({ tone: next });
              }}
              options={[
                { value: "primary", label: "Primary" },
                { value: "secondary", label: "Secondary" },
              ]}
            />
          </div>
          <VariantPicker node={node} commitPatch={(p) => void commitPatch(p)} />
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  if (node.kind === "image") {
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Image">
          <MediaField
            tenantId={tenantId}
            value={toMediaValue(node.props.src, node.props.mediaId, node.props.alt)}
            onChange={(next) => {
              // D3: `next === null` is a genuine Clear (the guard here once
              // read `if (!next) return;`, silently swallowing it). `src` is
              // required in imagePropsSchema but allows "" — an empty image
              // node simply doesn't render (see the `if (!src …) return null`
              // guard in render.tsx's "image" case), so this is a real,
              // visible clear rather than a no-op.
              //
              // D1: src and mediaId are written in the SAME patch, always.
              if (!next) {
                void commitPatch({ src: resolveClearableMediaSrc(null), mediaId: undefined });
                return;
              }
              void commitPatch({
                src: next.url,
                mediaId: next.mediaId ?? undefined,
                // Only a library pick carries an alt worth adopting, and only
                // when the node has none of its own.
                ...(next.mediaId
                  ? { alt: node.props.alt ?? next.alt ?? undefined }
                  : {}),
              });
            }}
            emptyLabel="Choose image"
            aspect="4/5"
            layout="row"
          />
          <ResponsiveImageSourceField
            node={node}
            tenantId={tenantId}
            device={device}
            commitPatch={(patch) => void commitPatch(patch)}
          />
          <div className={KIT.field}>
            <label className={KIT.label}>Generate with AI</label>
            <AiGenerateImageButton
              defaultSubject={node.props.alt ?? ""}
              onGenerated={({ url, mediaId, alt }) => {
                void commitPatch({ src: url, mediaId, alt: node.props.alt || alt });
              }}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Alt text</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="alt"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={node.props.alt ?? ""}
              ariaLabel="Alt text"
              className={KIT.input}
              placeholder="Describe the image"
              onCommitBase={(next) =>
                commitTextInput("alt", node.props.alt ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Link</label>
            <input
              key={`${node.id}:href:${node.props.href ?? ""}`}
              defaultValue={node.props.href ?? ""}
              className={KIT.input}
              placeholder="/ or /contact or https://..."
              onBlur={(event) => {
                void commitTextInput("href", node.props.href ?? "", true)(
                  event.currentTarget.value,
                );
              }}
              onKeyDown={handleCommitKey((value) => {
                void commitTextInput("href", node.props.href ?? "", true)(value);
              })}
            />
          </div>
          <VariantPicker node={node} commitPatch={(p) => void commitPatch(p)} />
          <div style={{ padding: "4px 0" }}>
            <Toggle
              on={node.props.priority ?? false}
              onChange={(next) => {
                void commitPatch({ priority: next || undefined });
              }}
              label="Load priority (LCP)"
              helper="Mark this as the page's hero image. Loads eagerly with high fetch priority. Use on at most one above-the-fold image."
            />
          </div>
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  if (node.kind === "icon") {
    const iconSizeCustom = parseFreeLength(node.props.sizeFree);
    const iconSizeValue: FieldValue = iconSizeCustom
      ? { kind: "custom", numeric: iconSizeCustom }
      : { kind: "preset", id: node.props.size ?? "md" };
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Icon" sub="Inline SVG" iconAccent="blue" />
          <CardBody>
            <div className="flex flex-col gap-3">
              {/* A flat tile grid was right for twelve glyphs and unusable at
                  ~95: IconPicker is the searchable control for the full
                  library. GlyphTiles stays the small-set control elsewhere. */}
              <IconPicker
                label="Icon"
                value={node.props.icon}
                allowNone={false}
                searchTerms="icon glyph symbol"
                onChange={(icon) => {
                  if (!icon) return;
                  const label =
                    BUILDER_ICON_REGISTRY.find((item) => item.name === icon)?.label ??
                    "Icon";
                  void commitPatch({
                    icon,
                    label: node.props.decorative ? node.props.label : label,
                  });
                }}
              />
              <PresetNumberRow
                label="Size"
                presets={ICON_SIZE_PRESETS}
                value={iconSizeValue}
                units={["px", "rem"] as const}
                onChange={(next) => {
                  if (next.kind === "preset") {
                    void commitPatch({ size: next.id, sizeFree: undefined });
                  } else if (next.kind === "custom") {
                    void commitPatch({ sizeFree: formatFreeLength(next.numeric) });
                  } else {
                    void commitPatch({ size: "md", sizeFree: undefined });
                  }
                }}
                dataControl="icon-size"
              />
              <Field flush>
                <FieldLabel info="Leave decorative on when the icon only supports nearby text.">Accessible label</FieldLabel>
                <input
                  key={`${node.id}:label:${node.props.label ?? ""}`}
                  defaultValue={node.props.label ?? ""}
                  className={KIT.input}
                  placeholder="Describe the icon"
                  disabled={node.props.decorative ?? false}
                  onBlur={(event) => {
                    void commitTextInput("label", node.props.label ?? "", true)(
                      event.currentTarget.value,
                    );
                  }}
                  onKeyDown={handleCommitKey((value) => {
                    void commitTextInput("label", node.props.label ?? "", true)(value);
                  })}
                />
              </Field>
              <div style={{ padding: "4px 0" }}>
                <Toggle
                  on={node.props.decorative ?? false}
                  onChange={(next) => {
                    void commitPatch({ decorative: next });
                  }}
                  label="Decorative"
                  helper="Decorative icons are hidden from screen readers."
                />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (node.kind === "accordion_item") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Accordion item" sub={`${node.children.length} nested blocks`} iconAccent="blue" />
          <CardBody>
            <Field flush>
              <FieldLabel info="Use Structure to edit the answer blocks nested inside this item.">Question</FieldLabel>
              <BuilderNodeLocalizableTextField
                node={node}
                prop="title"
                tenantId={tenantId}
                fieldKind="input"
                baseValue={node.props.title}
                ariaLabel="Accordion question"
                className={KIT.inputLg}
                onCommitBase={(next) => commitTextInput("title", node.props.title)(next)}
                patch={commitPatch}
              />
            </Field>
          </CardBody>
        </Card>
        <NestedBlocksCard
          title="Answer blocks"
          parentNodeId={node.id}
          helper="Add and manage the content blocks shown when this accordion item opens."
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
        />
      </div>
    );
  }

  if (node.kind === "tab_panel") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Tab panel" sub={`${node.children.length} nested blocks`} iconAccent="blue" />
          <CardBody>
            <Field flush>
              <FieldLabel info="Use Structure to edit the content blocks inside this tab.">Tab label</FieldLabel>
              <BuilderNodeLocalizableTextField
                node={node}
                prop="title"
                tenantId={tenantId}
                fieldKind="input"
                baseValue={node.props.title}
                ariaLabel="Tab label"
                className={KIT.inputLg}
                onCommitBase={(next) => commitTextInput("title", node.props.title)(next)}
                patch={commitPatch}
              />
            </Field>
          </CardBody>
        </Card>
        <NestedBlocksCard
          title="Tab content"
          parentNodeId={node.id}
          helper="Add and manage the blocks rendered inside this selected tab."
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
        />
      </div>
    );
  }

  if (node.kind === "accordion") {
    const defaultOpenIds = new Set(node.props.defaultOpenItemIds ?? []);
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Accordion" sub={`${nestedChildren.length} items`} iconAccent="blue" />
          <CardBody>
            <div className="flex flex-col gap-3">
              <div style={{ padding: "4px 0" }}>
                <Toggle
                  on={node.props.allowMultiple ?? false}
                  onChange={(next) => {
                    void commitPatch({
                      allowMultiple: next,
                      defaultOpenItemIds:
                        next || defaultOpenIds.size <= 1
                          ? Array.from(defaultOpenIds)
                          : Array.from(defaultOpenIds).slice(0, 1),
                    });
                  }}
                  label="Allow multiple items open"
                  helper="When off, setting a default item keeps just one question open at a time."
                />
              </div>
            </div>
          </CardBody>
        </Card>
        <NestedBlocksCard
          title="Accordion items"
          parentNodeId={node.id}
          helper="Select an item to edit its question and nested answer blocks."
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
          canRemove={(child) => nestedChildren.length > 1 && child.kind === "accordion_item"}
          extraActions={(child) =>
            child.kind === "accordion_item" ? (
              <button
                type="button"
                className={defaultOpenIds.has(child.id) ? KIT.primaryButton : KIT.subtleButton}
                onClick={() => {
                  const next = new Set(defaultOpenIds);
                  if (next.has(child.id)) {
                    next.delete(child.id);
                  } else if (node.props.allowMultiple) {
                    next.add(child.id);
                  } else {
                    next.clear();
                    next.add(child.id);
                  }
                  void commitPatch({
                    defaultOpenItemIds: next.size > 0 ? Array.from(next) : undefined,
                  });
                }}
              >
                {defaultOpenIds.has(child.id) ? "Default open" : "Set default"}
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  if (node.kind === "tabs") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Tabs" sub={`${nestedChildren.length} panels`} iconAccent="blue" />
          <CardBody>
            <p className={KIT.hint}>
              Choose which panel opens first, then select a tab to edit its label and nested content.
            </p>
          </CardBody>
        </Card>
        <NestedBlocksCard
          title="Tab panels"
          parentNodeId={node.id}
          helper="Each panel owns its own label and nested blocks."
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
          canRemove={(child) => nestedChildren.length > 1 && child.kind === "tab_panel"}
          extraActions={(child) =>
            child.kind === "tab_panel" ? (
              <button
                type="button"
                className={node.props.defaultTabId === child.id ? KIT.primaryButton : KIT.subtleButton}
                onClick={() => {
                  void commitPatch({
                    defaultTabId: node.props.defaultTabId === child.id ? undefined : child.id,
                  });
                }}
              >
                {node.props.defaultTabId === child.id ? "Default tab" : "Make default"}
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  // ── video ────────────────────────────────────────────────────────────────
  // Pattern: MediaField for src + poster (same as image node), then
  // four boolean toggles for autoplay/muted/loop/controls. Schema:
  // videoPropsSchema in registry.ts.
  if (node.kind === "video") {
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Video">
          <div className={KIT.field}>
            <label className={KIT.label}>Video source</label>
            <MediaField
              tenantId={tenantId}
              value={toMediaValue(node.props.src)}
              onChange={(next) => {
                // D3: `next === null` is a Clear click — the old guard
                // (`if (!next) return;`) silently ate it. `src` is required
                // but no longer constrained to a strict URL shape (see
                // videoPropsSchema in registry.ts), so "" is valid and
                // clears the node visibly instead of doing nothing.
                // D1: src + mediaId in one patch.
                void commitPatch({
                  src: resolveClearableMediaSrc(next?.url ?? null),
                  mediaId: next?.mediaId ?? undefined,
                });
              }}
              emptyLabel="Choose video"
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Poster image</label>
            <MediaField
              tenantId={tenantId}
              value={toMediaValue(node.props.poster)}
              // `poster` is an optional URL with no id slot in
              // videoPropsSchema, so the unit collapses to its url here.
              onChange={(next) => {
                void commitPatch({ poster: next?.url ?? undefined });
              }}
              emptyLabel="Choose poster"
              aspect="16/9"
              layout="row"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Toggle
              on={node.props.controls ?? true}
              onChange={(next) => { void commitPatch({ controls: next }); }}
              label="Show controls"
            />
            <Toggle
              on={node.props.autoplay ?? false}
              onChange={(next) => { void commitPatch({ autoplay: next }); }}
              label="Autoplay"
            />
            <Toggle
              on={node.props.muted ?? false}
              onChange={(next) => { void commitPatch({ muted: next }); }}
              label="Muted"
            />
            <Toggle
              on={node.props.loop ?? false}
              onChange={(next) => { void commitPatch({ loop: next }); }}
              label="Loop"
            />
          </div>
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  // ── embed ─────────────────────────────────────────────────────────────────
  // Pattern: URL input (https-only, validated against allow-listed providers)
  // + provider select + title + allowFullScreen toggle. Schema:
  // embedPropsSchema — provider enum: youtube | vimeo | maps | calendly | url.
  if (node.kind === "embed") {
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Embed">
          <div className={KIT.field}>
            <label className={KIT.label}>Embed URL</label>
            <input
              key={`${node.id}:src:${node.props.src}`}
              defaultValue={node.props.src}
              className={KIT.input}
              type="url"
              placeholder="https://www.youtube.com/embed/..."
              onBlur={(event) => {
                void commitTextInput("src", node.props.src)(event.currentTarget.value);
              }}
              onKeyDown={handleCommitKey((value) => {
                void commitTextInput("src", node.props.src)(value);
              })}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Provider</label>
            <select
              className={KIT.select}
              value={node.props.provider ?? "url"}
              onChange={(event) => {
                void commitPatch({
                  provider: event.currentTarget.value as
                    | "youtube"
                    | "vimeo"
                    | "maps"
                    | "calendly"
                    | "url",
                });
              }}
            >
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="maps">Google Maps</option>
              <option value="calendly">Calendly</option>
              <option value="url">Other URL</option>
            </select>
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Title</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="title"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={node.props.title ?? ""}
              ariaLabel="Embed title"
              className={KIT.input}
              placeholder="e.g. Demo video"
              onCommitBase={(next) =>
                commitTextInput("title", node.props.title ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <Toggle
            on={node.props.allowFullScreen ?? false}
            onChange={(next) => { void commitPatch({ allowFullScreen: next }); }}
            label="Allow full screen"
          />
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  // ── hero_search (WS7 Phase 0 native data block) ───────────────────────────
  // Copy fields, the search bar, and the stat line. "Live talent count" is the
  // whole reason this block is not a plain hero: it reads the tenant's own
  // visible roster, resolved server-side, so the operator sets a label and the
  // number takes care of itself.
  // BUILDER 2027 · P2A — the twelve native kinds are driven by ONE schema-based
  // inspector (see builder-2027-fields.ts for why). Dispatched here rather than
  // inlined so this already-5,000-line file grows by a dozen lines instead of
  // two thousand, and so the field schema stays unit-testable.
  if (isBuilder2027InspectorKind(node.kind)) {
    return (
      <Builder2027ContentInspector
        node={node as Builder2027Node}
        tenantId={tenantId}
        LocalizableTextField={BuilderNodeLocalizableTextField}
      />
    );
  }

  if (node.kind === "hero_search") {
    const hero = node.props;
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Copy">
          <div className={KIT.field}>
            <label className={KIT.label}>Eyebrow</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="eyebrow"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={hero.eyebrow ?? ""}
              ariaLabel="Hero eyebrow"
              className={KIT.input}
              placeholder="e.g. The roster"
              onCommitBase={(next) =>
                commitTextInput("eyebrow", hero.eyebrow ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Headline</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="headline"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={hero.headline ?? ""}
              ariaLabel="Hero headline"
              className={KIT.input}
              placeholder="Find the right talent"
              onCommitBase={(next) =>
                commitTextInput("headline", hero.headline ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Highlighted phrase</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="highlight"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={hero.highlight ?? ""}
              ariaLabel="Hero highlighted phrase"
              className={KIT.input}
              placeholder="e.g. for your next campaign"
              onCommitBase={(next) =>
                commitTextInput("highlight", hero.highlight ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Intro</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="subheadline"
              tenantId={tenantId}
              fieldKind="textarea"
              baseValue={hero.subheadline ?? ""}
              ariaLabel="Hero intro"
              className={KIT.textarea}
              placeholder="Search the roster by role, location or fit."
              onCommitBase={(next) =>
                commitTextInput("subheadline", hero.subheadline ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Layout</label>
            <select
              className={KIT.select}
              value={hero.layout ?? "centered"}
              onChange={(event) => {
                void commitPatch({
                  layout: event.currentTarget.value as
                    | "centered"
                    | "split"
                    | "minimal"
                    | "editorial",
                });
              }}
            >
              <option value="centered">Centered</option>
              <option value="split">Split</option>
              <option value="minimal">Minimal</option>
              <option value="editorial">Editorial</option>
            </select>
          </div>
        </BuilderNodeSection>
        <BuilderNodeSection title="Search bar">
          <Toggle
            on={hero.searchEnabled !== false}
            onChange={(next) => {
              void commitPatch({ searchEnabled: next });
            }}
            label="Show the search bar"
          />
          <div className={KIT.field}>
            <label className={KIT.label}>Placeholder</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="searchPlaceholder"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={hero.searchPlaceholder ?? ""}
              ariaLabel="Search placeholder"
              className={KIT.input}
              placeholder="Search talent by role, location or fit"
              onCommitBase={(next) =>
                commitTextInput(
                  "searchPlaceholder",
                  hero.searchPlaceholder ?? "",
                  true,
                )(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Button label</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="searchSubmitLabel"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={hero.searchSubmitLabel ?? ""}
              ariaLabel="Search button label"
              className={KIT.input}
              placeholder="Search"
              onCommitBase={(next) =>
                commitTextInput(
                  "searchSubmitLabel",
                  hero.searchSubmitLabel ?? "",
                  true,
                )(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Where the search goes</label>
            <input
              key={`${node.id}:searchActionHref:${hero.searchActionHref ?? ""}`}
              defaultValue={hero.searchActionHref ?? ""}
              className={KIT.input}
              placeholder="/directory"
              onBlur={(event) => {
                void commitTextInput(
                  "searchActionHref",
                  hero.searchActionHref ?? "",
                )(event.currentTarget.value);
              }}
              onKeyDown={handleCommitKey((value) => {
                void commitTextInput(
                  "searchActionHref",
                  hero.searchActionHref ?? "",
                )(value);
              })}
            />
          </div>
        </BuilderNodeSection>
        <BuilderNodeSection title="Talent count">
          <div className={KIT.field}>
            <label className={KIT.label}>Source</label>
            <select
              className={KIT.select}
              value={hero.statSource ?? "manual"}
              onChange={(event) => {
                void commitPatch({
                  statSource: event.currentTarget.value as
                    | "manual"
                    | "tenant_talent_count",
                });
              }}
            >
              <option value="tenant_talent_count">
                Live count from your roster
              </option>
              <option value="manual">Numbers I type myself</option>
            </select>
          </div>
          {hero.statSource === "tenant_talent_count" ? (
            <div className={KIT.field}>
              <label className={KIT.label}>Label beside the number</label>
              <BuilderNodeLocalizableTextField
                node={node}
                prop="statCountLabel"
                tenantId={tenantId}
                fieldKind="input"
                baseValue={hero.statCountLabel ?? ""}
                ariaLabel="Talent count label"
                className={KIT.input}
                placeholder="represented talent"
                onCommitBase={(next) =>
                  commitTextInput(
                    "statCountLabel",
                    hero.statCountLabel ?? "",
                    true,
                  )(next)
                }
                patch={commitPatch}
              />
            </div>
          ) : null}
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  // ── menu_board (workspace-owned orderable menu) ───────────────────────────
  if (node.kind === "menu_board") {
    const menu = node.props;
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Copy">
          <div className={KIT.field}>
            <label className={KIT.label}>Title</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="title"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={menu.title ?? ""}
              ariaLabel="Menu title"
              className={KIT.input}
              placeholder="Menu"
              onCommitBase={(next) =>
                commitTextInput("title", menu.title ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Subtitle</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="subtitle"
              tenantId={tenantId}
              fieldKind="textarea"
              baseValue={menu.subtitle ?? ""}
              ariaLabel="Menu subtitle"
              className={KIT.textarea}
              placeholder="Order from our kitchen"
              onCommitBase={(next) =>
                commitTextInput("subtitle", menu.subtitle ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Empty message</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="emptyMessage"
              tenantId={tenantId}
              fieldKind="textarea"
              baseValue={menu.emptyMessage ?? ""}
              ariaLabel="Menu empty message"
              className={KIT.textarea}
              placeholder="No menu items published yet."
              onCommitBase={(next) =>
                commitTextInput("emptyMessage", menu.emptyMessage ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
        </BuilderNodeSection>
        <p className="text-xs text-black/55 px-1">
          Items come from the workspace Menu page (published, workspace-owned). Quantities and the order form render on the live site.
        </p>
      </BuilderNodeFlatPanel>
    );
  }

  // ── session_picker (guest-facing session booking block) ───────────────────
  // Phase 1 panel: a title and the offering this block books. The offering
  // PICKER (a select over the tenant's sessions) is phase 2; for now the
  // offering id is entered directly. The island (owned by Sessions & Classes)
  // fetches availability and sells the seat.
  // ── qr_code (a scannable link, rendered inline) ───────────────────
  // FORK (b): pure inline render. The block stores the link CODE; render
  // composes <origin>/q/<code>. MVP: the code is typed directly; the link
  // PICKER (a select over listLinksForTenant, paused rows shown) is a follow-up.
  if (node.kind === "qr_code") {
    const qr = node.props;
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Link">
          <QrCodeLinkPicker
            linkCode={qr.linkCode ?? ""}
            onPick={(code) => {
              void commitPatch({ linkCode: code });
            }}
          />
        </BuilderNodeSection>
        <BuilderNodeSection title="Copy">
          <div className={KIT.field}>
            <label className={KIT.label}>Caption</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="caption"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={qr.caption ?? ""}
              ariaLabel="Caption"
              className={KIT.input}
              onCommitBase={(next) =>
                commitTextInput("caption", qr.caption ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>
              <input
                type="checkbox"
                checked={qr.showShortLink !== false}
                onChange={(event) => {
                  void commitPatch({ showShortLink: event.currentTarget.checked });
                }}
              />{" "}
              Show the short link
            </label>
          </div>
        </BuilderNodeSection>
        <BuilderNodeSection title="Style">
          <div className={KIT.field}>
            <label className={KIT.label}>Code colour</label>
            <ColorSwatchButton
              color={qr.foreground ?? "#000000"}
              ariaLabel="Pick the code colour"
              dataAttr={["data-builder-qr-color", "foreground"]}
              onChange={(next) => {
                void commitPatch({ foreground: next });
              }}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Corner style</label>
            <select
              className={KIT.input}
              value={qr.cornerStyle ?? "square"}
              onChange={(event) => {
                void commitPatch({
                  cornerStyle: event.currentTarget.value as "square" | "rounded",
                });
              }}
            >
              <option value="square">Square</option>
              <option value="rounded">Rounded</option>
            </select>
          </div>
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  // ── ticket_picker (guest-facing ticket purchase block) ────────────────────
  // Phase 1 panel: a title and the event this block sells. The event PICKER
  // (a select over the tenant's published events) is phase 2; for now the id
  // is entered directly. The island (Events & Ticketing) fetches nights and
  // tiers and sells the ticket, and shows "not configured" while this is empty.
  if (node.kind === "ticket_picker") {
    const tp = node.props;
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Copy">
          <div className={KIT.field}>
            <label className={KIT.label}>Title</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="title"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={tp.title ?? ""}
              ariaLabel="Title"
              className={KIT.input}
              placeholder="Tickets"
              onCommitBase={(next) =>
                commitTextInput("title", tp.title ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
        </BuilderNodeSection>
        <BuilderNodeSection title="Event">
          <div className={KIT.field}>
            <label className={KIT.label}>Event ID</label>
            <input
              type="text"
              className={KIT.input}
              value={tp.eventId ?? ""}
              placeholder="The event this block sells tickets for"
              onChange={(event) => {
                void commitPatch({ eventId: event.currentTarget.value });
              }}
            />
          </div>
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  if (node.kind === "session_picker") {
    const sp = node.props;
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Copy">
          <div className={KIT.field}>
            <label className={KIT.label}>Title</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="title"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={sp.title ?? ""}
              ariaLabel="Title"
              className={KIT.input}
              placeholder="Sessions"
              onCommitBase={(next) =>
                commitTextInput("title", sp.title ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
        </BuilderNodeSection>
        <BuilderNodeSection title="Session">
          <div className={KIT.field}>
            <label className={KIT.label}>Offering ID</label>
            <input
              type="text"
              className={KIT.input}
              value={sp.offeringId ?? ""}
              placeholder="The session offering this block books"
              onChange={(event) => {
                void commitPatch({ offeringId: event.currentTarget.value });
              }}
            />
          </div>
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  // ── reserve_table (guest-facing booking block) ────────────────────────────
  // Phase 1 panel: the fields that change what a guest SEES. The full
  // block-design experience (style tab, CTA design, shortcuts into Settings →
  // Reservations) is phase 2 and deliberately not batched in here.
  if (node.kind === "reserve_table") {
    const reserve = node.props;
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Copy">
          <div className={KIT.field}>
            <label className={KIT.label}>Venue name</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="venueName"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={reserve.venueName ?? ""}
              ariaLabel="Venue name"
              className={KIT.input}
              placeholder="Your venue"
              onCommitBase={(next) =>
                commitTextInput("venueName", reserve.venueName ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Button word</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="ctaVerb"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={reserve.ctaVerb ?? ""}
              ariaLabel="Button word"
              className={KIT.input}
              placeholder="Reserve"
              onCommitBase={(next) =>
                commitTextInput("ctaVerb", reserve.ctaVerb ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Card notice</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="cardNotice"
              tenantId={tenantId}
              fieldKind="textarea"
              baseValue={reserve.cardNotice ?? ""}
              ariaLabel="Card notice"
              className={KIT.textarea}
              placeholder="Shown only when your venue asks for a card"
              onCommitBase={(next) =>
                commitTextInput("cardNotice", reserve.cardNotice ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
        </BuilderNodeSection>
        <BuilderNodeSection title="Party size">
          <div className={KIT.field}>
            <label className={KIT.label}>Smallest party</label>
            <input
              type="number"
              min={1}
              max={99}
              className={KIT.input}
              value={reserve.partyMin ?? 1}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (!Number.isFinite(next)) return;
                void commitPatch({
                  partyMin: Math.min(99, Math.max(1, Math.round(next))),
                });
              }}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Largest party</label>
            <input
              type="number"
              min={1}
              max={99}
              className={KIT.input}
              value={reserve.partyMax ?? 8}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (!Number.isFinite(next)) return;
                void commitPatch({
                  partyMax: Math.min(99, Math.max(1, Math.round(next))),
                });
              }}
            />
          </div>
        </BuilderNodeSection>
        <p className="text-xs text-black/55 px-1">
          These two only shape the stepper. Your venue rules decide what is
          actually bookable, and a booking outside them is refused with a reason.
        </p>
      </BuilderNodeFlatPanel>
    );
  }

  // ── talent_type_grid (WS7 Phase 0 native data block) ──────────────────────
  // Dynamic mode is the default and the point: the cards come from the tenant's
  // own roster taxonomy. Manual mode keeps the authored-card path available.
  if (node.kind === "talent_type_grid") {
    const grid = node.props;
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Copy">
          <div className={KIT.field}>
            <label className={KIT.label}>Eyebrow</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="eyebrow"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={grid.eyebrow ?? ""}
              ariaLabel="Section eyebrow"
              className={KIT.input}
              placeholder="e.g. The roster"
              onCommitBase={(next) =>
                commitTextInput("eyebrow", grid.eyebrow ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Headline</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="headline"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={grid.headline ?? ""}
              ariaLabel="Section headline"
              className={KIT.input}
              placeholder="Talent, by discipline"
              onCommitBase={(next) =>
                commitTextInput("headline", grid.headline ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Intro</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="subheadline"
              tenantId={tenantId}
              fieldKind="textarea"
              baseValue={grid.subheadline ?? ""}
              ariaLabel="Section intro"
              className={KIT.textarea}
              placeholder=""
              onCommitBase={(next) =>
                commitTextInput("subheadline", grid.subheadline ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>See-all link label</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="seeAllLabel"
              tenantId={tenantId}
              fieldKind="input"
              baseValue={grid.seeAllLabel ?? ""}
              ariaLabel="See all label"
              className={KIT.input}
              placeholder="See all"
              onCommitBase={(next) =>
                commitTextInput("seeAllLabel", grid.seeAllLabel ?? "", true)(next)
              }
              patch={commitPatch}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>See-all link goes to</label>
            <input
              key={`${node.id}:seeAllHref:${grid.seeAllHref ?? ""}`}
              defaultValue={grid.seeAllHref ?? ""}
              className={KIT.input}
              placeholder="/directory"
              onBlur={(event) => {
                void commitTextInput("seeAllHref", grid.seeAllHref ?? "")(
                  event.currentTarget.value,
                );
              }}
              onKeyDown={handleCommitKey((value) => {
                void commitTextInput("seeAllHref", grid.seeAllHref ?? "")(value);
              })}
            />
          </div>
        </BuilderNodeSection>
        <BuilderNodeSection title="Cards">
          <div className={KIT.field}>
            <label className={KIT.label}>Where the cards come from</label>
            <select
              className={KIT.select}
              value={grid.mode ?? "manual"}
              onChange={(event) => {
                void commitPatch({
                  mode: event.currentTarget.value as "manual" | "dynamic",
                });
              }}
            >
              <option value="dynamic">My roster&rsquo;s disciplines</option>
              <option value="manual">Cards I write myself</option>
            </select>
          </div>
          {grid.mode === "dynamic" ? (
            <Toggle
              on={grid.parentCategoryMode === true}
              onChange={(next) => {
                void commitPatch({ parentCategoryMode: next });
              }}
              label="Group child types under their parent category"
            />
          ) : null}
          <div className={KIT.field}>
            <label className={KIT.label}>Most cards to show</label>
            <input
              type="number"
              min={1}
              max={18}
              className={KIT.input}
              value={grid.maxItems ?? 7}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (!Number.isFinite(next)) return;
                void commitPatch({
                  maxItems: Math.min(18, Math.max(1, Math.round(next))),
                });
              }}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Columns</label>
            <input
              type="number"
              min={1}
              max={6}
              className={KIT.input}
              value={grid.columns ?? 4}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (!Number.isFinite(next)) return;
                void commitPatch({
                  columns: Math.min(6, Math.max(1, Math.round(next))),
                });
              }}
            />
          </div>
          <Toggle
            on={grid.showCount !== false}
            onChange={(next) => {
              void commitPatch({ showCount: next });
            }}
            label="Show how many talent are in each discipline"
          />
          <Toggle
            on={grid.showImages !== false}
            onChange={(next) => {
              void commitPatch({ showImages: next });
            }}
            label="Show card images"
          />
          <div className={KIT.field}>
            <label className={KIT.label}>Message when there is nothing yet</label>
            <BuilderNodeLocalizableTextField
              node={node}
              prop="emptyStateText"
              tenantId={tenantId}
              fieldKind="textarea"
              baseValue={grid.emptyStateText ?? ""}
              ariaLabel="Empty state text"
              className={KIT.textarea}
              placeholder="Disciplines appear here as soon as talent on your roster is tagged."
              onCommitBase={(next) =>
                commitTextInput(
                  "emptyStateText",
                  grid.emptyStateText ?? "",
                  true,
                )(next)
              }
              patch={commitPatch}
            />
          </div>
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  // ── social_feed ───────────────────────────────────────────────────────────
  // Items editor + the presentation controls that make the feed feel like a
  // paid plugin: layout preset, columns, spacing, aspect, hover, load-more.
  if (node.kind === "social_feed") {
    const feed = node.props;
    const feedItems = feed.items;
    const patchItem = (
      index: number,
      patch: Partial<(typeof feedItems)[number]>,
    ) => {
      const next = feedItems.map((it, i) =>
        i === index ? { ...it, ...patch } : it,
      );
      void commitPatch({ items: next });
    };
    const moveItem = (index: number, dir: -1 | 1) => {
      const j = index + dir;
      if (j < 0 || j >= feedItems.length) return;
      const next = [...feedItems];
      const [it] = next.splice(index, 1);
      next.splice(j, 0, it!);
      void commitPatch({ items: next });
    };
    const select = (
      label: string,
      value: string,
      options: Array<[string, string]>,
      onPick: (v: string) => void,
      info?: ReactNode,
    ) => (
      <Field flush>
        <FieldLabel info={info}>{label}</FieldLabel>
        <select
          className={KIT.select}
          value={value}
          onChange={(e) => onPick(e.currentTarget.value)}
        >
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
    );
    return (
      <BuilderNodeFlatPanel>
        <BuilderNodeSection title="Feed">
          <div className="flex flex-col gap-3">
            {select("Posts come from", feed.source ?? "manual", [
              ["manual", "Posts I add below"],
              ["connected", "My connected account (auto-updates)"],
            ], (v) => void commitPatch({ source: v }), "Pulls your latest posts from the account connected in Settings, Integrations. Until that account is connected, the posts you add below are shown instead.")}
            {select("Layout", feed.layout ?? "grid", [
              ["grid", "Grid"],
              ["masonry", "Masonry"],
              ["slider", "Slider"],
              ["stories", "Reels strip"],
            ], (v) => void commitPatch({ layout: v }))}
            {select("Network", feed.provider ?? "instagram", [
              ["instagram", "Instagram"],
              ["tiktok", "TikTok"],
              ["mixed", "Mixed"],
            ], (v) => void commitPatch({ provider: v }))}
            <Field flush>
              <FieldLabel>Handle (shown above the feed)</FieldLabel>
              <input
                key={`${node.id}:handle:${feed.handle ?? ""}`}
                defaultValue={feed.handle ?? ""}
                className={KIT.input}
                placeholder="e.g. impronta_models"
                onBlur={(e) => {
                  const next = e.currentTarget.value.trim().replace(/^@/, "");
                  if (next === (feed.handle ?? "")) return;
                  void commitPatch({ handle: next || undefined });
                }}
              />
            </Field>
            {select("Columns", String(feed.columns ?? 3), [
              ["2", "2"],
              ["3", "3"],
              ["4", "4"],
              ["5", "5"],
              ["6", "6"],
            ], (v) => void commitPatch({ columns: Number(v) }))}
            {select("Spacing", feed.gap ?? "sm", [
              ["none", "None"],
              ["sm", "Small"],
              ["md", "Medium"],
              ["lg", "Large"],
            ], (v) => void commitPatch({ gap: v }))}
            {select("Tile shape", feed.aspect ?? "square", [
              ["square", "Square"],
              ["portrait", "Portrait 4:5"],
              ["video", "Wide 16:9"],
              ["auto", "Natural (masonry)"],
            ], (v) => void commitPatch({ aspect: v }))}
            {select("On hover", feed.hover ?? "zoom-caption", [
              ["none", "Nothing"],
              ["zoom", "Zoom"],
              ["caption", "Show caption"],
              ["zoom-caption", "Zoom + caption"],
            ], (v) => void commitPatch({ hover: v }))}
            {select("More posts", feed.loadMore ?? "button", [
              ["button", "Load more button"],
              ["auto", "Load while scrolling"],
              ["none", "Show first batch only"],
            ], (v) => void commitPatch({ loadMore: v }))}
            <Field flush>
              <FieldLabel>Posts shown at first</FieldLabel>
              <input
                key={`${node.id}:initial:${feed.initialCount ?? 6}`}
                type="number"
                min={2}
                max={48}
                defaultValue={feed.initialCount ?? 6}
                className={KIT.input}
                onBlur={(e) => {
                  const next = Math.max(2, Math.min(48, Number(e.currentTarget.value) || 6));
                  if (next === (feed.initialCount ?? 6)) return;
                  void commitPatch({ initialCount: next });
                }}
              />
            </Field>
            <label className="flex items-center gap-2 text-[12px] text-stone-600">
              <input
                type="checkbox"
                checked={feed.lightbox ?? true}
                onChange={(e) => void commitPatch({ lightbox: e.currentTarget.checked })}
              />
              <span>Open posts in a viewer (lightbox)</span>
            </label>
            <label className="flex items-center gap-2 text-[12px] text-stone-600">
              <input
                type="checkbox"
                checked={feed.autoplayVideos ?? true}
                onChange={(e) =>
                  void commitPatch({ autoplayVideos: e.currentTarget.checked })
                }
              />
              <span>Auto-play videos while visible</span>
            </label>
          </div>
        </BuilderNodeSection>
        <BuilderNodeSection
          title={`Posts (${feedItems.length})`}
          info="Add the photo or video for each post, then paste the post link so visitors can open it. Live account sync arrives once the workspace connects Instagram or TikTok."
        >
          <div className="flex flex-col gap-3">
            {feedItems.map((item, index) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-[10px] border border-stone-200 p-2.5"
              >
                <MediaField
                  tenantId={tenantId}
                  value={toMediaValue(item.mediaUrl)}
                  onChange={(next) => {
                    // D3: `next === null` is a Clear click — the old guard
                    // (`if (!next) return;`) silently ate it. `mediaUrl` is a
                    // REQUIRED https:// field on every post
                    // (socialFeedItemSchema) — a post with no media isn't a
                    // valid post — so clearing the image removes the whole
                    // post instead of leaving it half-filled and unsavable.
                    // Matches the existing per-item "Remove" button below.
                    if (next === null) {
                      void commitPatch({ items: removeItemAt(feedItems, index) });
                      return;
                    }
                    patchItem(index, {
                      mediaUrl: next.url,
                      mediaType: /\.(mp4|webm|mov)(\?|$)/i.test(next.url)
                        ? "video"
                        : "image",
                      // Only a library pick brings an alt to adopt.
                      ...(next.mediaId
                        ? { caption: item.caption ?? next.alt ?? undefined }
                        : {}),
                    });
                  }}
                />
                {select("Type", item.mediaType ?? "image", [
                  ["image", "Photo"],
                  ["video", "Video / Reel"],
                ], (v) =>
                  patchItem(index, { mediaType: v as "image" | "video" }),
                )}
                <Field flush>
                  <FieldLabel>Post link</FieldLabel>
                  <input
                    key={`${item.id}:permalink:${item.permalink ?? ""}`}
                    defaultValue={item.permalink ?? ""}
                    className={KIT.input}
                    placeholder="https://www.instagram.com/p/…"
                    onBlur={(e) => {
                      const next = e.currentTarget.value.trim();
                      if (next === (item.permalink ?? "")) return;
                      patchItem(index, { permalink: next || undefined });
                    }}
                  />
                </Field>
                <Field flush>
                  <FieldLabel>Caption</FieldLabel>
                  <input
                    key={`${item.id}:caption:${item.caption ?? ""}`}
                    defaultValue={item.caption ?? ""}
                    className={KIT.input}
                    placeholder="Shown on hover and in the viewer"
                    onBlur={(e) => {
                      const next = e.currentTarget.value.trim();
                      if (next === (item.caption ?? "")) return;
                      patchItem(index, { caption: next || undefined });
                    }}
                  />
                </Field>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={KIT.ghostButton}
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className={KIT.ghostButton}
                    disabled={index === feedItems.length - 1}
                    onClick={() => moveItem(index, 1)}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className={KIT.ghostButton}
                    onClick={() => {
                      void commitPatch({
                        items: feedItems.filter((_, i) => i !== index),
                      });
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className={KIT.subtleButton}
              disabled={feedItems.length >= 48}
              onClick={() => {
                void commitPatch({
                  items: [
                    ...feedItems,
                    {
                      id: `sf-${Date.now().toString(36)}-${Math.random()
                        .toString(36)
                        .slice(2, 6)}`,
                      mediaUrl: "",
                      mediaType: "image",
                    },
                  ],
                });
              }}
            >
              Add post
            </button>
          </div>
        </BuilderNodeSection>
      </BuilderNodeFlatPanel>
    );
  }

  // ── pricing_table ─────────────────────────────────────────────────────────
  // Pattern: tier array editor (nested-list UX mirroring accordion/tabs).
  // Each tier has: name, price, period, description, ctaLabel, ctaHref,
  // highlighted, features[]{label, included}.
  // Schema: pricingTablePropsSchema — tiers min(2) max(4).
  if (node.kind === "pricing_table") {
    const tiers = node.props.tiers;
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead
            title="Pricing table"
            sub={`${tiers.length} tier${tiers.length === 1 ? "" : "s"}`}
            iconAccent="blue"
          />
          <CardBody>
            <p className={KIT.hint}>
              Edit each tier below. You can have 2–4 tiers. Drag to reorder, or use Remove to delete (minimum 2 required).
            </p>
          </CardBody>
        </Card>
        {tiers.map((tier, tierIndex) => (
          <Card key={tier.id}>
            <CardHead
              title={tier.name || `Tier ${tierIndex + 1}`}
              sub={`${tier.price}${tier.period ? ` / ${tier.period}` : ""}`}
            />
            <CardBody>
              <div className="flex flex-col gap-3">
                {/* Basic tier fields */}
                <Field flush>
                  <FieldLabel>Name</FieldLabel>
                  <input
                    key={`${tier.id}:name:${tier.name}`}
                    defaultValue={tier.name}
                    className={KIT.input}
                    placeholder="e.g. Pro"
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (!next || next === tier.name) return;
                      const nextTiers = tiers.map((t, i) =>
                        i === tierIndex ? { ...t, name: next } : t,
                      );
                      void commitPatch({ tiers: nextTiers });
                    }}
                  />
                </Field>
                <Field flush>
                  <FieldLabel>Price</FieldLabel>
                  <input
                    key={`${tier.id}:price:${tier.price}`}
                    defaultValue={tier.price}
                    className={KIT.input}
                    placeholder="e.g. $49 or Free"
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (!next || next === tier.price) return;
                      const nextTiers = tiers.map((t, i) =>
                        i === tierIndex ? { ...t, price: next } : t,
                      );
                      void commitPatch({ tiers: nextTiers });
                    }}
                  />
                </Field>
                <Field flush>
                  <FieldLabel>Period</FieldLabel>
                  <input
                    key={`${tier.id}:period:${tier.period ?? ""}`}
                    defaultValue={tier.period ?? ""}
                    className={KIT.input}
                    placeholder="e.g. per month"
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (next === (tier.period ?? "")) return;
                      const nextTiers = tiers.map((t, i) =>
                        i === tierIndex
                          ? { ...t, period: next || undefined }
                          : t,
                      );
                      void commitPatch({ tiers: nextTiers });
                    }}
                  />
                </Field>
                <Field flush>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    key={`${tier.id}:desc:${tier.description ?? ""}`}
                    defaultValue={tier.description ?? ""}
                    className={`${KIT.textarea} min-h-[64px]`}
                    placeholder="Short description of this plan"
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (next === (tier.description ?? "")) return;
                      const nextTiers = tiers.map((t, i) =>
                        i === tierIndex
                          ? { ...t, description: next || undefined }
                          : t,
                      );
                      void commitPatch({ tiers: nextTiers });
                    }}
                  />
                </Field>
                <Field flush>
                  <FieldLabel>CTA label</FieldLabel>
                  <input
                    key={`${tier.id}:ctaLabel:${tier.ctaLabel ?? ""}`}
                    defaultValue={tier.ctaLabel ?? ""}
                    className={KIT.input}
                    placeholder="e.g. Get started"
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (next === (tier.ctaLabel ?? "")) return;
                      const nextTiers = tiers.map((t, i) =>
                        i === tierIndex
                          ? { ...t, ctaLabel: next || undefined }
                          : t,
                      );
                      void commitPatch({ tiers: nextTiers });
                    }}
                  />
                </Field>
                <Field flush>
                  <FieldLabel>CTA destination</FieldLabel>
                  <input
                    key={`${tier.id}:ctaHref:${tier.ctaHref ?? ""}`}
                    defaultValue={tier.ctaHref ?? ""}
                    className={KIT.input}
                    placeholder="/signup or https://..."
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (next === (tier.ctaHref ?? "")) return;
                      const nextTiers = tiers.map((t, i) =>
                        i === tierIndex
                          ? { ...t, ctaHref: next || undefined }
                          : t,
                      );
                      void commitPatch({ tiers: nextTiers });
                    }}
                  />
                </Field>
                <div style={{ padding: "4px 0" }}>
                  <Toggle
                    on={tier.highlighted ?? false}
                    onChange={(next) => {
                      const nextTiers = tiers.map((t, i) =>
                        i === tierIndex ? { ...t, highlighted: next } : t,
                      );
                      void commitPatch({ tiers: nextTiers });
                    }}
                    label="Highlighted"
                    helper="Shows this tier with a visual accent, usually the recommended plan."
                  />
                </div>

                {/* Features sub-list */}
                <div>
                  <div className={`${KIT.label} mb-1.5`}>
                    Features ({(tier.features ?? []).length})
                  </div>
                  <div className="flex flex-col gap-2">
                    {(tier.features ?? []).map((feature, featureIndex) => (
                      <div
                        key={`${tier.id}:feature:${featureIndex}`}
                        className="rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              key={`${tier.id}:feature:label:${featureIndex}:${feature.label}`}
                              defaultValue={feature.label}
                              className={`${KIT.input} flex-1`}
                              placeholder="Feature label"
                              onBlur={(event) => {
                                const next = event.currentTarget.value.trim();
                                if (!next || next === feature.label) return;
                                const nextFeatures = (tier.features ?? []).map(
                                  (f, fi) =>
                                    fi === featureIndex ? { ...f, label: next } : f,
                                );
                                const nextTiers = tiers.map((t, i) =>
                                  i === tierIndex ? { ...t, features: nextFeatures } : t,
                                );
                                void commitPatch({ tiers: nextTiers });
                              }}
                            />
                            <button
                              type="button"
                              className={KIT.subtleButton}
                              onClick={() => {
                                const nextFeatures = (tier.features ?? []).filter(
                                  (_, fi) => fi !== featureIndex,
                                );
                                const nextTiers = tiers.map((t, i) =>
                                  i === tierIndex ? { ...t, features: nextFeatures } : t,
                                );
                                void commitPatch({ tiers: nextTiers });
                              }}
                            >
                              Remove
                            </button>
                          </div>
                          <label className="flex items-center gap-2 text-[12px] text-stone-600">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-indigo-600"
                              checked={feature.included ?? true}
                              onChange={(event) => {
                                const nextFeatures = (tier.features ?? []).map(
                                  (f, fi) =>
                                    fi === featureIndex
                                      ? { ...f, included: event.currentTarget.checked }
                                      : f,
                                );
                                const nextTiers = tiers.map((t, i) =>
                                  i === tierIndex ? { ...t, features: nextFeatures } : t,
                                );
                                void commitPatch({ tiers: nextTiers });
                              }}
                            />
                            Included
                          </label>
                        </div>
                      </div>
                    ))}
                    {(tier.features ?? []).length < 20 ? (
                      <button
                        type="button"
                        className={KIT.ghostButton}
                        onClick={() => {
                          const nextFeatures = [
                            ...(tier.features ?? []),
                            { label: "New feature", included: true },
                          ];
                          const nextTiers = tiers.map((t, i) =>
                            i === tierIndex ? { ...t, features: nextFeatures } : t,
                          );
                          void commitPatch({ tiers: nextTiers });
                        }}
                      >
                        + Add feature
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Tier-level reorder / remove */}
                <div className="flex flex-wrap gap-2">
                  {tierIndex > 0 ? (
                    <button
                      type="button"
                      className={KIT.subtleButton}
                      onClick={() => {
                        const nextTiers = [...tiers];
                        [nextTiers[tierIndex - 1], nextTiers[tierIndex]] = [
                          nextTiers[tierIndex]!,
                          nextTiers[tierIndex - 1]!,
                        ];
                        void commitPatch({ tiers: nextTiers });
                      }}
                    >
                      Move left
                    </button>
                  ) : null}
                  {tierIndex < tiers.length - 1 ? (
                    <button
                      type="button"
                      className={KIT.subtleButton}
                      onClick={() => {
                        const nextTiers = [...tiers];
                        [nextTiers[tierIndex], nextTiers[tierIndex + 1]] = [
                          nextTiers[tierIndex + 1]!,
                          nextTiers[tierIndex]!,
                        ];
                        void commitPatch({ tiers: nextTiers });
                      }}
                    >
                      Move right
                    </button>
                  ) : null}
                  {tiers.length > 2 ? (
                    <button
                      type="button"
                      className={KIT.subtleButton}
                      onClick={() => {
                        const nextTiers = tiers.filter((_, i) => i !== tierIndex);
                        void commitPatch({ tiers: nextTiers });
                      }}
                    >
                      Remove tier
                    </button>
                  ) : null}
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
        {tiers.length < 4 ? (
          <button
            type="button"
            className={KIT.ghostButton}
            onClick={() => {
              const nextTiers = [
                ...tiers,
                {
                  id: `tier-${Date.now()}`,
                  name: "New tier",
                  price: "$0",
                  period: "per month",
                  ctaLabel: "Get started",
                  ctaHref: "/signup",
                  highlighted: false,
                  features: [{ label: "Feature one", included: true }],
                },
              ];
              void commitPatch({ tiers: nextTiers });
            }}
          >
            + Add tier
          </button>
        ) : null}
      </div>
    );
  }

  // ── form ──────────────────────────────────────────────────────────────────
  if (node.kind === "form") {
    return <FormNodeContentInspector node={node} />;
  }
  // ── nav ───────────────────────────────────────────────────────────────────
  // Pattern: links[] array editor (label/href rows, add/remove/reorder) +
  // brand / brandHref text fields + collapseAt segmented control.
  // Schema: navPropsSchema — links min(1) max(12).
  if (node.kind === "nav") {
    const links = node.props.links;
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead
            title="Navigation"
            sub={`${links.length} link${links.length === 1 ? "" : "s"}`}
            iconAccent="blue"
          />
          <CardBody>
            <div className="flex flex-col gap-3">
              <Field flush>
                <FieldLabel>Brand name</FieldLabel>
                <BuilderNodeLocalizableTextField
                  node={node}
                  prop="brand"
                  tenantId={tenantId}
                  fieldKind="input"
                  baseValue={node.props.brand ?? ""}
                  ariaLabel="Brand name"
                  className={KIT.input}
                  placeholder="Your brand or site name"
                  onCommitBase={(next) =>
                    commitTextInput("brand", node.props.brand ?? "", true)(next)
                  }
                  patch={commitPatch}
                />
              </Field>
              <Field flush>
                <FieldLabel>Brand link</FieldLabel>
                <input
                  key={`${node.id}:brandHref:${node.props.brandHref ?? ""}`}
                  defaultValue={node.props.brandHref ?? ""}
                  className={KIT.input}
                  placeholder="/ or https://..."
                  onBlur={(event) => {
                    void commitTextInput("brandHref", node.props.brandHref ?? "", true)(
                      event.currentTarget.value,
                    );
                  }}
                  onKeyDown={handleCommitKey((value) => {
                    void commitTextInput("brandHref", node.props.brandHref ?? "", true)(value);
                  })}
                />
              </Field>
              <Field flush>
                <FieldLabel info="“Mobile” keeps links visible on tablet and above.">Collapse to hamburger at</FieldLabel>
                <Segmented
                  fullWidth
                  compact
                  value={node.props.collapseAt ?? "mobile"}
                  onChange={(next) => {
                    void commitPatch({ collapseAt: next as "tablet" | "mobile" });
                  }}
                  options={[
                    { value: "mobile", label: "Mobile" },
                    { value: "tablet", label: "Tablet" },
                  ]}
                />
              </Field>
              <Field flush>
                <FieldLabel info="How a link’s submenu opens on desktop. “Mega” uses a wider multi-column panel. Only affects links with child links.">Submenu style</FieldLabel>
                <Segmented
                  fullWidth
                  compact
                  value={node.props.submenuVariant ?? "dropdown"}
                  onChange={(next) => {
                    void commitPatch({
                      submenuVariant: next as "dropdown" | "mega",
                    });
                  }}
                  options={[
                    { value: "dropdown", label: "Dropdown" },
                    { value: "mega", label: "Mega" },
                  ]}
                />
              </Field>
              {/* Mobile menu style — picture chips, not a bare <select>.
               *  An operator choosing how the hamburger opens is making a
               *  VISUAL decision; four words in a dropdown make them guess and
               *  publish to find out. The thumbnails + one-line helpers are the
               *  vocabulary the curated header already shipped
               *  (site-header/tabs/MobileTab.tsx), reused verbatim so the two
               *  surfaces teach the same thing. */}
              <Field flush>
                <FieldLabel info="How the collapsed hamburger menu opens on mobile.">Mobile menu style</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  {NAV_MOBILE_MENU_OPTIONS.map((option) => {
                    const active =
                      (node.props.mobileMenuVariant ?? "dropdown") === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        title={option.helper}
                        aria-pressed={active}
                        onClick={() => {
                          void commitPatch({
                            mobileMenuVariant: option.value as
                              | "dropdown"
                              | "drawer-right"
                              | "sheet-bottom"
                              | "full-screen-fade",
                          });
                        }}
                        className="flex cursor-pointer flex-col gap-1 rounded-[10px] border p-2 text-left transition-colors"
                        style={{
                          borderColor: active ? CHROME.accent : CHROME.line,
                          background: active ? CHROME.paper2 : "transparent",
                        }}
                      >
                        <span
                          className="block overflow-hidden rounded-[6px]"
                          style={{ border: `1px solid ${CHROME.line}` }}
                        >
                          <option.Thumb />
                        </span>
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: active ? CHROME.ink : CHROME.muted }}
                        >
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>
              {/* Phone menu contents. Grouped with the other mobile controls so
                  the drawer is configured in one place rather than split
                  between "how it opens" and "what is in it". */}
              <Field flush>
                <FieldLabel>Phone menu button</FieldLabel>
                <input
                  key={`nav-cta-label-${node.id}`}
                  defaultValue={node.props.menu?.ctaLabel ?? ""}
                  className={KIT.input}
                  placeholder="Book talent"
                  onBlur={(event) => {
                    const next = event.currentTarget.value.trim();
                    void commitPatch({
                      menu: { ...(node.props.menu ?? {}), ctaLabel: next || undefined },
                    });
                  }}
                />
                <input
                  key={`nav-cta-href-${node.id}`}
                  defaultValue={node.props.menu?.ctaHref ?? ""}
                  className={`${KIT.input} mt-1.5`}
                  placeholder="/p/contact"
                  onBlur={(event) => {
                    const next = event.currentTarget.value.trim();
                    void commitPatch({
                      menu: { ...(node.props.menu ?? {}), ctaHref: next || undefined },
                    });
                  }}
                />
                <Helper>
                  Pinned to the bottom of the open menu. Needs both a label and a
                  destination to appear.
                </Helper>
              </Field>
              <Field flush>
                <FieldLabel>Also in the phone menu</FieldLabel>
                <div className="flex flex-col gap-1.5">
                  {([
                    ["showSocial", "Social links row"],
                    ["showLanguageToggle", "Language row"],
                  ] as const).map(([key, label]) => (
                    <label
                      key={`nav-menu-${key}-${node.id}`}
                      className="flex items-center gap-2 text-[12px] text-stone-700"
                    >
                      <input
                        type="checkbox"
                        checked={node.props.menu?.[key] === true}
                        onChange={(event) => {
                          void commitPatch({
                            menu: {
                              ...(node.props.menu ?? {}),
                              [key]: event.currentTarget.checked || undefined,
                            },
                          });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <Helper>
                  Each one hides itself when it has nothing to show, so an empty
                  row never appears.
                </Helper>
              </Field>
              <Field flush>
                <FieldLabel>Phone menu groups</FieldLabel>
                <Segmented
                  fullWidth
                  compact
                  value={node.props.menu?.groups ?? "inline"}
                  onChange={(next) => {
                    void commitPatch({
                      menu: {
                        ...(node.props.menu ?? {}),
                        groups: next === "inline" ? undefined : (next as "collapsible"),
                      },
                    });
                  }}
                  options={[
                    { value: "inline", label: "Always open" },
                    { value: "collapsible", label: "Collapsible" },
                  ]}
                />
              </Field>
              <Field flush>
                <FieldLabel>Phone menu spacing</FieldLabel>
                <Segmented
                  fullWidth
                  compact
                  value={node.props.menu?.density ?? "comfortable"}
                  onChange={(next) => {
                    void commitPatch({
                      menu: {
                        ...(node.props.menu ?? {}),
                        density:
                          next === "comfortable"
                            ? undefined
                            : (next as "compact" | "spacious"),
                      },
                    });
                  }}
                  options={[
                    { value: "compact", label: "Compact" },
                    { value: "comfortable", label: "Comfortable" },
                    { value: "spacious", label: "Spacious" },
                  ]}
                />
              </Field>
              <Field flush>
                <FieldLabel>Hamburger button label</FieldLabel>
                <input
                  key={`nav-menu-label-${node.id}`}
                  defaultValue={node.props.menuLabel ?? ""}
                  className={KIT.input}
                  placeholder="Menu"
                  onBlur={(event) => {
                    void commitTextInput("menuLabel", node.props.menuLabel ?? "", true)(
                      event.currentTarget.value,
                    );
                  }}
                  onKeyDown={handleCommitKey((value) => {
                    void commitTextInput("menuLabel", node.props.menuLabel ?? "", true)(value);
                  })}
                />
                <Helper>
                  Screen-reader label for the hamburger button. Translate it in a
                  Spanish header. Defaults to &ldquo;Menu&rdquo;.
                </Helper>
              </Field>
              {/* The open menu is a full-screen surface on phones -- on a dark
                  site the default white card is the single most jarring thing
                  a visitor sees. These three fields are the only authoring path
                  to the --bn-nav-menu-* custom properties. */}
              {([
                ["menuBackground", "Menu background", "#ffffff"],
                ["menuTextColor", "Menu text", "#111111"],
                ["menuBorderColor", "Menu border", "rgba(17,17,17,0.12)"],
              ] as const).map(([propKey, label, placeholder]) => (
                <Field flush key={`nav-${propKey}-${node.id}`}>
                  <FieldLabel>{label}</FieldLabel>
                  {/* Swatch AND text: the picker is the fast path, but the text
                      input stays because a theme token -- var(--token-color-ink)
                      -- is a legitimate value a colour picker cannot express. */}
                  <div className="flex items-center gap-2">
                    <ColorSwatchButton
                      color={node.props[propKey] ?? ""}
                      ariaLabel={`Pick ${label.toLowerCase()}`}
                      dataAttr={["data-builder-nav-color", propKey]}
                      onChange={(next) => {
                        void commitPatch({ [propKey]: next });
                      }}
                    />
                    <input
                      key={`nav-${propKey}-input-${node.id}-${node.props[propKey] ?? ""}`}
                      defaultValue={node.props[propKey] ?? ""}
                      className={KIT.input}
                      placeholder={placeholder}
                      onBlur={(event) => {
                        void commitTextInput(propKey, node.props[propKey] ?? "", true)(
                          event.currentTarget.value,
                        );
                      }}
                      onKeyDown={handleCommitKey((value) => {
                        void commitTextInput(propKey, node.props[propKey] ?? "", true)(value);
                      })}
                    />
                  </div>
                </Field>
              ))}
              <Helper>
                Colours for the open mobile menu. Any CSS colour or a theme token
                such as var(--token-color-ink). Leave blank for the default card.
              </Helper>
              {/* Mega layout — only meaningful once "Mega" is the submenu
                  style, so it stays hidden rather than sitting there inert. */}
              {node.props.submenuVariant === "mega" ? (
                <>
                  <Field flush>
                    <FieldLabel>Mega columns</FieldLabel>
                    <Segmented
                      fullWidth
                      compact
                      value={String(node.props.megaColumns ?? "")}
                      onChange={(next) => {
                        void commitPatch({
                          megaColumns: next ? (Number(next) as 2 | 3 | 4) : undefined,
                        });
                      }}
                      options={[
                        { value: "", label: "Auto" },
                        { value: "2", label: "2" },
                        { value: "3", label: "3" },
                        { value: "4", label: "4" },
                      ]}
                    />
                  </Field>
                  <Field flush>
                    <FieldLabel>Mega panel width</FieldLabel>
                    <Segmented
                      fullWidth
                      compact
                      value={node.props.megaWidth ?? "anchored"}
                      onChange={(next) => {
                        void commitPatch({
                          megaWidth:
                            next === "anchored" ? undefined : (next as "full"),
                        });
                      }}
                      options={[
                        { value: "anchored", label: "Under the link" },
                        { value: "full", label: "Full width" },
                      ]}
                    />
                  </Field>
                </>
              ) : null}
              <Field flush>
                <FieldLabel>Link hover</FieldLabel>
                <Segmented
                  fullWidth
                  compact
                  value={node.props.linkHover ?? "underline"}
                  onChange={(next) => {
                    void commitPatch({
                      linkHover:
                        next === "underline"
                          ? undefined
                          : (next as "fade" | "none"),
                    });
                  }}
                  options={[
                    { value: "underline", label: "Underline" },
                    { value: "fade", label: "Fade" },
                    { value: "none", label: "None" },
                  ]}
                />
              </Field>
              <Field flush>
                <FieldLabel>Accent colour</FieldLabel>
                <div className="flex items-center gap-2">
                  <ColorSwatchButton
                    color={node.props.accentColor ?? ""}
                    ariaLabel="Pick the nav accent colour"
                    onChange={(next) => {
                      void commitPatch({ accentColor: next });
                    }}
                  />
                  <input
                    key={`nav-accent-${node.id}-${node.props.accentColor ?? ""}`}
                    defaultValue={node.props.accentColor ?? ""}
                    className={KIT.input}
                    placeholder="var(--token-color-accent)"
                    onBlur={(event) => {
                      void commitTextInput("accentColor", node.props.accentColor ?? "", true)(
                        event.currentTarget.value,
                      );
                    }}
                  />
                </div>
                <Helper>
                  Used by the link underline, badges and the phone menu button.
                </Helper>
              </Field>
              <Field flush>
                <FieldLabel info="When set, the nav builds its links from your published pages or posts. The manual links below stay as the fallback when nothing resolves.">Auto-populate links from</FieldLabel>
                <select
                  className={KIT.select}
                  value={node.props.dataBinding?.sourceKey ?? ""}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    void commitPatch({
                      dataBinding:
                        next === "cms_page" || next === "cms_posts"
                          ? { sourceKey: next }
                          : undefined,
                    });
                  }}
                >
                  <option value="">Manual links (below)</option>
                  <option value="cms_page">Site pages</option>
                  <option value="cms_posts">Blog posts</option>
                </select>
              </Field>
            </div>
          </CardBody>
        </Card>

        {/* Links list */}
        <Card>
          <CardHead
            title={node.props.dataBinding ? "Fallback links" : "Nav links"}
            sub={`${links.length} link${links.length === 1 ? "" : "s"}`}
          />
          <CardBody>
            <div className="flex flex-col gap-3">
              <p className={KIT.hint}>Edit label and destination for each link. Drag the handle to reorder.</p>
              {/* The hint used to promise dragging with no drag handler behind
                  it. DraggableList is the sanctioned inspector reorder
                  primitive; Up/Down stay as the keyboard-accessible path. */}
              <DraggableList
                items={links}
                keyOf={(link) => link.id}
                onReorder={(next) => {
                  void commitPatch({ links: next });
                }}
              >
                {(link, linkIndex, handleProps) => (
                <div
                  key={link.id}
                  // Clicking a link on the canvas selects the whole nav (links
                  // are props, not nodes), so the panel finds the row itself
                  // rather than leaving the operator to scan twelve of them.
                  ref={(el) => {
                    if (el && navLinkFocus?.linkId === link.id) {
                      el.scrollIntoView({ block: "nearest" });
                    }
                  }}
                  data-nav-link-row={link.id}
                  className={`rounded-lg border px-3 py-2 transition-colors ${
                    navLinkFocus?.linkId === link.id
                      ? "border-violet-400 bg-violet-50/60"
                      : "border-stone-200 bg-[#faf9f6]"
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        {...handleProps}
                        role="button"
                        tabIndex={-1}
                        aria-label={`Reorder ${link.label || `link ${linkIndex + 1}`}`}
                        className="inline-flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-[13px] font-semibold text-stone-400 active:cursor-grabbing"
                      >
                        ⋮⋮
                      </span>
                      <span className="flex-1 truncate text-[12px] font-semibold text-stone-700">
                        {link.label || `Link ${linkIndex + 1}`}
                      </span>
                      <button
                        type="button"
                        className={KIT.subtleButton}
                        disabled={linkIndex === 0}
                        onClick={() => {
                          const nextLinks = [...links];
                          [nextLinks[linkIndex - 1], nextLinks[linkIndex]] = [
                            nextLinks[linkIndex]!,
                            nextLinks[linkIndex - 1]!,
                          ];
                          void commitPatch({ links: nextLinks });
                        }}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className={KIT.subtleButton}
                        disabled={linkIndex === links.length - 1}
                        onClick={() => {
                          const nextLinks = [...links];
                          [nextLinks[linkIndex], nextLinks[linkIndex + 1]] = [
                            nextLinks[linkIndex + 1]!,
                            nextLinks[linkIndex]!,
                          ];
                          void commitPatch({ links: nextLinks });
                        }}
                      >
                        Down
                      </button>
                      {links.length > 1 ? (
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            const nextLinks = links.filter((_, i) => i !== linkIndex);
                            void commitPatch({ links: nextLinks });
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <Field flush>
                      <FieldLabel>Label</FieldLabel>
                      <input
                        key={`${link.id}:label:${link.label}`}
                        defaultValue={link.label}
                        className={KIT.input}
                        placeholder="e.g. About"
                        onBlur={(event) => {
                          const next = event.currentTarget.value.trim();
                          if (!next || next === link.label) return;
                          const nextLinks = links.map((l, i) =>
                            i === linkIndex ? { ...l, label: next } : l,
                          );
                          void commitPatch({ links: nextLinks });
                        }}
                      />
                    </Field>
                    <Field flush>
                      <FieldLabel>Destination</FieldLabel>
                      <input
                        key={`${link.id}:href:${link.href}`}
                        defaultValue={link.href}
                        className={KIT.input}
                        placeholder="/about or https://..."
                        onBlur={(event) => {
                          const next = event.currentTarget.value.trim();
                          if (!next || next === link.href) return;
                          const nextLinks = links.map((l, i) =>
                            i === linkIndex ? { ...l, href: next } : l,
                          );
                          void commitPatch({ links: nextLinks });
                        }}
                      />
                    </Field>
                    {/* v2 link fields. Each is optional; leaving them alone
                        renders the link exactly as before. */}
                    <IconPicker
                      label="Icon"
                      value={link.icon ?? null}
                      searchTerms="nav link icon glyph"
                      onChange={(icon) => {
                        const nextLinks = links.map((l, i) =>
                          i === linkIndex
                            ? { ...l, icon: icon ?? undefined }
                            : l,
                        );
                        void commitPatch({ links: nextLinks });
                      }}
                    />
                    <Field flush>
                      <FieldLabel>Description</FieldLabel>
                      <input
                        key={`${link.id}:desc:${link.description ?? ""}`}
                        defaultValue={link.description ?? ""}
                        className={KIT.input}
                        placeholder="Shown under the label in a dropdown"
                        onBlur={(event) => {
                          const next = event.currentTarget.value.trim();
                          if (next === (link.description ?? "")) return;
                          const nextLinks = links.map((l, i) =>
                            i === linkIndex
                              ? { ...l, description: next || undefined }
                              : l,
                          );
                          void commitPatch({ links: nextLinks });
                        }}
                      />
                      <Helper>
                        Only shows in a dropdown or mega panel. The top bar stays
                        one line.
                      </Helper>
                    </Field>
                    <Field flush>
                      <FieldLabel>Badge</FieldLabel>
                      <input
                        key={`${link.id}:badge:${link.badge ?? ""}`}
                        defaultValue={link.badge ?? ""}
                        className={KIT.input}
                        placeholder="New"
                        onBlur={(event) => {
                          const next = event.currentTarget.value.trim();
                          if (next === (link.badge ?? "")) return;
                          const nextLinks = links.map((l, i) =>
                            i === linkIndex ? { ...l, badge: next || undefined } : l,
                          );
                          void commitPatch({ links: nextLinks });
                        }}
                      />
                    </Field>
                    <Field flush>
                      <FieldLabel>Where it shows</FieldLabel>
                      <Segmented
                        fullWidth
                        compact
                        value={link.placement ?? "both"}
                        onChange={(next) => {
                          const nextLinks = links.map((l, i) =>
                            i === linkIndex
                              ? {
                                  ...l,
                                  placement:
                                    next === "both"
                                      ? undefined
                                      : (next as "bar" | "menu"),
                                }
                              : l,
                          );
                          void commitPatch({ links: nextLinks });
                        }}
                        options={NAV_LINK_PLACEMENT_OPTIONS}
                      />
                      <Helper>
                        One set of links. Choose where each one shows, so nothing
                        has to be retyped for mobile.
                      </Helper>
                    </Field>
                    {/* FEATURED CARD — the one place a menu carries an image.
                        Renders in the bar's mega panel only (an image tile in
                        the phone drawer costs a screenful of scrolling for one
                        destination), so the editor appears under the same
                        condition rather than offering a field that does
                        nothing. */}
                    {node.props.submenuVariant === "mega" ? (
                      <Field flush>
                        <FieldLabel>Featured card</FieldLabel>
                        <input
                          key={`${link.id}:feat-title:${link.featured?.title ?? ""}`}
                          defaultValue={link.featured?.title ?? ""}
                          className={KIT.input}
                          placeholder="See the full board"
                          onBlur={(event) => {
                            void commitPatch({
                              links: patchFeatured(links, linkIndex, {
                                title: event.currentTarget.value.trim(),
                              }),
                            });
                          }}
                        />
                        <input
                          key={`${link.id}:feat-href:${link.featured?.href ?? ""}`}
                          defaultValue={link.featured?.href ?? ""}
                          className={`${KIT.input} mt-1.5`}
                          placeholder="/directory"
                          onBlur={(event) => {
                            void commitPatch({
                              links: patchFeatured(links, linkIndex, {
                                href: event.currentTarget.value.trim(),
                              }),
                            });
                          }}
                        />
                        <input
                          key={`${link.id}:feat-desc:${link.featured?.description ?? ""}`}
                          defaultValue={link.featured?.description ?? ""}
                          className={`${KIT.input} mt-1.5`}
                          placeholder="One line about what is behind the link"
                          onBlur={(event) => {
                            void commitPatch({
                              links: patchFeatured(links, linkIndex, {
                                description: event.currentTarget.value.trim() || undefined,
                              }),
                            });
                          }}
                        />
                        <input
                          key={`${link.id}:feat-img:${link.featured?.imageSrc ?? ""}`}
                          defaultValue={link.featured?.imageSrc ?? ""}
                          className={`${KIT.input} mt-1.5`}
                          placeholder="Image URL"
                          onBlur={(event) => {
                            void commitPatch({
                              links: patchFeatured(links, linkIndex, {
                                imageSrc: event.currentTarget.value.trim() || undefined,
                              }),
                            });
                          }}
                        />
                        <Helper>
                          Shows as a promo tile in this link&rsquo;s mega panel.
                          Clear the title and destination to remove it.
                        </Helper>
                      </Field>
                    ) : null}
                    {/* A3 — submenu (child links) editor. A link with no
                        children renders as a flat link; adding children turns it
                        into a dropdown/mega disclosure (see Submenu style). */}
                    <div className="mt-1 flex flex-col gap-2 rounded-md border border-stone-200 bg-white px-2.5 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                          Submenu
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-stone-400">
                            {(link.children?.length ?? 0) === 0
                              ? "Flat link"
                              : `${link.children!.length} child${
                                  link.children!.length === 1 ? "" : "ren"
                                }`}
                          </span>
                          {/* A submenu only exists under a real pointer, so
                              editing one meant hovering with one hand and
                              reaching for the panel with the other. This holds
                              it open. View state — nothing is written. */}
                          {(link.children?.length ?? 0) > 0 ? (
                            <button
                              type="button"
                              aria-pressed={
                                pinnedNavSubmenu?.nodeId === node.id &&
                                pinnedNavSubmenu?.linkId === link.id
                              }
                              className={
                                pinnedNavSubmenu?.nodeId === node.id &&
                                pinnedNavSubmenu?.linkId === link.id
                                  ? "rounded border border-violet-400 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                                  : "rounded border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-500 hover:border-stone-300"
                              }
                              onClick={() => {
                                const isOpen =
                                  pinnedNavSubmenu?.nodeId === node.id &&
                                  pinnedNavSubmenu?.linkId === link.id;
                                setPinnedNavSubmenu(
                                  isOpen ? null : { nodeId: node.id, linkId: link.id },
                                );
                              }}
                            >
                              {pinnedNavSubmenu?.nodeId === node.id &&
                              pinnedNavSubmenu?.linkId === link.id
                                ? "Close preview"
                                : "Show on canvas"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {(link.children ?? []).map((child, childIndex) => (
                        <div
                          key={child.id}
                          className="flex flex-col gap-1.5 rounded-md bg-[#faf9f6] px-2 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex-1 truncate text-[11px] font-semibold text-stone-600">
                              {child.label || `Sub-link ${childIndex + 1}`}
                            </span>
                            <button
                              type="button"
                              className={KIT.subtleButton}
                              disabled={childIndex === 0}
                              onClick={() => {
                                const nextChildren = [...(link.children ?? [])];
                                [
                                  nextChildren[childIndex - 1],
                                  nextChildren[childIndex],
                                ] = [
                                  nextChildren[childIndex]!,
                                  nextChildren[childIndex - 1]!,
                                ];
                                const nextLinks = links.map((l, i) =>
                                  i === linkIndex
                                    ? { ...l, children: nextChildren }
                                    : l,
                                );
                                void commitPatch({ links: nextLinks });
                              }}
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              className={KIT.subtleButton}
                              disabled={
                                childIndex === (link.children?.length ?? 0) - 1
                              }
                              onClick={() => {
                                const nextChildren = [...(link.children ?? [])];
                                [
                                  nextChildren[childIndex],
                                  nextChildren[childIndex + 1],
                                ] = [
                                  nextChildren[childIndex + 1]!,
                                  nextChildren[childIndex]!,
                                ];
                                const nextLinks = links.map((l, i) =>
                                  i === linkIndex
                                    ? { ...l, children: nextChildren }
                                    : l,
                                );
                                void commitPatch({ links: nextLinks });
                              }}
                            >
                              Down
                            </button>
                            <button
                              type="button"
                              className={KIT.subtleButton}
                              onClick={() => {
                                const nextChildren = (link.children ?? []).filter(
                                  (_, i) => i !== childIndex,
                                );
                                const nextLinks = links.map((l, i) =>
                                  i === linkIndex
                                    ? {
                                        ...l,
                                        children:
                                          nextChildren.length > 0
                                            ? nextChildren
                                            : undefined,
                                      }
                                    : l,
                                );
                                void commitPatch({ links: nextLinks });
                              }}
                            >
                              Remove
                            </button>
                          </div>
                          <input
                            key={`${child.id}:label:${child.label}`}
                            defaultValue={child.label}
                            className={KIT.input}
                            placeholder="Label"
                            onBlur={(event) => {
                              const next = event.currentTarget.value.trim();
                              if (!next || next === child.label) return;
                              const nextChildren = (link.children ?? []).map(
                                (c, i) =>
                                  i === childIndex ? { ...c, label: next } : c,
                              );
                              const nextLinks = links.map((l, i) =>
                                i === linkIndex
                                  ? { ...l, children: nextChildren }
                                  : l,
                              );
                              void commitPatch({ links: nextLinks });
                            }}
                          />
                          <input
                            key={`${child.id}:href:${child.href}`}
                            defaultValue={child.href}
                            className={KIT.input}
                            placeholder="/path or https://..."
                            onBlur={(event) => {
                              const next = event.currentTarget.value.trim();
                              if (!next || next === child.href) return;
                              const nextChildren = (link.children ?? []).map(
                                (c, i) =>
                                  i === childIndex ? { ...c, href: next } : c,
                              );
                              const nextLinks = links.map((l, i) =>
                                i === linkIndex
                                  ? { ...l, children: nextChildren }
                                  : l,
                              );
                              void commitPatch({ links: nextLinks });
                            }}
                          />
                          {/* GROUP. A child that has children of its own becomes
                              a column with its label as the heading (mega) or a
                              section heading (drawer). The renderer has done
                              this since the link model landed — until now only
                              a seeded tree could produce one, so the mega menu
                              was read-only past level two. */}
                          {node.props.submenuVariant === "mega" ? (
                            <div className="mt-1 rounded border border-stone-200 bg-white px-2 py-1.5">
                              <label className="flex items-center gap-2 text-[11px] text-stone-600">
                                <input
                                  type="checkbox"
                                  checked={(child.children?.length ?? 0) > 0}
                                  onChange={(event) => {
                                    const nextChildren = (link.children ?? []).map(
                                      (c, i) =>
                                        i === childIndex
                                          ? {
                                              ...c,
                                              children: event.currentTarget.checked
                                                ? [
                                                    {
                                                      id: `${c.id}-item-${Date.now()}`,
                                                      label: "New link",
                                                      href: "/",
                                                    },
                                                  ]
                                                : undefined,
                                            }
                                          : c,
                                    );
                                    void commitPatch({
                                      links: links.map((l, i) =>
                                        i === linkIndex
                                          ? { ...l, children: nextChildren }
                                          : l,
                                      ),
                                    });
                                  }}
                                />
                                Use as a column heading
                              </label>
                              {(child.children ?? []).map((leaf, leafIndex) => (
                                <div
                                  key={leaf.id}
                                  className="mt-1.5 flex items-center gap-1.5"
                                >
                                  <input
                                    key={`${leaf.id}:label:${leaf.label}`}
                                    defaultValue={leaf.label}
                                    className={`${KIT.input} flex-1`}
                                    placeholder="Label"
                                    onBlur={(event) => {
                                      const value = event.currentTarget.value.trim();
                                      if (!value || value === leaf.label) return;
                                      void commitPatch({
                                        links: patchGrandchild(
                                          links,
                                          linkIndex,
                                          childIndex,
                                          leafIndex,
                                          { label: value },
                                        ),
                                      });
                                    }}
                                  />
                                  <input
                                    key={`${leaf.id}:href:${leaf.href}`}
                                    defaultValue={leaf.href}
                                    className={`${KIT.input} flex-1`}
                                    placeholder="/path"
                                    onBlur={(event) => {
                                      const value = event.currentTarget.value.trim();
                                      if (!value || value === leaf.href) return;
                                      void commitPatch({
                                        links: patchGrandchild(
                                          links,
                                          linkIndex,
                                          childIndex,
                                          leafIndex,
                                          { href: value },
                                        ),
                                      });
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className={KIT.subtleButton}
                                    onClick={() => {
                                      void commitPatch({
                                        links: removeGrandchild(
                                          links,
                                          linkIndex,
                                          childIndex,
                                          leafIndex,
                                        ),
                                      });
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                              {(child.children?.length ?? 0) > 0 &&
                              (child.children?.length ?? 0) < 8 ? (
                                <button
                                  type="button"
                                  className={`${KIT.ghostButton} mt-1.5`}
                                  onClick={() => {
                                    void commitPatch({
                                      links: addGrandchild(links, linkIndex, childIndex),
                                    });
                                  }}
                                >
                                  + Add link to this column
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {(link.children?.length ?? 0) < 12 ? (
                        <button
                          type="button"
                          className={KIT.ghostButton}
                          onClick={() => {
                            const nextChildren = [
                              ...(link.children ?? []),
                              {
                                id: `sublink-${Date.now()}`,
                                label: "New sub-link",
                                href: "/",
                              },
                            ];
                            const nextLinks = links.map((l, i) =>
                              i === linkIndex
                                ? { ...l, children: nextChildren }
                                : l,
                            );
                            void commitPatch({ links: nextLinks });
                          }}
                        >
                          + Add submenu link
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                )}
              </DraggableList>
              {links.length < 12 ? (
                <button
                  type="button"
                  className={KIT.ghostButton}
                  onClick={() => {
                    const nextLinks = [
                      ...links,
                      { id: `link-${Date.now()}`, label: "New link", href: "/" },
                    ];
                    void commitPatch({ links: nextLinks });
                  }}
                >
                  + Add link
                </button>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ── social_links ──────────────────────────────────────────────────────────
  // Pattern: links[] array editor (platform select + href) + size/shape
  // controls + optional bind to the tenant's social profiles.
  // Schema: socialLinksPropsSchema — links max(12).
  if (node.kind === "social_links") {
    const socialLinks = node.props.links ?? [];
    const isBound =
      node.props.dataBinding?.sourceKey === "workspace_social_links";
    const platformOptions: ReadonlyArray<{ value: string; label: string }> = [
      { value: "instagram", label: "Instagram" },
      { value: "tiktok", label: "TikTok" },
      { value: "facebook", label: "Facebook" },
      { value: "youtube", label: "YouTube" },
      { value: "linkedin", label: "LinkedIn" },
      { value: "x", label: "X" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "email", label: "Email" },
    ];
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead
            title="Social links"
            sub={
              isBound
                ? "Synced to workspace profiles"
                : `${socialLinks.length} link${
                    socialLinks.length === 1 ? "" : "s"
                  }`
            }
            iconAccent="blue"
          />
          <CardBody>
            <div className="flex flex-col gap-3">
              <GlyphTiles
                label="Icon size"
                options={SOCIAL_ICON_SIZE_OPTIONS}
                value={node.props.size ?? "md"}
                columns={3}
                onChange={(next) => {
                  void commitPatch({ size: next as "sm" | "md" | "lg" });
                }}
                dataControl="social-icon-size"
              />
              <GlyphTiles
                label="Icon shape"
                options={SOCIAL_ICON_SHAPE_OPTIONS}
                value={node.props.shape ?? "circle"}
                columns={3}
                onChange={(next) => {
                  void commitPatch({
                    shape: next as "bare" | "circle" | "square",
                  });
                }}
                dataControl="social-icon-shape"
              />
              <Field flush>
                <FieldLabel info="When on, this block shows the social/contact links from your workspace identity and ignores the manual list below.">Source</FieldLabel>
                <Toggle
                  on={isBound}
                  onChange={(checked) => {
                    void commitPatch({
                      dataBinding: checked
                        ? { sourceKey: "workspace_social_links" }
                        : undefined,
                    });
                  }}
                  label="Sync from workspace social profiles"
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        {!isBound ? (
          <Card>
            <CardHead
              title="Links"
              sub={`${socialLinks.length} link${
                socialLinks.length === 1 ? "" : "s"
              }`}
            />
            <CardBody>
              <div className="flex flex-col gap-3">
                <p className={KIT.hint}>
                  Pick a platform and paste the profile URL (or handle). Drag to
                  reorder.
                </p>
                {socialLinks.map((link, linkIndex) => (
                  <div
                    key={link.id}
                    className="rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate text-[12px] font-semibold text-stone-700">
                          {platformOptions.find(
                            (option) => option.value === link.platform,
                          )?.label ?? link.platform}
                        </span>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          disabled={linkIndex === 0}
                          onClick={() => {
                            const nextLinks = [...socialLinks];
                            [nextLinks[linkIndex - 1], nextLinks[linkIndex]] = [
                              nextLinks[linkIndex]!,
                              nextLinks[linkIndex - 1]!,
                            ];
                            void commitPatch({ links: nextLinks });
                          }}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          disabled={linkIndex === socialLinks.length - 1}
                          onClick={() => {
                            const nextLinks = [...socialLinks];
                            [nextLinks[linkIndex], nextLinks[linkIndex + 1]] = [
                              nextLinks[linkIndex + 1]!,
                              nextLinks[linkIndex]!,
                            ];
                            void commitPatch({ links: nextLinks });
                          }}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            const nextLinks = socialLinks.filter(
                              (_, i) => i !== linkIndex,
                            );
                            void commitPatch({ links: nextLinks });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <Field flush>
                        <FieldLabel>Platform</FieldLabel>
                        <Segmented
                          compact
                          value={link.platform}
                          onChange={(next) => {
                            const nextLinks = socialLinks.map((l, i) =>
                              i === linkIndex
                                ? {
                                    ...l,
                                    platform:
                                      next as (typeof platformOptions)[number]["value"],
                                  }
                                : l,
                            );
                            void commitPatch({ links: nextLinks });
                          }}
                          options={platformOptions}
                        />
                      </Field>
                      <Field flush>
                        <FieldLabel>Destination</FieldLabel>
                        <input
                          key={`${link.id}:href:${link.href}`}
                          defaultValue={link.href}
                          className={KIT.input}
                          placeholder="https://instagram.com/you"
                          onBlur={(event) => {
                            const next = event.currentTarget.value.trim();
                            if (!next || next === link.href) return;
                            const nextLinks = socialLinks.map((l, i) =>
                              i === linkIndex ? { ...l, href: next } : l,
                            );
                            void commitPatch({ links: nextLinks });
                          }}
                        />
                      </Field>
                      {/* The platform still decides the accessible name and the
                          default mark; this only changes what is DRAWN. So a
                          network the enum does not know can still show the right
                          icon, and a partner link can be a plain glyph instead
                          of being forced into a brand mark. */}
                      <IconPicker
                        label="Icon"
                        value={link.icon ?? null}
                        allowNone
                        noneLabel="Platform default"
                        searchTerms="social icon glyph brand"
                        onChange={(icon) => {
                          const nextLinks = socialLinks.map((l, i) =>
                            i === linkIndex ? { ...l, icon: icon ?? undefined } : l,
                          );
                          void commitPatch({ links: nextLinks });
                        }}
                      />
                    </div>
                  </div>
                ))}
                {socialLinks.length < 12 ? (
                  <button
                    type="button"
                    className={KIT.ghostButton}
                    onClick={() => {
                      const nextLinks = [
                        ...socialLinks,
                        {
                          id: `social-${Date.now()}`,
                          platform: "instagram" as const,
                          href: "https://instagram.com/",
                        },
                      ];
                      void commitPatch({ links: nextLinks });
                    }}
                  >
                    + Add social link
                  </button>
                ) : null}
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  // ── rich_text ─────────────────────────────────────────────────────────────
  // Pattern: BuilderNodeRichTextField(variant:"multi") — identical to the
  // paragraph node but uses the rich_text label and max 10 000 chars.
  // Schema: richTextPropsSchema — text min(1) max(10000).
  // Double-click inline editing is wired in inline-editor.tsx below.
  if (node.kind === "rich_text") {
    return (
      <BuilderNodeFlatPanel>
        <div className={KIT.field}>
          <label className={KIT.label}>Copy</label>
          <BuilderNodeLocalizableTextField
            node={node}
            prop="text"
            tenantId={tenantId}
            fieldKind="rich-multi"
            baseValue={node.props.text}
            ariaLabel="Rich text copy"
            className={`${KIT.textarea} min-h-[128px] whitespace-pre-wrap break-words`}
            onCommitBase={(next) => commitTextInput("text", node.props.text)(next)}
            patch={commitPatch}
          />
        </div>
      </BuilderNodeFlatPanel>
    );
  }

  if (node.kind === "carousel") {
    // SLIDER (2026-08-17) — the whole slider panel lives in
    // `inspectors/carousel/`. It was ~420 lines of this file, on the retiring
    // parchment kit, in seven always-expanded sections; it is now a group
    // recipe over field-kit primitives. Extracted rather than rewritten in
    // place because this file is already a god file.
    return (
      <div className="flex flex-col gap-3">
        <CarouselSettingsPanel
          node={node}
          commitPatch={commitPatch}
          selectBuilderNode={selectBuilderNode}
          commitInsert={commitInsert}
          commitDuplicate={commitDuplicate}
          commitRemove={commitRemove}
          commitMoveToIndex={commitMoveToIndex}
        />

        <NestedBlocksCard
          title={
            (node.props.variant ?? "rail") === "hero"
              ? t("Slides")
              : t("{label} blocks").replace(
                  "{label}",
                  t(BUILDER_NODE_REGISTRY[node.kind].label),
                )
          }
          parentNodeId={node.id}
          helper={contentHint(node)}
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
        />
      </div>
    );
  }

  if (
    node.kind === "container" ||
    node.kind === "card" ||
    node.kind === "cta_group" ||
    node.kind === "split" ||
    node.kind === "masonry"
  ) {
    return (
      <div className="flex flex-col gap-3">
        {node.kind === "container" && node.props.dataBinding ? (
          <Card state="active">
            <CardHead title="Data source" sub="Live tenant content" iconAccent="blue" />
            <CardBody>
              <div className="flex flex-col gap-3">
                <div
                  data-builder-node-data-source={node.props.dataBinding.sourceKey}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Connected
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-stone-800">
                    {dataSourceLabel(node.props.dataBinding.sourceKey)}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-stone-600">
                    {dataSourceHelper(node.props.dataBinding.sourceKey)}
                  </p>
                </div>
                <Field flush>
                  <FieldLabel info="Controls the live data limit while keeping the section's editable copy.">Items shown</FieldLabel>
                  <Segmented
                    fullWidth
                    compact
                    value={
                      String(
                        normalizeDataSourceLimit(node.props.dataBinding.maxItems),
                      ) as "4" | "6" | "8" | "12"
                    }
                    onChange={(next) => {
                      void commitPatch({
                        dataBinding: {
                          ...node.props.dataBinding,
                          maxItems: Number.parseInt(next, 10),
                        },
                      });
                    }}
                    options={[
                      { value: "4", label: "4" },
                      { value: "6", label: "6" },
                      { value: "8", label: "8" },
                      { value: "12", label: "12" },
                    ]}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>
        ) : null}
        {/* Moving background. Container-only for now: it is the block every
            freeform "section" is actually built from (see
            `add-gallery/section-template-nodes.ts` — `tplSection` IS a
            container), so this is the surface an author reaches for. */}
        {node.kind === "container" ? (
          <Card state="active">
            <CardHead
              title="Background"
              sub="Video, YouTube or a slideshow behind this block"
              iconAccent="blue"
            />
            <CardBody>
              <BackgroundMediaCard
                nodeId={node.id}
                tenantId={tenantId}
                value={node.props.backgroundMedia}
                onChange={(next) => {
                  void commitPatch({ backgroundMedia: next });
                }}
              />
            </CardBody>
          </Card>
        ) : null}
        <VariantPicker node={node} commitPatch={(p) => void commitPatch(p)} />
        <NestedBlocksCard
          title={t("{label} blocks").replace(
            "{label}",
            t(BUILDER_NODE_REGISTRY[node.kind].label),
          )}
          parentNodeId={node.id}
          helper={contentHint(node)}
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
        />
      </div>
    );
  }

  if (node.kind === "divider") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Divider" sub="Horizontal rule" iconAccent="blue" />
          <CardBody>
            <GlyphTiles
              label="Tone"
              options={DIVIDER_TONE_OPTIONS}
              value={node.props.tone ?? "default"}
              columns={2}
              onChange={(next) => {
                void commitPatch({ tone: next as "default" | "muted" });
              }}
              hint="Muted draws a fainter line for subtle section breaks."
              dataControl="divider-tone"
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (node.kind === "spacer") {
    const spacerSizeCustom = parseFreeLength(node.props.sizeFree);
    const spacerSizeValue: FieldValue = spacerSizeCustom
      ? { kind: "custom", numeric: spacerSizeCustom }
      : { kind: "preset", id: node.props.size };
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Spacer" sub="Vertical gap" iconAccent="blue" />
          <CardBody>
            <PresetNumberRow
              label="Size"
              presets={SPACER_PRESETS}
              value={spacerSizeValue}
              units={["px", "rem"] as const}
              onChange={(next) => {
                if (next.kind === "preset") {
                  void commitPatch({ size: next.id, sizeFree: undefined });
                } else if (next.kind === "custom") {
                  void commitPatch({ sizeFree: formatFreeLength(next.numeric) });
                } else {
                  void commitPatch({ size: "m", sizeFree: undefined });
                }
              }}
              hint="Controls the vertical space this block adds between sections."
              dataControl="spacer-size"
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  // Every current BuilderNode kind now has a dedicated editor above, so `node`
  // narrows to `never` here. This generic fallback stays as a safety net for any
  // kind added later before its editor exists — cast back through the union so it
  // remains type-safe.
  const fallbackNode = node as Exclude<BuilderNode, { kind: "section" }>;
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHead
          title={BUILDER_NODE_REGISTRY[fallbackNode.kind].label}
          sub={`${childCount(fallbackNode)} nested block${childCount(fallbackNode) === 1 ? "" : "s"}`}
        />
        <CardBody>
          <div className="flex flex-col gap-2">
            <p className={KIT.hint}>{contentHint(fallbackNode)}</p>
            {childCount(fallbackNode) > 0 ? (
              <div className="rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2">
                <div className={KIT.label}>Contains</div>
                <p className={`${KIT.hint} mt-1`}>
                  {/* childSummary joins registry kind labels with " • ";
                      translate each label, not the joined sentence. */}
                  {childSummary(fallbackNode)
                    .split(" • ")
                    .map((part) => t(part))
                    .join(" • ")}
                </p>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function NestedBlocksCard({
  title,
  parentNodeId,
  helper,
  nodes,
  addKinds,
  onAdd,
  onAddCompositionPreset,
  onSelect,
  onMove,
  onMoveToIndex,
  onCopy,
  onDuplicate,
  onPaste,
  copiedKind,
  pastePreview,
  presets,
  onSavePreset,
  onPastePreset,
  onRemovePreset,
  onRemove,
  canRemove,
  extraActions,
}: {
  title: string;
  parentNodeId: string;
  helper: string;
  nodes: BuilderNode[];
  addKinds: BuilderNodeKind[];
  onAdd: (kind: BuilderNodeKind, index?: number) => void | Promise<void>;
  onAddCompositionPreset: (
    presetId: BuilderNodeCompositionPresetId,
    index?: number,
  ) => void | Promise<void>;
  onSelect: (nodeId: string) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void | Promise<void>;
  onMoveToIndex: (
    nodeId: string,
    parentNodeId: string,
    targetIndex: number,
  ) => void | Promise<void>;
  onCopy: (nodeId: string) => void | Promise<void>;
  onDuplicate: (nodeId: string) => void | Promise<void>;
  onPaste: (targetNodeId: string) => void | Promise<void>;
  copiedKind: BuilderNodeKind | null;
  pastePreview: BuilderNodePastePreview | null;
  presets: ReadonlyArray<BuilderBlockPreset>;
  onSavePreset: (name: string) => void;
  onPastePreset: (
    presetId: string,
    targetNodeId: string,
  ) => void | Promise<void>;
  onRemovePreset: (presetId: string) => void;
  onRemove: (nodeId: string) => void | Promise<void>;
  canRemove?: (node: BuilderNode, index: number) => boolean;
  extraActions?: (node: BuilderNode, index: number) => ReactNode;
}) {
  const { t } = useInspectorT();
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    sourceIndex: number;
  } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [selectedChildIds, setSelectedChildIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // INS-3: inline naming for "Save pattern" (replaces window.prompt).
  const [savePatternNamingOpen, setSavePatternNamingOpen] = useState(false);
  useEffect(() => {
    const currentIds = new Set(nodes.map((node) => node.id));
    setSelectedChildIds((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [nodes]);
  const selectedChildren = nodes.filter((node) => selectedChildIds.has(node.id));
  const selectedChildCount = selectedChildren.length;
  const compositionPresets = BUILDER_NODE_COMPOSITION_PRESETS.filter((preset) =>
    addKinds.includes(preset.rootKind),
  );
  const toggleSelectedChild = (nodeId: string) => {
    setSelectedChildIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const selectAllChildren = () => {
    setSelectedChildIds(new Set(nodes.map((node) => node.id)));
  };
  const clearSelectedChildren = () => {
    setSelectedChildIds(new Set());
  };
  // QA 2026-05-13 — these loops used to `await` each mutation
  // serially and abort silently on the first throw, leaving a partial
  // operation (some items applied, the rest skipped, selection still
  // pointing at items that may or may not exist). Each downstream
  // `onDuplicate` / `onRemove` already reports its own errors via the
  // parent's `reportMutationError`, so we just need to stop aborting
  // the loop. `Promise.allSettled` attempts every item; we then clear
  // selection only for ids that succeeded, so failed ones stay
  // highlighted for a retry pass.
  const duplicateSelectedChildren = async () => {
    const targets = [...selectedChildren];
    const results = await Promise.allSettled(
      targets.map((child) => onDuplicate(child.id)),
    );
    const failedIds = new Set(
      results
        .map((r, i) => ({ r, id: targets[i]!.id }))
        .filter((p) => p.r.status === "rejected")
        .map((p) => p.id),
    );
    setSelectedChildIds((current) => {
      const next = new Set<string>();
      for (const id of current) if (failedIds.has(id)) next.add(id);
      return next;
    });
  };
  const removeSelectedChildren = async () => {
    const targets = [...selectedChildren].reverse();
    const results = await Promise.allSettled(
      targets.map((child) => onRemove(child.id)),
    );
    const failedIds = new Set(
      results
        .map((r, i) => ({ r, id: targets[i]!.id }))
        .filter((p) => p.r.status === "rejected")
        .map((p) => p.id),
    );
    setSelectedChildIds((current) => {
      const next = new Set<string>();
      for (const id of current) if (failedIds.has(id)) next.add(id);
      return next;
    });
  };
  const closeInsertPicker = () => setInsertAt(null);
  const clearDragState = () => {
    setDraggingNode(null);
    setDropIndex(null);
  };
  const handleDragStart =
    (nodeId: string, sourceIndex: number) =>
    (event: DragEvent<HTMLDivElement>) => {
      event.stopPropagation();
      setDraggingNode({ nodeId, sourceIndex });
      setDropIndex(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", nodeId);
    };
  const handleDragOver =
    (index: number) => (event: DragEvent<HTMLDivElement>) => {
      if (!draggingNode) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const nextDropIndex =
        event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
      setDropIndex(nextDropIndex);
    };
  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    if (!draggingNode || dropIndex === null) {
      clearDragState();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const resolved = siblingDropGapToMoveIndex({
      dropGapIndex: dropIndex,
      sourceSiblingIndex: draggingNode.sourceIndex,
      sameParent: true,
    });
    if (resolved.kind === "noop") {
      clearDragState();
      return;
    }
    const nodeId = draggingNode.nodeId;
    clearDragState();
    await onMoveToIndex(nodeId, parentNodeId, resolved.targetSiblingIndex);
  };
  const renderInsertPicker = (index: number) =>
    insertAt === index ? (
      <div
        data-builder-node-insert-picker={index}
        className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2"
      >
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-700">
          Insert block here
        </div>
        <div className="flex flex-col gap-2">
          {compositionPresets.length > 0 ? (
            <div className="grid gap-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-indigo-700/80">
                Section packs
              </div>
              {compositionPresets.map((preset) => (
                <button
                  key={`${index}-${preset.id}`}
                  type="button"
                  className="flex items-center justify-between gap-2 border border-indigo-100 bg-white px-2 py-1.5 text-left text-[11px] text-stone-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
                  data-builder-node-composition-preset={preset.id}
                  onClick={() => {
                    closeInsertPicker();
                    void onAddCompositionPreset(preset.id, index);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{preset.label}</span>
                    <span className="block truncate text-[10px] text-stone-500">
                      {formatPresetLabel(preset.category)} · {preset.sectionCount} blocks
                    </span>
                  </span>
                  <span
                    className={
                      preset.dataMode === "data-ready"
                        ? "shrink-0 border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-700"
                        : "shrink-0 border border-stone-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-stone-500"
                    }
                  >
                    {preset.dataMode === "data-ready" ? "Data" : "Starter"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {addKinds.length > 0 ? (
            <ElementLibraryInsertPicker
              variant="inspector"
              allowedKinds={addKinds}
              onPick={(kind) => {
                closeInsertPicker();
                void onAdd(kind, index);
              }}
            />
          ) : null}
          <button type="button" className={KIT.subtleButton} onClick={closeInsertPicker}>
            Cancel
          </button>
        </div>
      </div>
    ) : null;

  return (
    <Card>
      <CardHead
        title={title}
        sub={t(
          nodes.length === 1 ? "{count} nested block" : "{count} nested blocks",
        ).replace("{count}", String(nodes.length))}
      />
      <CardBody>
        <div className="flex flex-col gap-3">
          <p className={KIT.hint}>{t(helper)}</p>
          {copiedKind && pastePreview ? (
            <div
              className={
                pastePreview.mode === "blocked"
                  ? "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2"
                  : "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2"
              }
            >
              <span
                className={
                  pastePreview.mode === "blocked"
                    ? "text-[11px] font-medium text-blue-900"
                    : "text-[11px] font-medium text-emerald-800"
                }
              >
                {t("Copied: {label}").replace(
                  "{label}",
                  t(BUILDER_NODE_REGISTRY[copiedKind].label),
                )}
                <span className="mt-0.5 block font-normal opacity-80">
                  {pastePreview.message}
                </span>
              </span>
              <button
                type="button"
                className={KIT.subtleButton}
                disabled={pastePreview.mode === "blocked"}
                title={
                  pastePreview.mode === "blocked"
                    ? pastePreview.message
                    : "Paste the copied block into this group"
                }
                onClick={() => {
                  void onPaste(parentNodeId);
                }}
              >
                {pastePreview.mode === "blocked"
                  ? "Pasting isn't allowed here"
                  : "Paste in group"}
              </button>
              {pastePreview.mode !== "blocked" ? (
                <button
                  type="button"
                  className={KIT.ghostButton}
                  onClick={() => setSavePatternNamingOpen(true)}
                >
                  Save pattern
                </button>
              ) : null}
            </div>
          ) : null}
          {savePatternNamingOpen ? (
            <InlineNameInput
              mode="text"
              title="Name this block pattern"
              placeholder="Pattern name…"
              defaultValue="Saved block pattern"
              confirmLabel="Save"
              onConfirm={(name) => {
                setSavePatternNamingOpen(false);
                onSavePreset(name.trim() || "Saved block pattern");
              }}
              onCancel={() => setSavePatternNamingOpen(false)}
            />
          ) : null}
          {/* W2-C4 — the in-content "Section packs" gallery was REMOVED. The
              Add gallery (command dock) is the single insert surface; a second
              full gallery here duplicated it. The composition presets are still
              reachable inline via the contextual "Insert block here" picker
              (renderInsertPicker) and remain fully in the data model. */}
          <MyBlocksPanel parentNodeId={parentNodeId} />
          <ComponentLibraryPanel parentNodeId={parentNodeId} />
          {presets.length > 0 ? (
            <details className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-stone-700">
                Block presets ({presets.length})
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {presets.slice(0, 6).map((preset) => (
                  <div
                    key={preset.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-[#faf9f6] px-2 py-1.5"
                  >
                    <span className="min-w-0 text-[11px] font-medium text-stone-700">
                      <span className="block truncate">{preset.name}</span>
                      <span className="block text-[10px] font-normal text-stone-500">
                        {t(BUILDER_NODE_REGISTRY[preset.node.kind].label)}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className={KIT.subtleButton}
                        onClick={() => {
                          void onPastePreset(preset.id, parentNodeId);
                        }}
                      >
                        Insert
                      </button>
                      <button
                        type="button"
                        className={KIT.ghostButton}
                        onClick={() => onRemovePreset(preset.id)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {nodes.length > 0 && addKinds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2">
              <span className="text-[11px] font-medium text-stone-500">
                Place new blocks exactly where they belong.
              </span>
              <button
                type="button"
                data-builder-node-insert-top
                className={KIT.subtleButton}
                onClick={() => setInsertAt((current) => (current === 0 ? null : 0))}
              >
                Insert at top
              </button>
            </div>
          ) : null}
          {nodes.length > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
              <span className="text-[11px] font-medium text-stone-600">
                {selectedChildCount > 0
                  ? `${selectedChildCount} block${selectedChildCount === 1 ? "" : "s"} selected`
                  : "Select blocks for bulk actions"}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className={KIT.ghostButton}
                  onClick={
                    selectedChildCount === nodes.length
                      ? clearSelectedChildren
                      : selectAllChildren
                  }
                >
                  {selectedChildCount === nodes.length ? "Clear" : "Select all"}
                </button>
                <button
                  type="button"
                  className={KIT.subtleButton}
                  disabled={selectedChildCount === 0}
                  onClick={() => void duplicateSelectedChildren()}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className={KIT.subtleButton}
                  disabled={selectedChildCount === 0}
                  onClick={() => void removeSelectedChildren()}
                >
                  Remove
                </button>
              </span>
            </div>
          ) : null}
          {renderInsertPicker(0)}
          {nodes.length > 0 ? (
            <div className="flex flex-col gap-2">
              {nodes.map((child, index) => (
                <div key={child.id} className="flex flex-col gap-2">
                  {draggingNode && dropIndex === index ? (
                    <div
                      aria-hidden
                      className="h-0.5 rounded-full bg-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.14)]"
                    />
                  ) : null}
                  <div
                    draggable={nodes.length > 1}
                    onDragStart={handleDragStart(child.id, index)}
                    onDragOver={handleDragOver(index)}
                    onDrop={(event) => void handleDrop(event)}
                    onDragEnd={clearDragState}
                    className={
                      draggingNode?.nodeId === child.id
                        ? "rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 opacity-70"
                        : "rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2"
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div
                        aria-hidden
                        className="mt-0.5 inline-flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-[13px] font-semibold text-stone-500 active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        ⋮⋮
                      </div>
                      <label className="mt-0.5 inline-flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-indigo-600"
                          checked={selectedChildIds.has(child.id)}
                          onChange={() => toggleSelectedChild(child.id)}
                          aria-label={t("Select {label}").replace(
                            "{label}",
                            t(childPrimaryLabel(child)),
                          )}
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-stone-700">
                          {t(childPrimaryLabel(child))}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-snug text-stone-500">
                          {t(childSecondaryLabel(child))}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {extraActions ? extraActions(child, index) : null}
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => onSelect(child.id)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onCopy(child.id);
                          }}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onDuplicate(child.id);
                          }}
                        >
                          Duplicate
                        </button>
                        {copiedKind ? (
                          <button
                            type="button"
                            className={KIT.subtleButton}
                            onClick={() => {
                              void onPaste(child.id);
                            }}
                          >
                            Paste
                          </button>
                        ) : null}
                        {addKinds.length > 0 ? (
                          <button
                            type="button"
                            className={KIT.subtleButton}
                            onClick={() =>
                              setInsertAt((current) =>
                                current === index + 1 ? null : index + 1,
                              )
                            }
                          >
                            + After
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onMove(child.id, "up");
                          }}
                          disabled={index === 0}
                          title={
                            index === 0
                              ? "Already first, can't move up"
                              : "Move block up one position"
                          }
                          aria-label="Move block up"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onMove(child.id, "down");
                          }}
                          disabled={index === nodes.length - 1}
                          title={
                            index === nodes.length - 1
                              ? "Already last, can't move down"
                              : "Move block down one position"
                          }
                          aria-label="Move block down"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onRemove(child.id);
                          }}
                          disabled={canRemove ? !canRemove(child, index) : false}
                          title={
                            canRemove && !canRemove(child, index)
                              ? "This block can't be removed (required for this section)"
                              : "Remove block"
                          }
                          aria-label="Remove block"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                  {renderInsertPicker(index + 1)}
                </div>
              ))}
              {draggingNode ? (
                <div
                  aria-hidden
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDropIndex(nodes.length);
                  }}
                  onDrop={(event) => void handleDrop(event)}
                  className={
                    dropIndex === nodes.length
                      ? "h-2 rounded-full bg-indigo-500/80"
                      : "h-2 rounded-full bg-transparent"
                  }
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-stone-300 bg-[#faf9f6] px-3 py-3 text-[11.5px] text-stone-500">
              No nested blocks yet.
            </div>
          )}
          {addKinds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {addKinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={KIT.ghostButton}
                  onClick={() => {
                    void onAdd(kind);
                  }}
                >
                  + {t(BUILDER_NODE_REGISTRY[kind].label)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function formatPresetLabel(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function childCount(node: Exclude<BuilderNode, { kind: "section" }>): number {
  return childNodes(node).length;
}

function childNodes(node: Exclude<BuilderNode, { kind: "section" }>): BuilderNode[] {
  return "children" in node && Array.isArray(node.children) ? node.children : [];
}

function allowedChildKinds(
  node: Exclude<BuilderNode, { kind: "section" }>,
): BuilderNodeKind[] {
  const policy = BUILDER_NODE_REGISTRY[node.kind].children;
  return policy.type === "allow_list" ? [...policy.kinds] : [];
}

function childSummary(node: Exclude<BuilderNode, { kind: "section" }>): string {
  const children = childNodes(node);
  if (children.length === 0) {
    return "No nested blocks yet.";
  }
  return children
    .slice(0, 6)
    .map((child) => BUILDER_NODE_REGISTRY[child.kind].label)
    .join(" • ");
}

function contentHint(node: Exclude<BuilderNode, { kind: "section" }>): string {
  switch (node.kind) {
    case "container":
      return "This is a layout wrapper. Add, move, and edit nested blocks in Structure, then use Layout for grid/stack behavior.";
    case "split":
      return "This split owns its child blocks. Edit the copy and media inside the split from Structure; use Layout for ratio and collapse behavior.";
    case "accordion":
      return "Accordion groups do not hold direct copy. Select each accordion item in Structure to rename its question and edit nested content.";
    case "tabs":
      return "Tabs are defined by their panels. Select each tab panel in Structure to rename the tab and edit its nested content.";
    case "carousel":
      return "Carousel content comes from its nested blocks. Add slides or cards in Structure, then tune autoplay and controls in Layout.";
    case "masonry":
      return "Masonry content is managed through its child blocks. Add images or cards in Structure; columns and gap live in Layout.";
    case "card":
      return "Card blocks wrap heading, paragraph, image, and button children, not nested layout shells. Edit blocks in Structure; surface style in Layout.";
    case "cta_group":
      return "CTA groups hold buttons only. Add headline or body copy as sibling blocks outside this group (e.g. in a container). Row vs stack lives in Layout.";
    case "divider":
      return "Divider blocks render a horizontal rule. Use Layout to switch tone and Style for spacing.";
    case "spacer":
      return "Spacer blocks have no direct content. Use Layout to change their size and keep page rhythm tidy.";
    default:
      return BUILDER_NODE_REGISTRY[node.kind].description;
  }
}

function normalizeDataSourceLimit(value: number | undefined): 4 | 6 | 8 | 12 {
  if (value === 6 || value === 8 || value === 12) return value;
  return 4;
}

function dataSourceLabel(sourceKey: string): string {
  switch (sourceKey) {
    case "tenant_directory_search":
      return "Directory search shortcuts";
    case "featured_talent_profiles":
      return "Featured talent profiles";
    case "talent_locations":
      return "Talent locations";
    default:
      return sourceKey;
  }
}

function dataSourceHelper(sourceKey: string): string {
  switch (sourceKey) {
    case "tenant_directory_search":
      return "Uses this tenant's public taxonomy shortcuts to route visitors into the directory.";
    case "featured_talent_profiles":
      return "Uses this tenant's featured public roster cards, with the static cards as fallback.";
    case "talent_locations":
      return "Uses this tenant's public roster locations and talent counts.";
    default:
      return "This section uses a live data binding and keeps editable fallback blocks.";
  }
}

function childPrimaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "heading":
      return node.props.text;
    case "paragraph":
      return truncate(node.props.text, 72);
    case "rich_text":
      return truncate(node.props.text, 72);
    case "button":
      return node.props.label;
    case "image":
      return node.props.alt?.trim() || "Image block";
    case "icon":
      return node.props.label || BUILDER_NODE_REGISTRY[node.kind].label;
    case "accordion_item":
    case "tab_panel":
      return node.props.title;
    default:
      return BUILDER_NODE_REGISTRY[node.kind].label;
  }
}

function childSecondaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "social_post":
      // Name the network, not the generic kind: a page can carry several of
      // these and "Social post" three times over tells the operator nothing.
      return node.props.provider === "tiktok"
        ? "TikTok post"
        : "Instagram post";
    case "social_feed":
      return node.props.provider === "tiktok"
        ? "TikTok feed"
        : "Instagram feed";
    case "heading":
      return `Heading · H${node.props.level}`;
    case "paragraph":
      return "Paragraph block";
    case "rich_text":
      return "Rich text block";
    case "button":
      return node.props.href || "Button link";
    case "image":
      return node.props.src;
    case "video":
      return node.props.src;
    case "embed":
      return node.props.src;
    case "icon":
      return node.props.size ? `Icon · ${node.props.size.toUpperCase()}` : "Icon";
    case "pricing_table":
      return `${node.props.tiers.length} pricing tier${node.props.tiers.length === 1 ? "" : "s"}`;
    case "code":
      return "Raw HTML (sandboxed)";
    case "accordion_item":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "tab_panel":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "container":
    case "card":
    case "cta_group":
    case "split":
    case "accordion":
    case "tabs":
    case "carousel":
    case "masonry":
      return `${childNodes(node).length} nested block${childNodes(node).length === 1 ? "" : "s"}`;
    case "divider":
      return node.props.tone === "muted" ? "Divider · muted" : "Divider";
    case "spacer":
      return `Spacer · ${node.props.size.toUpperCase()}`;
    case "nav":
      return node.props.dataBinding?.sourceKey === "cms_page"
        ? "Navigation · from site pages"
        : node.props.dataBinding?.sourceKey === "cms_posts"
          ? "Navigation · from blog posts"
          : `Navigation · ${node.props.links.length} link${node.props.links.length === 1 ? "" : "s"}`;
    case "social_links":
      return node.props.dataBinding?.sourceKey === "workspace_social_links"
        ? "Social links · synced"
        : `Social links · ${node.props.links.length} link${node.props.links.length === 1 ? "" : "s"}`;
    case "form":
      return `Form · ${node.props.fields.length} field${node.props.fields.length === 1 ? "" : "s"}`;
    case "section":
      return BUILDER_NODE_REGISTRY[node.kind].description;
    case "section_embed":
      return `Tulala component · ${node.props.sectionTypeKey}`;
    // WS7 Phase 0 — native data blocks. Name the SOURCE, not the kind (see the
    // matching branch in canvas-node-children-panel.tsx).
    case "hero_search":
      return node.props.statSource === "tenant_talent_count"
        ? "Search hero · live talent count"
        : "Search hero";
    case "menu_board":
      return "Menu · orderable items";
    case "reserve_table":
      return "Reserve · books a real table";
    case "session_picker":
      return "Sessions · book a seat";
    case "ticket_picker":
      return "Tickets · buy for a night";
    case "qr_code":
      return "QR code · a scannable link";
    case "talent_type_grid":
      return node.props.mode === "dynamic"
        ? "Disciplines · from your roster"
        : `Disciplines · ${node.props.items?.length ?? 0} card${
            (node.props.items?.length ?? 0) === 1 ? "" : "s"
          }`;
    // BUILDER 2027 P2A - the subtitle for these twelve is shared with the OTHER
    // surface that renders this row, so the two can never drift apart. Listed as
    // explicit cases rather than a default so the switch stays exhaustive and a
    // thirteenth kind still fails to compile until it is named here.
    case "marquee":
    case "directory":
    case "featured_talent":
    case "location_map":
    case "header_search":
    case "header_account":
    case "header_inquiry":
    case "header_language":
    case "sticky_scroll":
    case "reveal":
    case "stats":
    case "before_after":
      return (
        builder2027SecondaryLabel(node) ?? BUILDER_NODE_REGISTRY[node.kind].label
      );
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function BuilderNodeRichTextField({
  value,
  tenantId,
  variant,
  ariaLabel,
  className,
  onCommit,
  allowEmpty = false,
}: {
  value: string;
  tenantId: string;
  variant: "single" | "multi";
  ariaLabel: string;
  className: string;
  onCommit: (next: string) => Promise<void>;
  /** WS5 — secondary-locale fields may be cleared back to empty (removes the
   *  overlay key). The base/default field keeps `false` (non-empty required). */
  allowEmpty?: boolean;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const next = draft.trim();
    // allowEmpty lets a cleared secondary translation persist (next === "" but
    // value !== "" → commit the clear). The default field still no-ops on empty.
    if ((!allowEmpty && !next) || next === value) return;
    const timer = window.setTimeout(() => {
      void onCommit(draft);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, onCommit, value, allowEmpty]);

  return (
    <RichEditor
      value={draft}
      onChange={setDraft}
      variant={variant}
      tenantId={tenantId}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}

// ── WS5: per-element inline translation ───────────────────────────────────────
// `LocalizableTextField` wraps a localizable text prop with the EN/ES(/FR…) tab
// strip. Single-language tenants render the plain field (no strip). Each tab
// edits its locale: the default tab writes the node's base prop; a secondary tab
// writes `node.i18n[locale][prop]`. All writes flow through the same
// `patchBuilderNodeProps` autosave as every other field edit.

type LocalizableFieldKind = "rich-single" | "rich-multi" | "input" | "textarea";

/**
 * Exported for the BUILDER 2027 · P2A inspector, which drives twelve kinds from
 * one schema rather than twelve hand-written panels. It is INJECTED there as a
 * prop rather than imported, so the two modules never form a cycle;
 * re-implementing the per-locale overlay plumbing would fork the one place
 * translation writes are handled, which is how a Spanish form ships in English.
 */
export function BuilderNodeLocalizableTextField({
  node,
  prop,
  tenantId,
  fieldKind,
  baseValue,
  ariaLabel,
  className,
  placeholder,
  onCommitBase,
  patch,
}: {
  node: Exclude<BuilderNode, { kind: "section" }>;
  prop: string;
  tenantId: string;
  fieldKind: LocalizableFieldKind;
  /** The node's base (default-locale) value for this prop. */
  baseValue: string;
  ariaLabel: string;
  className: string;
  placeholder?: string;
  /** Commit a new base (default-locale) value — the panel's existing handler. */
  onCommitBase: (next: string) => void | Promise<void>;
  /** Raw prop patcher (used to write the `i18n` overlay for secondary locales). */
  patch: (patch: Record<string, unknown>) => void | Promise<void>;
}) {
  const { availableLocales, defaultLocale } = useEditContext();
  const { locale: activeContentLocale } = useActiveContentLocale();

  const overlay = node.i18n;
  const supported = availableLocales.length > 0 ? availableLocales : [defaultLocale];

  // Value for a given locale: default → base prop; secondary → overlay entry.
  const valueForLocale = (locale: string): string => {
    if (locale === defaultLocale) return baseValue;
    return overlay?.[locale]?.[prop] ?? "";
  };
  const hasValueForLocale = (locale: string): boolean => {
    if (locale === defaultLocale) return baseValue.trim().length > 0;
    return overlayHasProp(overlay, locale, prop);
  };

  // Commit for a given locale: default → onCommitBase; secondary → patch overlay.
  const commitForLocale = (locale: string) => async (next: string) => {
    if (locale === defaultLocale) {
      await onCommitBase(next);
      return;
    }
    const current = overlay?.[locale]?.[prop] ?? "";
    if (next.trim() === current.trim()) return;
    const nextOverlay = setOverlayProp(overlay, locale, prop, next);
    await patch({ i18n: nextOverlay });
  };

  const renderField = (locale: string, isDefault: boolean) => {
    // Re-mount the field whenever the active locale OR its stored value changes,
    // so the editor's internal draft re-seeds (RichEditor + uncontrolled inputs).
    const fieldValue = valueForLocale(locale);
    const fieldKey = `${node.id}:${prop}:${locale}:${fieldValue}`;
    const commit = commitForLocale(locale);
    if (fieldKind === "rich-single" || fieldKind === "rich-multi") {
      return (
        <BuilderNodeRichTextField
          key={fieldKey}
          value={fieldValue}
          tenantId={tenantId}
          variant={fieldKind === "rich-single" ? "single" : "multi"}
          ariaLabel={`${ariaLabel}${isDefault ? "" : ` (${locale})`}`}
          className={className}
          allowEmpty={!isDefault}
          onCommit={commit}
        />
      );
    }
    if (fieldKind === "textarea") {
      return (
        <textarea
          key={fieldKey}
          defaultValue={fieldValue}
          className={className}
          placeholder={placeholder}
          aria-label={`${ariaLabel}${isDefault ? "" : ` (${locale})`}`}
          onBlur={(event) => {
            void commit(event.currentTarget.value);
          }}
        />
      );
    }
    return (
      <input
        key={fieldKey}
        defaultValue={fieldValue}
        className={className}
        placeholder={placeholder}
        aria-label={`${ariaLabel}${isDefault ? "" : ` (${locale})`}`}
        onBlur={(event) => {
          void commit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          void commit(event.currentTarget.value);
          event.currentTarget.blur();
        }}
      />
    );
  };

  // Single-language tenant → no tab strip, plain field on the default locale.
  if (supported.length <= 1) {
    return renderField(defaultLocale, true);
  }

  return (
    <LocaleFieldTabs
      supportedLocales={supported}
      defaultLocale={defaultLocale}
      activeContentLocale={activeContentLocale}
      hasValueForLocale={hasValueForLocale}
      renderField={renderField}
      ariaLabel={`${ariaLabel} language`}
    />
  );
}

// ── C3 — Content-tab "Variant" control ────────────────────────────────────────

/**
 * Curated, meaningful variants per node kind (the `applyNativeVariant` presets
 * the gallery offers). "default" leads each list (the clean baseline). Only kinds
 * with >1 entry render the Content-tab "Variant" segmented control.
 */
const VARIANTS_BY_KIND: Partial<
  Record<BuilderNodeKind, ReadonlyArray<AddGalleryNativeVariant>>
> = {
  heading: ["default", "title", "subtitle"],
  paragraph: ["default", "intro", "caption", "quote"],
  button: ["default", "text-link", "icon-button", "download-link"],
  container: ["default", "stack", "row", "grid", "card-group"],
  image: ["default", "cover-image", "logo"],
  card: [
    "default",
    "image-card",
    "icon-card",
    "profile-card",
    "service-card",
    "testimonial-card",
    "cta-card",
  ],
};

/** Human label for a variant value in the segmented control. */
function variantLabel(v: AddGalleryNativeVariant): string {
  if (v === "default") return "Default";
  return v
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The props a variant CHANGES versus the kind's clean default — computed by
 * applying the variant to a fresh default node and keeping only the keys whose
 * value differs. Demo CONTENT keys are excluded so re-picking a variant restyles
 * the node without clobbering the tenant's copy. Empty ⇒ nothing to re-apply.
 */
const VARIANT_CONTENT_KEYS: ReadonlySet<string> = new Set([
  "text",
  "label",
  "links",
  "alt",
  "href",
]);

function variantStyleProps(
  kind: BuilderNodeKind,
  variant: AddGalleryNativeVariant,
): Record<string, unknown> {
  const baseProps = (createBuilderNode(kind).props ?? {}) as Record<string, unknown>;
  const stub = { id: "variant-probe", kind, props: {} } as unknown as BuilderNode;
  const variantProps = (applyNativeVariant(stub, variant).props ?? {}) as Record<
    string,
    unknown
  >;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(variantProps)) {
    if (VARIANT_CONTENT_KEYS.has(key)) continue;
    if (JSON.stringify(variantProps[key]) === JSON.stringify(baseProps[key])) continue;
    out[key] = variantProps[key];
  }
  return out;
}

/**
 * "Variant" segmented control. Picking a variant re-applies that variant's
 * styling/structural props (content preserved) through `commitPatch`, and records
 * `nativeVariant` so the choice persists + the active pill reflects it.
 */
function VariantPicker({
  node,
  commitPatch,
}: {
  node: BuilderNode;
  commitPatch: (patch: Record<string, unknown>) => void;
}) {
  const options = VARIANTS_BY_KIND[node.kind];
  if (!options || options.length < 2) return null;
  const current =
    ((node.props as { nativeVariant?: string } | undefined)?.nativeVariant as
      | AddGalleryNativeVariant
      | undefined) ?? "default";
  const value = options.includes(current) ? current : "default";
  // Mockup annotation G — "Variant" was a five-word grey Segmented strip. It is
  // the single biggest decision in this tab and it now looks like one: picture
  // cards naming a layout INTENT, not a developer's word for a props patch.
  return (
    <VariantIntentCards
      label="Layout intent"
      hint="Restyles to a preset look, your content stays."
      options={options.map((v) => ({ id: v, label: variantLabel(v) }))}
      value={value}
      onChange={(next) => {
        const variant = next as AddGalleryNativeVariant;
        const styleProps = variantStyleProps(node.kind, variant);
        commitPatch({
          ...styleProps,
          nativeVariant: variant === "default" ? undefined : variant,
        });
      }}
    />
  );
}
