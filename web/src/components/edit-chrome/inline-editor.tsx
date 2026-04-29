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

type Banner =
  | { kind: "none" }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

interface ActiveTextEdit {
  el: HTMLElement;
  original: string;
  variant: "single" | "multi";
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
    draftProps,
    setDraftProps,
    setDirty,
  } = useEditContext();

  const [mediaOpen, setMediaOpen] = useState(false);
  const targetImgRef = useRef<HTMLImageElement | null>(null);
  const [imgHover, setImgHover] = useState<{
    img: HTMLImageElement;
    rect: DOMRect;
  } | null>(null);
  const [banner, setBanner] = useState<Banner>({ kind: "none" });
  // Phase C.1 — active canvas-edit overlay. The overlay (RichEditor +
  // floating toolbar) is rendered when this is non-null.
  const [activeEdit, setActiveEdit] = useState<ActiveTextEdit | null>(null);

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
      // Only engage if the inspector has finished loading this section's
      // draftProps. Otherwise the commit has nothing to write to.
      if (!draftPropsRef.current) return;

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
      setActiveEdit({ el: editable, original, variant });
    }

    document.addEventListener("dblclick", onDblClick, true);
    return () => {
      document.removeEventListener("dblclick", onDblClick, true);
    };
  }, []);

  function endActiveEdit(commit: boolean, next?: string) {
    if (!activeEdit) return;
    if (commit && next !== undefined) {
      commitText(activeEdit.original, next);
    }
    setActiveEdit(null);
  }

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
    targetImgRef.current = img;
    setMediaOpen(true);
  };

  const handleImagePicked = useCallback(
    (publicUrl: string) => {
      const img = targetImgRef.current;
      setMediaOpen(false);
      if (!img) return;
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
    [setDraftProps, setDirty],
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
  try {
    if (src.startsWith("/_next/image")) {
      const u = new URL(src, "http://x");
      const url = u.searchParams.get("url");
      if (url) return decodeURIComponent(url);
    }
    if (src.includes("/_next/image?")) {
      const u = new URL(src);
      const url = u.searchParams.get("url");
      if (url) return decodeURIComponent(url);
    }
  } catch {
    // fall through to raw
  }
  return src;
}
