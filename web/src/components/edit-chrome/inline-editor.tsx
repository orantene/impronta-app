"use client";

/**
 * InlineEditor — canvas-native text + image edits for the selected section.
 *
 * Two gestures, both scoped to whichever section is currently selected:
 *
 *   1. Double-click a text node → mount a `<CanvasEditOverlay>` over the
 *      element. The overlay hosts the same `RichEditor` primitive used by
 *      the inspector — same toolbar, same marker round-trip, same
 *      brand-accent token, same Cmd-B / Cmd-I / Cmd-K shortcuts. On
 *      Enter / outside-click / blur / Escape the overlay commits via
 *      `findPathByValue` against the active section's draft props (the
 *      inspector's autosave loop does the round-trip + CAS +
 *      router.refresh()). W1-L3 — Escape now COMMITS (keeps the typed text,
 *      undoable via ⌘Z) instead of silently discarding; on a server-rendered
 *      canvas every commit also optimistically repaints the target element so
 *      the edit is visible immediately, not after the deferred refresh.
 *
 *   2. Hover an `<img>` → a floating "Replace" pill appears near the top-
 *      right of the image. Click it → the media picker drawer opens. On pick we
 *      match the <img>'s `src` back to a prop path the same way, and
 *      rewrite it to the new public URL.
 *
 * The "match value → path" heuristic avoids having to thread `data-cms-field`
 * annotations through every section renderer; tolerable because section
 * props within a single section are usually small + text values don't
 * collide in practice. We fail loudly rather than silently writing to the
 * wrong field.
 *
 * Phase C.1 — the legacy contenteditable + raw-marker toolbar that used to
 * live here was replaced in-place with the `RichEditor` primitive
 * (`./rich-editor/CanvasEditOverlay`). The marker grammar, the public
 * render path (`shared/rich-text.tsx`), and the path-by-value commit
 * mechanism are unchanged. Operators now see live styling (italic blush
 * for accent, semantic bold/italic, real anchor styling for links) while
 * editing on the canvas instead of `{accent}…{/accent}` raw markers.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useEditContext } from "./edit-context";
import { resolveHoverAttributedNodeId } from "./canvas-hover-attribution";
import { useCanvasHelpers } from "./canvas-helpers-mode";
import {
  InlineReplaceImagePill,
  InlineTextHintPill,
} from "./inline-hover-pills";
import { useBuilderTree } from "./builder-tree-bridge";
import { useDraftProps } from "./draft-props-bridge";
import { useSelectedSectionId } from "./selection-bridge";
import { MediaPickerDrawer, type MediaPickedItem } from "./media-picker-drawer";
import { findPathByValue, setByPath } from "@/lib/site-admin/edit-mode/prop-path";
import { CanvasEditOverlay } from "./rich-editor";
import { flushCanvasTextStylePatches } from "./canvas-lexical-bridge";
import { useInlineEditorSlashCommand } from "./use-inline-editor-slash-command";
import { isAnyBuilderNodeCanvasMounted } from "./client-builder-canvas-bridge";
import { applyOptimisticInlineRepaint } from "./inline-editor-repaint";
import { useInlineEditorCommitHandoff } from "./use-inline-editor-commit-handoff";
import { dismissCoachmark } from "./builder-coachmarks";
import {
  buildInlineImageReplacePatch,
  findBuilderNodeById,
  resolveBuilderNodeTextValue,
  resolveEditableBuilderNodeImageTarget,
  resolveEditableBuilderNodeTextTarget,
  resolveSectionEmbedConfigTextValue,
} from "./inline-editor-builder-resolvers";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { useActiveContentLocale } from "./active-content-locale-bridge";
import {
  useInlineTextCommit,
  type InlineBuilderNodeTextTarget,
} from "./use-inline-text-commit";
import { resolveLegacySectionArming } from "./inline-text-arming";

type Banner =
  | { kind: "none" }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

interface ActiveTextEdit {
  el: HTMLElement;
  original: string;
  variant: "single" | "multi";
  resyncKey?: number;
  /** WAVE 2.1 — viewport point of the opening double-click, for the caret. */
  caretPoint?: { x: number; y: number } | null;
  /** W1-L3 — shape shared with the extracted commit hook (locale semantics
   *  documented on `InlineBuilderNodeTextTarget`). */
  builderNode?: InlineBuilderNodeTextTarget;
}

interface TargetImageEdit {
  img: HTMLImageElement;
  builderNodeId?: string;
}

const SINGLE_LINE_TAGS = new Set([
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "SPAN",
  "A",
  "STRONG",
  "EM",
  "SMALL",
]);

export function InlineEditor() {
  const {
    tenantId,
    defaultLocale,
    patchBuilderNodeProps,
    reportMutationError,
    selectBuilderNode,
    setDraftProps,
    setDirty,
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
  } = useEditContext();
  // WS2 — tree VALUE from the micro-store (builder-tree-bridge).
  const builderTree = useBuilderTree();
  // Wave 3 (3.1) — `draftProps` VALUE from the draft-props-bridge micro-store
  // (setter stays on context). Only mirrored into `draftPropsRef` below for the
  // long-lived DOM handlers, exactly as before.
  const draftProps = useDraftProps();
  // W2 (selection-bridge) — selected-section VALUE from the micro-store.
  const selectedSectionId = useSelectedSectionId();
  // Topbar (i) switch — hides the pills, never the gestures.
  const { helpers: canvasHelpers } = useCanvasHelpers();

  const [mediaOpen, setMediaOpen] = useState(false);
  const targetImgRef = useRef<TargetImageEdit | null>(null);
  const [imgHover, setImgHover] = useState<{
    img: HTMLImageElement;
    rect: DOMRect;
    /** The block the image belongs to — declared on the "Replace image" pill. */
    nodeId: string | null;
  } | null>(null);
  // Mirror of `imgHover.nodeId` for the pointermove listener, which is
  // subscribed once ([] deps) and so cannot read the state. Its only writer is
  // that same listener.
  const imgHoverNodeRef = useRef<string | null>(null);
  const [textHover, setTextHover] = useState<{
    el: HTMLElement;
    rect: DOMRect;
  } | null>(null);
  const [banner, setBanner] = useState<Banner>({ kind: "none" });
  // Phase C.1 — active canvas-edit overlay. The overlay (RichEditor +
  // floating toolbar) is rendered when this is non-null.
  const [activeEdit, setActiveEdit] = useState<ActiveTextEdit | null>(null);
  const builderTreeRef = useRef(builderTree);
  useEffect(() => {
    builderTreeRef.current = builderTree;
  }, [builderTree]);

  // WS5 — the in-session content locale (top-header toggle). The canvas dims
  // untranslated nodes for this locale; inline canvas authoring must write to
  // the SAME locale (Behavior 3): typing on a fallback node while a secondary
  // locale is active writes `node.i18n[locale][prop]`, not the base prop. The
  // live `dblclick` / commit handlers run from a long-lived effect / overlay
  // callback, so they read the locale through a ref to dodge stale closures.
  const activeContentLocale = useActiveContentLocale();
  const activeContentLocaleRef = useRef(activeContentLocale);
  useEffect(() => {
    activeContentLocaleRef.current = activeContentLocale;
  }, [activeContentLocale]);

  // Auto-dismiss info/error banners after 4s.
  useEffect(() => {
    if (banner.kind === "none") return;
    const t = setTimeout(() => setBanner({ kind: "none" }), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  // ── refs so stale closures don't break our live DOM handlers ──
  const draftPropsRef = useRef(draftProps);
  useEffect(() => {
    draftPropsRef.current = draftProps;
  }, [draftProps]);
  const selectedIdRef = useRef(selectedSectionId);
  useEffect(() => {
    selectedIdRef.current = selectedSectionId;
  }, [selectedSectionId]);

  // ── text commit helpers (W1-L3 — extracted to use-inline-text-commit.ts) ──
  // Both return whether the edit was actually APPLIED, so `endActiveEdit` can
  // trigger the optimistic canvas repaint only when something really changed.
  const { commitText, commitBuilderNodeText } = useInlineTextCommit({
    draftPropsRef,
    builderTreeRef,
    defaultLocale,
    patchBuilderNodeProps,
    reportMutationError,
    setBanner,
    setDraftProps,
    setDirty,
  });

  // ── text editing driver ──────────────────────────────────────────────
  useEffect(() => {
    function findEditableTextEl(start: HTMLElement): HTMLElement | null {
      // Walk up from the event target to the first element that contains a
      // direct text node (and is inside the selected section). We allow any
      // of h1-h6, p, span, a, li, blockquote, strong, em, small — basically
      // anything whose text content is meant to be human-authored copy.
      const ALLOW = new Set([
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "P",
        "SPAN",
        "A",
        "LI",
        "BLOCKQUOTE",
        "STRONG",
        "EM",
        "SMALL",
        "DIV",
      ]);
      let el: HTMLElement | null = start;
      while (el && !el.hasAttribute("data-cms-section")) {
        if (ALLOW.has(el.tagName)) {
          // prefer the smallest leaf with directly-attached text
          const hasOwnText = Array.from(el.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
          );
          if (hasOwnText) return el;
          // Rich-text headings/paragraphs render copy in child spans only.
          if (
            (/^H[1-6]$/.test(el.tagName) || el.tagName === "P") &&
            (el.textContent ?? "").trim()
          ) {
            return el;
          }
        }
        el = el.parentElement;
      }
      return null;
    }

    function onDblClick(e: MouseEvent) {
      if (!(e.target instanceof HTMLElement)) return;

      // Don't re-engage an already-editing element.
      if (e.target.closest('[data-edit-overlay="canvas-edit"]')) return;

      // Images have their own path.
      if (e.target.tagName === "IMG") return;

      const editable = findEditableTextEl(e.target);
      if (!editable) return;

      // #16: prefer the stored prop value for builder nodes — it carries rich
      // marker syntax (bold/italic/links) that the RichEditor understands,
      // while textContent would strip all markers to plain text.
      const builderNodeTarget = resolveEditableBuilderNodeTextTarget(
        builderTreeRef.current,
        editable,
      );

      // ── Freeform builder-node text — the primary path for 2026 full-page
      // designs. These patch DIRECTLY via patchBuilderNodeProps (keyed by node
      // id), so they need NEITHER a wrapping `[data-cms-section]` element NOR
      // section-selection alignment. Full-page freeform designs have builder
      // nodes with no parent CMS section (`sectionIdByBuilderNodeId` is empty →
      // `selectedSectionId` stays null), so the legacy section gate below would
      // reject EVERY freeform text node and the canvas WYSIWYG (bold / italic /
      // colour / link toolbar) would never appear on double-click. Resolve and
      // open the overlay here, before that gate. ──
      if (builderNodeTarget) {
        // WS5 — the locale this edit authors = the active content locale at
        // open-time. The seed value (and the undo/redo resync) honor it: the
        // default locale reads the base prop, a secondary locale reads its
        // overlay entry (falling back to the base copy when untranslated).
        const editLocale = activeContentLocaleRef.current.locale;
        const editDefaultLocale = activeContentLocaleRef.current.defaultLocale;
        // Resolve the stored value BEFORE the empty check so a heading that
        // contains only styled spans (empty DOM text) doesn't block.
        const storedValue = builderNodeTarget.sectionEmbedConfigKey
          ? resolveSectionEmbedConfigTextValue(
              builderTreeRef.current,
              builderNodeTarget.id,
              builderNodeTarget.sectionEmbedConfigKey,
            )
          : resolveBuilderNodeLocalizedSeed(
              builderTreeRef.current,
              builderNodeTarget.id,
              builderNodeTarget.propKey,
              editLocale,
              editDefaultLocale,
            );
        const original =
          storedValue !== null
            ? storedValue
            : (editable.textContent ?? "").trim();
        if (!original) return;
        e.preventDefault();
        e.stopPropagation();
        selectBuilderNode(builderNodeTarget.id);
        // The operator just performed the exact gesture the "double-click any
        // text to edit it inline" coachmark teaches — dismiss it now so it
        // doesn't dangle near the text once the edit overlay opens over it
        // (P2 chrome hygiene: see builder-coachmark-tip.tsx's live-dismiss sub).
        dismissCoachmark("double-click-edit");
        setActiveEdit({
          el: editable,
          original,
          variant: builderNodeTarget.variant,
          caretPoint: { x: e.clientX, y: e.clientY },
          builderNode: {
            id: builderNodeTarget.id,
            propKey: builderNodeTarget.propKey,
            // section_embed config edits stay base-only (no per-element overlay).
            locale: builderNodeTarget.sectionEmbedConfigKey
              ? editDefaultLocale
              : editLocale,
            sectionEmbedConfigKey: builderNodeTarget.sectionEmbedConfigKey,
          },
        });
        return;
      }

      // ── Legacy CMS-section text — writes go through `draftProps` keyed by
      // the currently-loaded section. WAVE 2.1: arming no longer waits for the
      // selection to settle OR for the inspector to finish loading those props.
      // Both used to be hard gates here, and both only become true as a
      // consequence of the operator's own click, so the FIRST double-click on a
      // section armed nothing and every keystroke after it was dropped. The
      // commit path (`runCommitText`) resolves the field by matching the
      // original string against the loaded tree and fails LOUDLY when it can't,
      // so readiness is a commit-time concern, not an open-time one. See
      // `inline-text-arming.ts`. ──
      const sectionEl = e.target.closest<HTMLElement>("[data-cms-section]");
      if (!sectionEl) return;
      const sectionId = sectionEl.getAttribute("data-section-id");
      const original = (editable.textContent ?? "").trim();
      const arming = resolveLegacySectionArming({
        sectionId,
        originalText: original,
        draftPropsLoaded: draftPropsRef.current !== null,
        selectedSectionId: selectedIdRef.current,
      });
      if (!arming.arm) return;
      e.preventDefault();
      e.stopPropagation();
      const variant: "single" | "multi" = SINGLE_LINE_TAGS.has(editable.tagName)
        ? "single"
        : "multi";
      // Same gesture-taught dismiss as the freeform builder-node path above.
      dismissCoachmark("double-click-edit");
      setActiveEdit({
        el: editable,
        original,
        variant,
        caretPoint: { x: e.clientX, y: e.clientY },
      });
    }

    document.addEventListener("dblclick", onDblClick, true);
    return () => {
      document.removeEventListener("dblclick", onDblClick, true);
    };
  }, [selectBuilderNode]);

  // QA 2026-05-13 — wrapped in useCallback so child surfaces that memoize
  // `onCommit` don't capture a stale closure between double-click and blur. Deps
  // include `activeEdit` since the body reads it; both commit fns are stable
  // across renders. W1-L3 — `commit` is always true from current callers (blur /
  // Enter / Escape all commit); the param is kept for the general contract.
  const endActiveEdit = useCallback(
    async (commit: boolean, next?: string): Promise<void> => {
      if (!activeEdit) return;
      void flushCanvasTextStylePatches();
      if (commit && next !== undefined) {
        let applied = false;
        if (activeEdit.builderNode) {
          // CANVAS-7B — AWAIT the node-history commit so the undo-handoff can
          // guarantee the typed text is in `past` before a node-level undo.
          applied = await commitBuilderNodeText(
            activeEdit.builderNode,
            activeEdit.original,
            next,
          );
        } else {
          applied = commitText(activeEdit.original, next);
        }
        // W1-L3 — OPTIMISTIC REPAINT. On the default (flag-off) freeform surface
        // the visible canvas is SERVER-rendered and reads neither the live client
        // tree nor the canvas bridge, so a committed edit would show stale text
        // until the deferred save-time `router.refresh()` (the "edit vanished"
        // report). When no client canvas is mounted, write the committed value
        // into the target element we already hold; the later refresh reconciles
        // the identical text (the element carries `suppressHydrationWarning`). A
        // client-canvas-mounted surface repaints via the tree bridge, so we skip
        // the manual write there to avoid fighting React.
        if (applied && !isAnyBuilderNodeCanvasMounted()) {
          applyOptimisticInlineRepaint(activeEdit.el, next, {
            rich: !activeEdit.builderNode?.sectionEmbedConfigKey,
          });
        }
      }
      setActiveEdit(null);
    },
    [activeEdit, commitBuilderNodeText, commitText],
  );

  const { runCommit, overlayCommitRef } = useInlineEditorCommitHandoff({
    isEditing: activeEdit !== null, // CANVAS-7B inline→node-history commit handoff
    endActiveEdit,
  });

  // Lane E (2026) — "/" insert menu while editing a freeform builder-node's
  // text (the primary 2026 full-page path). Extracted to its own hook (max-
  // lines budget) — see its header doc for the gating + anchor rationale.
  const slashCommandInsert = useInlineEditorSlashCommand({
    target: activeEdit?.builderNode,
    builderTree,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
    insertBuilderNode,
    insertBuilderSectionEmbed,
    insertBuilderComponent,
    reportMutationError,
    selectBuilderNode,
  });

  // Undo/redo while inline edit is open — remount the overlay from stored copy.
  // WS5 — for a secondary-locale edit the stored copy is the overlay entry, so
  // re-seed through the same locale-aware resolver the open-time path uses.
  useEffect(() => {
    if (!activeEdit?.builderNode) return;
    const stored = activeEdit.builderNode.sectionEmbedConfigKey
      ? resolveSectionEmbedConfigTextValue(
          builderTree,
          activeEdit.builderNode.id,
          activeEdit.builderNode.sectionEmbedConfigKey,
        )
      : resolveBuilderNodeLocalizedSeed(
          builderTree,
          activeEdit.builderNode.id,
          activeEdit.builderNode.propKey,
          activeEdit.builderNode.locale,
          activeContentLocaleRef.current.defaultLocale,
        );
    if (stored === null) return;
    setActiveEdit((prev) => {
      if (!prev?.builderNode) return prev;
      if (stored === prev.original) return prev;
      return {
        ...prev,
        original: stored,
        resyncKey: (prev.resyncKey ?? 0) + 1,
      };
    });
  }, [
    builderTree,
    activeEdit?.builderNode?.id,
    activeEdit?.builderNode?.propKey,
    activeEdit?.builderNode?.locale,
  ]);

  // ── image hover + replace driver + text hover hint driver ────────────
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!(e.target instanceof HTMLElement)) return;

      // Reaching for the "Replace image" pill is not leaving the image. The
      // pill is pointer-events: auto and lives in the overlay layer, so the
      // section/img lookups below saw "no image here" and unmounted it out
      // from under the pointer. An affordance that DECLARES its owner block is
      // part of that block (canvas-hover-attribution.ts) — hold the hover.
      const pillOwner = resolveHoverAttributedNodeId(e.target);
      if (pillOwner !== null && pillOwner === imgHoverNodeRef.current) return;

      // ── image hover (existing) — scoped to selected CMS sections ─────
      const sectionEl = e.target.closest<HTMLElement>("[data-cms-section]");
      const sectionId = sectionEl?.getAttribute("data-section-id") ?? null;
      const inSelectedSection =
        sectionEl !== null &&
        sectionId !== null &&
        sectionId === selectedIdRef.current;

      if (!inSelectedSection) {
        imgHoverNodeRef.current = null;
        setImgHover(null);
      } else {
        const img =
          e.target instanceof HTMLImageElement
            ? e.target
            : (e.target.closest("img") as HTMLImageElement | null);
        if (img && sectionEl!.contains(img)) {
          const nodeId =
            img
              .closest<HTMLElement>("[data-builder-node-id]")
              ?.getAttribute("data-builder-node-id") ?? null;
          imgHoverNodeRef.current = nodeId;
          setImgHover({ img, rect: img.getBoundingClientRect(), nodeId });
          // Image takes priority — suppress text hint while on an image.
          setTextHover(null);
          return;
        }
        imgHoverNodeRef.current = null;
        setImgHover(null);
      }

      // ── text hover hint (new) ─────────────────────────────────────────
      // Resolve the nearest editable text target using the same helper the
      // dblclick handler uses. This covers BOTH freeform builder nodes (no
      // `[data-cms-section]` wrapper — the primary 2026 full-page path) and
      // legacy CMS-section text. The hint is purely informational; clicking
      // or double-clicking the element below is unaffected.
      const textTarget = resolveEditableBuilderNodeTextTarget(
        builderTreeRef.current,
        e.target,
      );
      if (textTarget) {
        // Anchor to the builder-node container for a stable bounding rect,
        // falling back to the hovered element itself.
        const nodeEl =
          e.target.closest<HTMLElement>("[data-builder-node-id]") ??
          e.target;
        setTextHover({ el: nodeEl, rect: nodeEl.getBoundingClientRect() });
      } else {
        setTextHover(null);
      }
    }
    function onScrollOrResize() {
      setImgHover((cur) =>
        cur
          ? { img: cur.img, rect: cur.img.getBoundingClientRect(), nodeId: cur.nodeId }
          : cur,
      );
      setTextHover((cur) =>
        cur ? { el: cur.el, rect: cur.el.getBoundingClientRect() } : cur,
      );
    }
    document.addEventListener("pointermove", onPointerMove);
    window.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScrollOrResize, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  const handleReplaceClick = (img: HTMLImageElement) => {
    const imageTarget = resolveEditableBuilderNodeImageTarget(
      builderTreeRef.current,
      img,
    );
    if (imageTarget) {
      selectBuilderNode(imageTarget.id);
    }
    targetImgRef.current = imageTarget
      ? { img, builderNodeId: imageTarget.id }
      : { img };
    setMediaOpen(true);
  };

  const handleImagePicked = useCallback(
    (item: MediaPickedItem) => {
      const target = targetImgRef.current;
      const publicUrl = item.publicUrl;
      setMediaOpen(false);
      if (!target) return;
      if (target.builderNodeId) {
        // D1 fix: patch `mediaId` alongside `src` so the published renderer
        // (which prefers `dataSources.mediaAssets` resolved via `mediaId`,
        // see builder-node/render.tsx's "image" case) picks up the
        // replacement too — not just the editor's optimistic `src` preview.
        // Patching `src` alone left the two out of sync: the editor showed
        // the new image (draft `src`) while the published page kept
        // resolving the OLD `mediaId` back to the original asset's URL.
        void patchBuilderNodeProps(
          target.builderNodeId,
          buildInlineImageReplacePatch(item),
        ).then((result) => {
          if (!result.ok) {
            const text =
              result.error ?? "Couldn't replace this image. Try the inspector.";
            reportMutationError(text);
            setBanner({ kind: "error", text });
          }
        });
        targetImgRef.current = null;
        return;
      }
      const { img } = target;
      const tree = draftPropsRef.current;
      if (!tree) return;
      const originalSrc = img.getAttribute("src") ?? "";
      // Next.js <Image> can rewrite src via /_next/image?url=...&w=...
      // Try to recover the real source URL from the query if so.
      const cleaned = resolveOriginalImageSrc(originalSrc);
      const hit =
        findPathByValue(tree, cleaned) ?? findPathByValue(tree, originalSrc);
      if (!hit) {
        setBanner({
          kind: "error",
          text: "Couldn't match this image to a field. Replace it from the inspector.",
        });
        return;
      }
      if (hit.occurrences > 1) {
        setBanner({
          kind: "error",
          text: "This image URL appears more than once in this section. Replace it from the inspector.",
        });
        return;
      }
      const updated = setByPath(tree, hit.path, publicUrl);
      setDraftProps(updated);
      setDirty(true);
      targetImgRef.current = null;
    },
    [patchBuilderNodeProps, reportMutationError, setDraftProps, setDirty],
  );

  // Only render the hover pill when a section is selected and we're hovering
  // an image inside it. The dialog itself is independent of hover.
  const showImgHint =
    canvasHelpers && selectedSectionId !== null && imgHover !== null && !mediaOpen;

  // Show the text hint when hovering an editable text node, but not while an
  // edit overlay is already open (that would be distracting).
  const showTextHint =
    canvasHelpers && textHover !== null && activeEdit === null && !mediaOpen;

  return (
    <>
      {/* Hover pills anchor BESIDE the hovered box, never over it — see
          inline-hover-pills.tsx for the placement rules and the bug they fix. */}
      <InlineTextHintPill show={showTextHint} rect={textHover?.rect ?? null} />
      <InlineReplaceImagePill
        show={showImgHint}
        rect={imgHover?.rect ?? null}
        nodeId={imgHover?.nodeId ?? null}
        onReplace={() => {
          if (imgHover) handleReplaceClick(imgHover.img);
        }}
      />

      {banner.kind !== "none" ? (
        <div
          data-edit-overlay="inline-banner"
          style={{
            position: "fixed",
            top: 64,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 118,
          }}
          className={`pointer-events-auto rounded-md px-3 py-2 text-xs font-medium shadow-lg ${
            banner.kind === "error"
              ? "bg-rose-50 text-rose-800 border border-rose-200"
              : "bg-violet-600 text-white"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {activeEdit ? (
        <CanvasEditOverlay
          target={activeEdit.el}
          initialValue={activeEdit.original}
          resyncKey={activeEdit.resyncKey}
          variant={activeEdit.variant}
          caretPoint={activeEdit.caretPoint ?? null}
          tenantId={tenantId ?? undefined}
          commitRef={overlayCommitRef}
          onCommit={(next) => runCommit(next)}
          slashCommandInsert={slashCommandInsert}
        />
      ) : null}

      {/* Was MediaPickerDialog — a 27-line alias whose only job was to pass
          this title. Folded into the drawer it always rendered (2026-08-16). */}
      <MediaPickerDrawer
        tenantId={tenantId ?? ""}
        open={mediaOpen}
        title="Replace image"
        // All logic lives in `onPickItem` (needs the asset id for `mediaId`,
        // see the D1 fix above). `onPick` still fires on every pick — the
        // drawer calls both unconditionally — so it stays a no-op to avoid a
        // second, duplicate patch.
        onPick={() => {}}
        onPickItem={handleImagePicked}
        onClose={() => setMediaOpen(false)}
      />
    </>
  );
}

/**
 * WS5 — the value to SEED the inline overlay with for a localizable node prop,
 * resolved for the active content locale. The default locale reads the base
 * prop; a secondary locale reads `node.i18n[locale][prop]` and, when that is
 * empty (the untranslated/dimmed case), falls back to the base prop so the
 * operator starts from the source copy and overwrites it. Returns `null` when
 * the node / prop is absent (caller then uses the DOM text). Used at open-time
 * AND on the undo/redo resync so both honor the locale the edit is bound to.
 */
function resolveBuilderNodeLocalizedSeed(
  tree: BuilderNodeTree,
  nodeId: string,
  propKey: "text" | "label" | "title" | "brand",
  locale: string,
  defaultLocale: string,
): string | null {
  const base = resolveBuilderNodeTextValue(tree, nodeId, propKey);
  if (locale === defaultLocale) return base;
  const node = findBuilderNodeById(tree, nodeId);
  const overlayValue = node?.i18n?.[locale]?.[propKey];
  if (typeof overlayValue === "string" && overlayValue.trim().length > 0) {
    return overlayValue;
  }
  return base;
}

function resolveOriginalImageSrc(src: string): string {
  if (!src) return src;
  // QA 2026-05-13 — the second branch used to `new URL(src)` with no
  // base, which throws TypeError on a relative `/_next/image?...`
  // path. The throw was silently caught and the cleaned URL fell
  // back to the raw `src` for ALL relative paths — operators saw
  // "Couldn't match this image" on every Next.js-optimized image.
  // Use a base URL for both branches so relative + absolute paths
  // both parse.
  const base =
    typeof window !== "undefined"
      ? window.location.href
      : "http://localhost/";
  try {
    if (src.startsWith("/_next/image")) {
      const u = new URL(src, base);
      const url = u.searchParams.get("url");
      if (url) return decodeURIComponent(url);
    }
    if (src.includes("/_next/image?")) {
      const u = new URL(src, base);
      const url = u.searchParams.get("url");
      if (url) return decodeURIComponent(url);
    }
  } catch {
    // fall through to raw
  }
  return src;
}

