"use client";

/**
 * InlineEditor — canvas-native text + image edits for the selected section.
 *
 * Two gestures, both scoped to whichever section is currently selected:
 *
 *   1. Double-click a text node → the enclosing element flips to
 *      `contentEditable` with an outline. Enter / blur commits; Escape
 *      reverts. Commit:
 *        a. reads the new plain text,
 *        b. walks `draftProps` looking for a string leaf that equals the
 *           ORIGINAL text (captured at dblclick time),
 *        c. if it finds one (and only one) path, rewrites it via setDraftProps
 *           + flips dirty. The inspector's existing autosave loop does the
 *           round-trip + CAS + `router.refresh()`.
 *      If zero / multiple matches, we surface a lightweight "Open inspector"
 *      prompt — the operator can still edit that field in the right rail.
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
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useEditContext } from "./edit-context";
import { MediaPickerDialog } from "./media-picker-dialog";
import { findPathByValue, setByPath } from "@/lib/site-admin/edit-mode/prop-path";

type Banner =
  | { kind: "none" }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

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
      if (e.target.closest("[data-inline-editing='1']")) return;

      // Images have their own path.
      if (e.target.tagName === "IMG") return;

      const editable = findEditableTextEl(e.target);
      if (!editable) return;

      e.preventDefault();
      e.stopPropagation();
      beginTextEdit(editable);
    }

    function beginTextEdit(el: HTMLElement) {
      const original = (el.textContent ?? "").trim();
      if (!original) return;
      el.setAttribute("data-inline-editing", "1");
      el.setAttribute("contenteditable", "true");
      // Match the selection ring's ink palette so the active text edit reads
      // as the SAME editor chrome the operator just clicked into, not a
      // secondary indicator in a different color family.
      el.style.setProperty("outline", "1px solid rgba(17, 24, 39, 0.92)");
      el.style.setProperty("outline-offset", "2px");
      el.style.setProperty(
        "box-shadow",
        "0 0 0 4px rgba(17, 24, 39, 0.12)",
      );
      el.style.setProperty("border-radius", "2px");
      el.style.setProperty("cursor", "text");
      // select all
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel?.removeAllRanges();
      sel?.addRange(range);
      el.focus();

      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const next = (el.textContent ?? "").trim();
        teardown();
        commitText(original, next);
      };
      const revert = () => {
        if (committed) return;
        committed = true;
        el.textContent = original;
        teardown();
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          commit();
          el.blur();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          revert();
          el.blur();
        }
      };
      const onBlur = () => {
        commit();
      };
      const teardown = () => {
        el.removeAttribute("contenteditable");
        el.removeAttribute("data-inline-editing");
        el.style.removeProperty("outline");
        el.style.removeProperty("outline-offset");
        el.style.removeProperty("box-shadow");
        el.style.removeProperty("border-radius");
        el.style.removeProperty("cursor");
        el.removeEventListener("keydown", onKey);
        el.removeEventListener("blur", onBlur);
      };
      el.addEventListener("keydown", onKey);
      el.addEventListener("blur", onBlur);
    }

    document.addEventListener("dblclick", onDblClick, true);
    return () => {
      document.removeEventListener("dblclick", onDblClick, true);
    };
  }, [commitText]);

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
      if (!img) {
        setImgHover(null);
        return;
      }
      const rect = img.getBoundingClientRect();
      setImgHover({ img, rect });
    }
    function onScrollOrResize() {
      if (!targetImgRef.current) {
        setImgHover((prev) =>
          prev ? { img: prev.img, rect: prev.img.getBoundingClientRect() } : prev,
        );
      }
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
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-zinc-900/95 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur transition hover:bg-zinc-800"
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
              : "bg-zinc-900 text-white"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      <MediaPickerDialog
        tenantId={tenantId}
        open={mediaOpen}
        onPick={handleImagePicked}
        onClose={() => {
          setMediaOpen(false);
          targetImgRef.current = null;
        }}
      />
    </>
  );
}

/**
 * Strip Next.js image-optimizer wrappers from an img src so we can match it
 * against the raw URL stored in section props. If the src isn't wrapped,
 * return it unchanged.
 */
function resolveOriginalImageSrc(src: string): string {
  try {
    const url = new URL(src, window.location.origin);
    if (url.pathname === "/_next/image") {
      const inner = url.searchParams.get("url");
      if (inner) return decodeURIComponent(inner);
    }
  } catch {
    // absolute URL from another origin, or a data: URL — leave as-is
  }
  return src;
}
