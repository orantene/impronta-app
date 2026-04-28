"use client";

/**
 * CompositionInserters — thin "+" bars between rendered sections.
 *
 * Walks all `[data-cms-section]` wrappers in document order, reads their
 * slot + sortOrder + id, and renders an inserter button before the first,
 * between each pair, and after the last. Each inserter targets:
 *
 *   - Between A (above) and B (below): target = slot of A, sortOrder = A.sortOrder + 1.
 *     The save op shifts later entries in that slot back by one.
 *   - At top: slot of the first section, sortOrder = -1 → prepend.
 *   - At bottom: slot of the last section, sortOrder = last.sortOrder (append-after).
 *
 * Cross-slot inserts aren't supported from this inline surface in v1 — the
 * operator can add into empty slots via the "Add section" entry in the top
 * bar (opens the library with a slot picker). Between-slot sequences still
 * work correctly because sections always belong to ONE slot, and the library
 * filters types by that slot's allowedSectionTypes.
 *
 * Positions are computed from each section's bounding rect and re-computed
 * on scroll/resize via rAF. Rendered through the same pointer-events:none
 * overlay portal as SelectionLayer, but individual inserter buttons flip
 * pointer-events:auto so they're clickable.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEditContext } from "./edit-context";

interface Zone {
  key: string;
  top: number;
  left: number;
  width: number;
  slotKey: string;
  /** null → prepend (sortOrder 0); otherwise insert after this sortOrder */
  insertAfterSortOrder: number | null;
}

/**
 * Phase B.2.C — `slot_key === "header" | "footer"` are SHELL slots
 * (site_shell row), not homepage composition slots. The inserter affordance
 * exists to add body sections; it must NOT appear above/below/around shell
 * sections, otherwise its hit area covers the shell header row and clicks
 * meant to select the header open the section picker instead.
 *
 * Filtering here means: top-of-page inserter attaches to the first BODY
 * section (not the shell header), bottom-of-page attaches to the last BODY
 * section, and between-inserters never bridge a shell-to-body gap.
 */
const SHELL_SLOT_KEYS = new Set<string>(["header", "footer"]);

function readSectionsInOrder(): Array<{
  el: HTMLElement;
  id: string;
  slotKey: string;
  sortOrder: number;
}> {
  const nodes = document.querySelectorAll<HTMLElement>(
    "[data-cms-section][data-section-id][data-slot-key]",
  );
  const out: Array<{ el: HTMLElement; id: string; slotKey: string; sortOrder: number }> =
    [];
  nodes.forEach((el) => {
    const id = el.getAttribute("data-section-id");
    const slotKey = el.getAttribute("data-slot-key");
    const so = Number(el.getAttribute("data-sort-order") ?? "");
    if (!id || !slotKey || !Number.isFinite(so)) return;
    if (SHELL_SLOT_KEYS.has(slotKey)) return;
    out.push({ el, id, slotKey, sortOrder: so });
  });
  return out;
}

export function CompositionInserters() {
  const { openPickerPopover, compositionLoaded, slots } = useEditContext();
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const rafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    setPortalEl(document.getElementById("edit-overlay-portal"));
  }, []);

  const recompute = () => {
    // Cancel any pending frame instead of bailing — a stale non-null ref
    // (e.g. from strict-mode double-invoke or a missed cleanup path) would
    // otherwise deadlock the inserter layer permanently.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const sections = readSectionsInOrder();
      if (sections.length === 0) {
        setZones([]);
        return;
      }
      const next: Zone[] = [];
      // top-of-page inserter (prepend to first slot)
      {
        const first = sections[0]!;
        const rect = first.el.getBoundingClientRect();
        next.push({
          key: `top:${first.slotKey}`,
          top: rect.top - 10,
          left: rect.left,
          width: rect.width,
          slotKey: first.slotKey,
          insertAfterSortOrder: null,
        });
      }
      // between-section inserters
      for (let i = 0; i < sections.length - 1; i += 1) {
        const above = sections[i]!;
        const below = sections[i + 1]!;
        const aRect = above.el.getBoundingClientRect();
        const bRect = below.el.getBoundingClientRect();
        const mid = (aRect.bottom + bRect.top) / 2;
        const left = Math.min(aRect.left, bRect.left);
        const width = Math.max(aRect.width, bRect.width);
        next.push({
          key: `btw:${above.id}:${below.id}`,
          top: mid - 10,
          left,
          width,
          slotKey: above.slotKey,
          insertAfterSortOrder: above.sortOrder,
        });
      }
      // bottom-of-page inserter (append to last slot)
      {
        const last = sections[sections.length - 1]!;
        const rect = last.el.getBoundingClientRect();
        next.push({
          key: `bot:${last.id}`,
          top: rect.bottom - 10,
          left: rect.left,
          width: rect.width,
          slotKey: last.slotKey,
          insertAfterSortOrder: last.sortOrder,
        });
      }
      setZones(next);
    });
  };

  useEffect(() => {
    if (!compositionLoaded) return;
    recompute();
    const onScroll = () => recompute();
    const onResize = () => recompute();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onResize);

    // Also re-run when the section set changes. Watching mutations on the
    // body is coarse but reliable — composition mutations re-render server
    // sections and replace the wrapper DOM, so we need to pick that up.
    const mo = new MutationObserver(() => recompute());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", onScroll, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", onResize);
      mo.disconnect();
      // See note in selection-layer: must null the ref too or subsequent
      // recomputes bail out under React 19 strict-mode remount.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [compositionLoaded]);

  // Also recompute when slots state changes (after a mutation). MutationObserver
  // covers DOM changes but this catches the immediate effect-of-save case.
  useEffect(() => {
    if (!compositionLoaded) return;
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  if (!portalEl || !compositionLoaded) return null;

  return createPortal(
    <div data-edit-overlay="inserters" className="pointer-events-none absolute inset-0">
      {zones.map((z) => (
        <button
          type="button"
          key={z.key}
          data-edit-overlay="inserter-btn"
          onClick={(e) => {
            // Sprint 3 — anchor a contextual popover at the click site
            // instead of opening the full modal library. Operator can
            // still reach the modal via the popover's "Browse all
            // sections…" footer link.
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            openPickerPopover(
              {
                slotKey: z.slotKey,
                insertAfterSortOrder: z.insertAfterSortOrder,
              },
              r.left + r.width / 2,
              r.top + r.height / 2,
            );
          }}
          className="group pointer-events-auto absolute flex items-center justify-center"
          style={{
            top: z.top,
            left: z.left,
            width: z.width,
            height: 20,
          }}
          aria-label="Add a section here"
        >
          <span className="flex h-px w-full items-center justify-center bg-transparent transition-colors group-hover:bg-[rgba(17,24,39,0.25)]">
            <span className="relative flex size-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-all group-hover:border-zinc-900 group-hover:bg-zinc-900 group-hover:text-white group-hover:shadow-md">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
          </span>
        </button>
      ))}
    </div>,
    portalEl,
  );
}
