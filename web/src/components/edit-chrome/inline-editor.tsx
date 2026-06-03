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
 *      Enter / outside-click / blur the overlay commits via
 *      `findPathByValue` against the active section's draft props (the
 *      inspector's autosave loop does the round-trip + CAS +
 *      router.refresh()). Escape reverts.
 *
 *   2. Hover an `<img>` → a floating "Replace" pill appears near the top-
 *      right of the image. Click it → MediaPickerDialog opens. On pick we
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
import { MediaPickerDialog } from "./media-picker-dialog";
import { findPathByValue, setByPath } from "@/lib/site-admin/edit-mode/prop-path";
import { CanvasEditOverlay } from "./rich-editor";
import {
  resolveBuilderNodeRole,
  type BuilderNode,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";

type Banner =
  | { kind: "none" }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

interface ActiveTextEdit {
  el: HTMLElement;
  original: string;
  variant: "single" | "multi";
  builderNode?: {
    id: string;
    propKey: "text" | "label" | "title";
  };
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
    selectedSectionId,
    builderTree,
    draftProps,
    patchBuilderNodeProps,
    reportMutationError,
    selectBuilderNode,
    setDraftProps,
    setDirty,
  } = useEditContext();

  const [mediaOpen, setMediaOpen] = useState(false);
  const targetImgRef = useRef<TargetImageEdit | null>(null);
  const [imgHover, setImgHover] = useState<{
    img: HTMLImageElement;
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

  // ── text commit helpers ──────────────────────────────────────────────
  const commitText = useCallback(
    (original: string, next: string) => {
      if (next === original) return;
      const tree = draftPropsRef.current;
      if (!tree) return;
      const hit = findPathByValue(tree, original);
      if (!hit) {
        setBanner({
          kind: "error",
          text: "Couldn't find this text to save. Open the inspector to edit this field.",
        });
        return;
      }
      if (hit.occurrences > 1) {
        setBanner({
          kind: "error",
          text: "This text appears more than once in this section — edit it from the inspector to disambiguate.",
        });
        return;
      }
      const updated = setByPath(tree, hit.path, next);
      setDraftProps(updated);
      setDirty(true);
    },
    [setDraftProps, setDirty],
  );

  const commitBuilderNodeText = useCallback(
    async (
      target: NonNullable<ActiveTextEdit["builderNode"]>,
      original: string,
      next: string,
    ) => {
      if (next === original) return;
      if (next.trim().length === 0) {
        setBanner({
          kind: "error",
          text: "This block cannot be saved empty. Use delete if you want to remove it.",
        });
        return;
      }
      const result = await patchBuilderNodeProps(target.id, {
        [target.propKey]: next.trim(),
      });
      if (!result.ok) {
        const text = result.error ?? "Couldn't save this block. Try the inspector.";
        reportMutationError(text);
        setBanner({ kind: "error", text });
      }
    },
    [patchBuilderNodeProps, reportMutationError],
  );

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
        }
        el = el.parentElement;
      }
      return null;
    }

    function onDblClick(e: MouseEvent) {
      if (!(e.target instanceof HTMLElement)) return;
      const sectionEl = e.target.closest<HTMLElement>("[data-cms-section]");
      if (!sectionEl) return;
      const sectionId = sectionEl.getAttribute("data-section-id");
      if (!sectionId || sectionId !== selectedIdRef.current) return;

      // Don't re-engage an already-editing element.
      if (e.target.closest('[data-edit-overlay="canvas-edit"]')) return;

      // Images have their own path.
      if (e.target.tagName === "IMG") return;

      const editable = findEditableTextEl(e.target);
      if (!editable) return;

      const original = (editable.textContent ?? "").trim();
      if (!original) return;

      e.preventDefault();
      e.stopPropagation();

      const variant: "single" | "multi" = SINGLE_LINE_TAGS.has(editable.tagName)
        ? "single"
        : "multi";
      const builderNodeTarget = resolveEditableBuilderNodeTextTarget(
        builderTreeRef.current,
        editable,
      );
      if (builderNodeTarget) {
        selectBuilderNode(builderNodeTarget.id);
        setActiveEdit({
          el: editable,
          original,
          variant: builderNodeTarget.variant,
          builderNode: {
            id: builderNodeTarget.id,
            propKey: builderNodeTarget.propKey,
          },
        });
        return;
      }
      // Legacy section text still writes through draftProps, so wait until
      // the inspector has loaded that payload. Freeform nodes patch directly
      // above and do not need this section-prop payload.
      if (!draftPropsRef.current) return;
      setActiveEdit({ el: editable, original, variant });
    }

    document.addEventListener("dblclick", onDblClick, true);
    return () => {
      document.removeEventListener("dblclick", onDblClick, true);
    };
  }, [selectBuilderNode]);

  // QA 2026-05-13 — wrapped in useCallback so child surfaces that
  // memoize `onCommit` / `onCancel` props don't capture a stale
  // closure between double-click and blur. Deps include `activeEdit`
  // since the body reads it; both commit fns are stable across
  // renders (they're not re-created on each parent render).
  const endActiveEdit = useCallback(
    (commit: boolean, next?: string) => {
      if (!activeEdit) return;
      if (commit && next !== undefined) {
        if (activeEdit.builderNode) {
          void commitBuilderNodeText(
            activeEdit.builderNode,
            activeEdit.original,
            next,
          );
        } else {
          commitText(activeEdit.original, next);
        }
      }
      setActiveEdit(null);
    },
    [activeEdit, commitBuilderNodeText, commitText],
  );

  // ── image hover + replace driver ─────────────────────────────────────
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!(e.target instanceof HTMLElement)) return;
      const sectionEl = e.target.closest<HTMLElement>("[data-cms-section]");
      if (!sectionEl) {
        setImgHover(null);
        return;
      }
      const sectionId = sectionEl.getAttribute("data-section-id");
      if (!sectionId || sectionId !== selectedIdRef.current) {
        setImgHover(null);
        return;
      }
      const img =
        e.target instanceof HTMLImageElement
          ? e.target
          : (e.target.closest("img") as HTMLImageElement | null);
      if (!img || !sectionEl.contains(img)) {
        setImgHover(null);
        return;
      }
      setImgHover({ img, rect: img.getBoundingClientRect() });
    }
    function onScrollOrResize() {
      setImgHover((cur) =>
        cur ? { img: cur.img, rect: cur.img.getBoundingClientRect() } : cur,
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
    (publicUrl: string) => {
      const target = targetImgRef.current;
      setMediaOpen(false);
      if (!target) return;
      if (target.builderNodeId) {
        void patchBuilderNodeProps(target.builderNodeId, { src: publicUrl }).then(
          (result) => {
            if (!result.ok) {
              const text =
                result.error ?? "Couldn't replace this image. Try the inspector.";
              reportMutationError(text);
              setBanner({ kind: "error", text });
            }
          },
        );
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
          text: "This image URL appears more than once in this section — replace it from the inspector.",
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
    selectedSectionId !== null && imgHover !== null && !mediaOpen;

  return (
    <>
      {showImgHint && imgHover ? (
        <button
          type="button"
          data-edit-overlay="inline-replace"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleReplaceClick(imgHover.img);
          }}
          style={{
            position: "fixed",
            top: Math.max(imgHover.rect.top + 8, 60),
            left: imgHover.rect.right - 110,
            zIndex: 115,
          }}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[#242942]/95 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur transition hover:bg-[#2e3452]"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          Replace image
        </button>
      ) : null}

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
              ? "bg-amber-50 text-amber-800 border border-amber-200"
              : "bg-[#3d4f7c] text-white"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {activeEdit ? (
        <CanvasEditOverlay
          target={activeEdit.el}
          initialValue={activeEdit.original}
          variant={activeEdit.variant}
          tenantId={tenantId ?? undefined}
          onCommit={(next) => endActiveEdit(true, next)}
          onCancel={() => endActiveEdit(false)}
        />
      ) : null}

      <MediaPickerDialog
        tenantId={tenantId ?? null}
        open={mediaOpen}
        onPick={handleImagePicked}
        onClose={() => setMediaOpen(false)}
      />
    </>
  );
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

function findBuilderNodeById(
  tree: BuilderNodeTree,
  nodeId: string | null,
): BuilderNode | null {
  if (!nodeId) return null;
  const queue = [...tree];
  while (queue.length > 0) {
    const current = queue.shift() ?? null;
    if (!current) continue;
    if (current.id === nodeId) return current;
    if ("children" in current && Array.isArray(current.children)) {
      queue.unshift(...current.children);
    }
  }
  return null;
}

function resolveEditableBuilderNodeTextTarget(
  tree: BuilderNodeTree,
  el: HTMLElement,
): {
  id: string;
  propKey: "text" | "label" | "title";
  variant: "single" | "multi";
} | null {
  const nodeEl = el.closest<HTMLElement>("[data-builder-node-id]");
  const nodeId = nodeEl?.getAttribute("data-builder-node-id") ?? null;
  if (!nodeId || resolveBuilderNodeRole(nodeId)) return null;
  const renderedKind = nodeEl?.getAttribute("data-builder-node-kind");
  if (renderedKind === "heading") {
    return { id: nodeId, propKey: "text", variant: "single" };
  }
  if (renderedKind === "paragraph") {
    return { id: nodeId, propKey: "text", variant: "multi" };
  }
  if (renderedKind === "rich_text") {
    return { id: nodeId, propKey: "text", variant: "multi" };
  }
  if (renderedKind === "button") {
    return { id: nodeId, propKey: "label", variant: "single" };
  }
  if (renderedKind === "accordion_item" || renderedKind === "tab_panel") {
    return { id: nodeId, propKey: "title", variant: "single" };
  }
  const node = findBuilderNodeById(tree, nodeId);
  if (!node || node.kind === "section") return null;
  if (node.kind === "heading") {
    return { id: node.id, propKey: "text", variant: "single" };
  }
  if (node.kind === "paragraph") {
    return { id: node.id, propKey: "text", variant: "multi" };
  }
  if (node.kind === "rich_text") {
    return { id: node.id, propKey: "text", variant: "multi" };
  }
  if (node.kind === "button") {
    return { id: node.id, propKey: "label", variant: "single" };
  }
  if (node.kind === "accordion_item" || node.kind === "tab_panel") {
    return { id: node.id, propKey: "title", variant: "single" };
  }
  return null;
}

function resolveEditableBuilderNodeImageTarget(
  tree: BuilderNodeTree,
  img: HTMLImageElement,
): { id: string } | null {
  const nodeEl = img.closest<HTMLElement>("[data-builder-node-id]");
  const nodeId = nodeEl?.getAttribute("data-builder-node-id") ?? null;
  if (!nodeId || resolveBuilderNodeRole(nodeId)) return null;
  const node = findBuilderNodeById(tree, nodeId);
  return node?.kind === "image" ? { id: node.id } : null;
}
