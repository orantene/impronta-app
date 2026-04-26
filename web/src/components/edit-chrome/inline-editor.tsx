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
  // Phase 2 — floating toolbar shown above the active text selection while
  // an inline edit is in progress. Three actions:
  //   - Accent: wrap selection in `{accent}...{/accent}` (renderInlineRich
  //     turns it into <em class="accent">). Output stays plain text in the
  //     schema, so no schema change is needed.
  //   - Plain: strip surrounding `{accent}...{/accent}` from selection.
  //   - Link: prompt for URL, wrap in `[text](url)` — sections that opt
  //     into Markdown links can render them; others ignore the syntax.
  const [toolbar, setToolbar] = useState<{
    rect: DOMRect;
    el: HTMLElement;
  } | null>(null);

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
      // Toolbar tracks the active edit element. It positions itself above
      // the current selection range; we update on selectionchange.
      setToolbar({ rect: el.getBoundingClientRect(), el });
      const onSelChange = () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.commonAncestorContainer)) return;
        const r = range.getBoundingClientRect();
        // Empty (caret) selection collapses to a 0-width rect; fall back
        // to the whole element so the toolbar stays anchored.
        const useRect = r.width === 0 && r.height === 0 ? el.getBoundingClientRect() : r;
        setToolbar({ rect: useRect, el });
      };
      document.addEventListener("selectionchange", onSelChange);
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
        document.removeEventListener("selectionchange", onSelChange);
        setToolbar(null);
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

      {toolbar ? (
        <div
          data-edit-overlay="inline-toolbar"
          // Prevent the toolbar's own mousedown from blurring the
          // contentEditable element (which would commit + tear down).
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            top: Math.max(toolbar.rect.top - 40, 60),
            left: Math.min(
              Math.max(toolbar.rect.left + toolbar.rect.width / 2 - 110, 8),
              window.innerWidth - 228,
            ),
            zIndex: 120,
          }}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-zinc-900/95 px-1.5 py-1 text-white shadow-xl backdrop-blur"
        >
          <ToolbarButton
            label="Accent"
            title="Wrap selection in accent style"
            onClick={() => wrapSelection("{accent}", "{/accent}")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 4 L8 19" />
              <path d="M5 19 L8 19" />
              <path d="M16 4 L19 4" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            label="Bold"
            title="Wrap selection in bold"
            onClick={() => wrapSelection("{b}", "{/b}")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z" />
              <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            title="Wrap selection in italic"
            onClick={() => wrapSelection("{i}", "{/i}")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 4 L10 4" />
              <path d="M14 20 L5 20" />
              <path d="M15 4 L9 20" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            label="Plain"
            title="Strip all formatting markers from selection"
            onClick={() => stripAllMarkers()}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12 L19 12" />
            </svg>
          </ToolbarButton>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.18)" }} />
          <ToolbarButton
            label="Link"
            title="Wrap selection as a Markdown link"
            onClick={() => {
              const url = window.prompt("Link URL (https://…)") ?? "";
              if (!url.trim()) return;
              wrapSelection("[", `](${url.trim()})`);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            label="Unlink"
            title="Remove links from selection"
            onClick={() => stripLinkMarkers()}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 17l-2 2a4.95 4.95 0 0 1-7-7l3-3" />
              <path d="M15 7l2-2a4.95 4.95 0 0 1 7 7l-3 3" />
              <path d="M2 22 22 2" />
            </svg>
          </ToolbarButton>
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

function ToolbarButton({
  children,
  label,
  title,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-7 cursor-pointer items-center justify-center rounded-full px-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] transition hover:bg-white/10"
      style={{ background: "transparent", border: "none", color: "white" }}
    >
      {children}
    </button>
  );
}

/**
 * Wrap the current selection inside the active contentEditable element with
 * `before` and `after` strings. Falls back to inserting at the caret if the
 * selection is collapsed.
 */
function wrapSelection(before: string, after: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const text = sel.toString();
  if (text.length === 0) {
    // Insert markers at caret so the operator can type inside.
    const node = document.createTextNode(`${before}${after}`);
    range.insertNode(node);
    return;
  }
  const replacement = document.createTextNode(`${before}${text}${after}`);
  range.deleteContents();
  range.insertNode(replacement);
  // Re-select the inserted text so the toolbar stays anchored.
  const newRange = document.createRange();
  newRange.setStartAfter(replacement);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

/**
 * Strip ALL formatting markers from the active editable element's text
 * content (accent, bold, italic, link). We rewrite the whole element
 * rather than try to surgically unwrap a selection range because the
 * markers are paired and unbalanced surgery would corrupt the doc.
 */
function stripAllMarkers() {
  const el = document.querySelector<HTMLElement>("[data-inline-editing='1']");
  if (!el) return;
  const before = el.textContent ?? "";
  let after = before
    .replace(/\{accent\}/g, "")
    .replace(/\{\/accent\}/g, "")
    .replace(/\{b\}/g, "")
    .replace(/\{\/b\}/g, "")
    .replace(/\{i\}/g, "")
    .replace(/\{\/i\}/g, "");
  // Markdown-style link → just the visible label.
  after = after.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  if (before === after) return;
  el.textContent = after;
}

/**
 * Convert every `[text](url)` to plain `text`. Leaves accent/bold/italic
 * markers intact.
 */
function stripLinkMarkers() {
  const el = document.querySelector<HTMLElement>("[data-inline-editing='1']");
  if (!el) return;
  const before = el.textContent ?? "";
  const after = before.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  if (before === after) return;
  el.textContent = after;
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
