"use client";

/**
 * P7A-1 — governed element insert picker (search + category grouping).
 * Parent menus supply `allowedKinds` (already intersected with registry + plan gate).
 */

import { useId, useMemo, useState } from "react";

import {
  BUILDER_NODE_REGISTRY,
  ELEMENT_LIBRARY_CATEGORY_LABEL,
  ELEMENT_LIBRARY_CATEGORY_ORDER,
  elementLibraryCategoryForKind,
  elementLibraryPrimaryLabel,
  elementLibrarySearchExtraTerms,
  SECTION_EMBED_PRESETS,
  sortKindsForElementLibraryCatalog,
  type BuilderNodeKind,
  type ElementLibraryCategory,
} from "@/lib/site-admin/builder-node";

import { CHROME } from "./kit";

/**
 * P3-DRAG — custom drag MIME for "drag a palette item onto the canvas". Only
 * `selection-layer.tsx`'s canvas drop target reads it, so a palette drag never
 * collides with the navigator's `text/plain` section/child-row DnD. Payload is
 * `kind:<kind>` for a plain element or `embed:<sectionTypeKey>` for a Tulala
 * component. Exported so the canvas drop handler parses the exact same format.
 */
export const BUILDER_NODE_PALETTE_DRAG_MIME =
  "application/x-impronta-builder-node-palette";

export function encodeBuilderNodePaletteDrag(
  payload: BuilderNodePaletteDragPayload,
): string {
  if (payload.kind === "element") {
    return `kind:${payload.elementKind}`;
  }
  if (payload.kind === "section_embed") {
    return `embed:${payload.sectionTypeKey}`;
  }
  if (payload.kind === "gallery_item") {
    return `gallery:${payload.itemId}`;
  }
  return "";
}

export type BuilderNodePaletteDragPayload =
  | { kind: "element"; elementKind: BuilderNodeKind }
  | { kind: "section_embed"; sectionTypeKey: string }
  | { kind: "gallery_item"; itemId: string };

export function decodeBuilderNodePaletteDrag(
  raw: string | null | undefined,
): BuilderNodePaletteDragPayload | null {
  if (!raw) return null;
  if (raw.startsWith("kind:")) {
    const elementKind = raw.slice("kind:".length);
    if (!elementKind) return null;
    return { kind: "element", elementKind: elementKind as BuilderNodeKind };
  }
  if (raw.startsWith("embed:")) {
    const sectionTypeKey = raw.slice("embed:".length);
    if (!sectionTypeKey) return null;
    return { kind: "section_embed", sectionTypeKey };
  }
  if (raw.startsWith("gallery:")) {
    const itemId = raw.slice("gallery:".length);
    if (!itemId) return null;
    return { kind: "gallery_item", itemId };
  }
  return null;
}

/**
 * P3-DRAG — the payload of the palette drag CURRENTLY in flight. `dataTransfer`
 * data is unreadable during `dragover` (only `.types` is exposed), and the drag
 * source (a palette pill) lives in a different React tree from the canvas drop
 * target (selection-layer). This module-level holder bridges them: the pill
 * writes on `dragstart`, the canvas reads it on `dragenter`, and both clear it
 * on `dragend`. Single in-flight drag at a time, so a singleton is sufficient.
 */
let activePaletteDrag: BuilderNodePaletteDragPayload | null = null;

export function setActiveBuilderNodePaletteDrag(
  payload: BuilderNodePaletteDragPayload | null,
): void {
  activePaletteDrag = payload;
}

export function getActiveBuilderNodePaletteDrag(): BuilderNodePaletteDragPayload | null {
  return activePaletteDrag;
}

/**
 * CANVAS-6 — pointer-drag bridge between the gallery card (which arms the
 * palette payload via Pointer Events) and the canvas drop receiver
 * (selection-layer), which lives in a different React tree. HTML5 drag had the
 * browser fire `dragenter`/`dragover`/`drop` on the window for free; Pointer
 * Events don't, so the card publishes pointer-drag lifecycle phases here and the
 * canvas subscribes. Single in-flight drag at a time → a singleton listener set
 * is sufficient (mirrors `activePaletteDrag`).
 */
export type PalettePointerDragPhase =
  | { type: "move"; clientX: number; clientY: number }
  | { type: "drop"; clientX: number; clientY: number }
  | { type: "cancel" };

type PalettePointerDragListener = (phase: PalettePointerDragPhase) => void;

const palettePointerDragListeners = new Set<PalettePointerDragListener>();

export function subscribePalettePointerDrag(
  listener: PalettePointerDragListener,
): () => void {
  palettePointerDragListeners.add(listener);
  return () => palettePointerDragListeners.delete(listener);
}

export function emitPalettePointerDrag(phase: PalettePointerDragPhase): void {
  for (const listener of palettePointerDragListeners) listener(phase);
}

export function ElementLibraryInsertPicker({
  allowedKinds,
  onPick,
  onPickSectionEmbed,
  variant,
}: {
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  onPick: (kind: BuilderNodeKind) => void | Promise<void>;
  /**
   * When provided, the picker surfaces a "Tulala" category with the curated
   * dynamic-component tiles (Directory / Featured talent / Booking / CTA). Each
   * inserts a `section_embed` node for that section key. Omitted at mounts that
   * can't host a section embed (or don't want it).
   */
  onPickSectionEmbed?: (sectionTypeKey: string) => void | Promise<void>;
  variant: "navigator" | "canvas" | "inspector";
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");

  // Curated Tulala components (live dynamic sections) — shown only when the
  // mount supports embedding them AND `section_embed` is droppable here. The
  // `section_embed` kind never enters the generic catalog; it is surfaced
  // exclusively through these labeled entries.
  const sectionEmbeds = useMemo(() => {
    if (!onPickSectionEmbed) return [];
    if (!allowedKinds.includes("section_embed")) return [];
    const q = query.trim().toLowerCase();
    return SECTION_EMBED_PRESETS.filter((preset) => {
      if (!q) return true;
      return [preset.label, preset.description, "tulala component dynamic section"]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [onPickSectionEmbed, allowedKinds, query]);

  const grouped = useMemo(() => {
    // `section_embed` is surfaced via the dedicated "Tulala" group below, never
    // as a bare generic pill, so drop it from the kind catalog here.
    const sorted = sortKindsForElementLibraryCatalog(
      allowedKinds.filter((k) => k !== "section_embed"),
    );
    const q = query.trim().toLowerCase();
    const match = (kind: BuilderNodeKind) => {
      if (!q) return true;
      const hay = [
        elementLibraryPrimaryLabel(kind),
        BUILDER_NODE_REGISTRY[kind].description,
        kind.replace(/_/g, " "),
        elementLibrarySearchExtraTerms(kind),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };

    const buckets = new Map<ElementLibraryCategory, BuilderNodeKind[]>();
    for (const cat of ELEMENT_LIBRARY_CATEGORY_ORDER) {
      buckets.set(cat, []);
    }
    for (const kind of sorted) {
      if (!match(kind)) continue;
      const cat = elementLibraryCategoryForKind(kind);
      buckets.get(cat)!.push(kind);
    }

    return ELEMENT_LIBRARY_CATEGORY_ORDER.map((cat) => ({
      category: cat,
      kinds: buckets.get(cat) ?? [],
    })).filter((g) => g.kinds.length > 0);
  }, [allowedKinds, query]);

  const isNavigator = variant === "navigator";
  const isCanvas = variant === "canvas";
  const isInspector = variant === "inspector";

  const searchStyle =
    isNavigator
      ? {
          width: "100%" as const,
          marginBottom: 8,
          padding: "6px 8px",
          fontSize: 11,
          borderRadius: 0,
          border: `1px solid ${CHROME.line}`,
          background: CHROME.paper,
          color: CHROME.text,
          outline: "none" as const,
          boxSizing: "border-box" as const,
        }
      : isInspector
        ? {
            width: "100%" as const,
            marginBottom: 8,
            padding: "6px 8px",
            fontSize: 11,
            borderRadius: 6,
            border: "1px solid rgb(199 210 254)",
            background: "white",
            color: "rgb(41 37 36)",
            outline: "none" as const,
            boxSizing: "border-box" as const,
          }
        : {
            width: "100%" as const,
            marginBottom: 8,
            padding: "6px 8px",
            fontSize: 11,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            outline: "none" as const,
            boxSizing: "border-box" as const,
          };

  const emptySearchColor = isNavigator
    ? CHROME.muted
    : isInspector
      ? "rgb(87 83 78)"
      : "rgba(255,255,255,0.62)";

  const categoryLabelColor = isNavigator
    ? CHROME.muted2
    : isInspector
      ? "rgb(79 70 229)"
      : "rgba(255,255,255,0.45)";

  // Per-variant pill tone. Drives the new hover/press affordance so each
  // element reads as a real, tappable button (the picker had no hover state
  // at all — it looked inert).
  const pillTone: PillTone = isNavigator
    ? {
        bg: CHROME.paper,
        border: CHROME.line,
        text: CHROME.text,
        hoverBg: "rgba(42,49,71,0.07)",
        hoverBorder: "rgba(42,49,71,0.28)",
        hoverText: CHROME.text,
        radius: 999,
      }
    : isInspector
      ? {
          bg: "white",
          border: "rgb(199 210 254)",
          text: "rgb(41 37 36)",
          hoverBg: "rgb(238 242 255)",
          hoverBorder: "rgb(129 140 248)",
          hoverText: "rgb(55 48 163)",
          radius: 7,
        }
      : {
          bg: "rgba(255,255,255,0.07)",
          border: "rgba(255,255,255,0.12)",
          text: "white",
          hoverBg: "rgba(255,255,255,0.16)",
          hoverBorder: "rgba(255,255,255,0.34)",
          hoverText: "white",
          radius: 7,
        };

  if (allowedKinds.length === 0) {
    return (
      <div
        role="alert"
        aria-live="polite"
        aria-atomic="true"
        data-element-library-catalog-empty=""
        style={{
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.45,
          color: emptySearchColor,
          padding: "8px 2px",
        }}
      >
        No elements can be inserted here right now (catalog empty). Reload the page
        or pick another section — if this persists, the builder tree may still be
        loading.
      </div>
    );
  }

  return (
    <>
      <label className="sr-only" htmlFor={searchId}>
        Search elements
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search elements…"
        autoComplete="off"
        data-element-library-search=""
        style={searchStyle}
      />
      <div
        data-element-library-groups=""
        style={{
          maxHeight: isInspector ? 220 : 200,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {sectionEmbeds.length > 0 ? (
          <div data-element-library-category="tulala">
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: categoryLabelColor,
                marginBottom: 6,
              }}
            >
              Tulala
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {sectionEmbeds.map((preset) => (
                <PickerPill
                  key={preset.id}
                  label={preset.label}
                  tone={pillTone}
                  onClick={() => void onPickSectionEmbed?.(preset.sectionTypeKey)}
                  dragPayload={
                    isCanvas
                      ? {
                          kind: "section_embed",
                          sectionTypeKey: preset.sectionTypeKey,
                        }
                      : undefined
                  }
                  dataAttrs={{
                    "data-element-library-section-embed": preset.sectionTypeKey,
                    "data-builder-node-insert-section-embed": preset.sectionTypeKey,
                    ...(isCanvas
                      ? {
                          "data-builder-node-canvas-insert-section-embed":
                            preset.sectionTypeKey,
                        }
                      : {}),
                    ...(isInspector
                      ? {
                          "data-builder-node-inspector-insert-section-embed":
                            preset.sectionTypeKey,
                        }
                      : {}),
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
        {grouped.length === 0 && sectionEmbeds.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: emptySearchColor,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span>No elements match this search.</span>
            {query.trim() ? (
              <button
                type="button"
                data-element-library-clear-search=""
                onClick={() => setQuery("")}
                style={{
                  alignSelf: "flex-start",
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: isNavigator
                    ? `1px solid ${CHROME.line}`
                    : isInspector
                      ? "1px solid rgb(199 210 254)"
                      : "1px solid rgba(255,255,255,0.22)",
                  background: isNavigator
                    ? CHROME.paper
                    : isInspector
                      ? "white"
                      : "rgba(255,255,255,0.1)",
                  color: isNavigator
                    ? CHROME.text
                    : isInspector
                      ? "rgb(67 56 202)"
                      : "white",
                  cursor: "pointer",
                }}
              >
                Clear search
              </button>
            ) : null}
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.category} data-element-library-category={group.category}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: categoryLabelColor,
                  marginBottom: 6,
                }}
              >
                {ELEMENT_LIBRARY_CATEGORY_LABEL[group.category]}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {group.kinds.map((kind) => (
                  <PickerPill
                    key={kind}
                    label={elementLibraryPrimaryLabel(kind)}
                    tone={pillTone}
                    onClick={() => void onPick(kind)}
                    dragPayload={
                      isCanvas
                        ? { kind: "element", elementKind: kind }
                        : undefined
                    }
                    dataAttrs={{
                      "data-element-library-kind": kind,
                      "data-builder-node-insert-kind": kind,
                      ...(isCanvas
                        ? { "data-builder-node-canvas-insert-kind": kind }
                        : {}),
                      ...(isInspector
                        ? { "data-builder-node-inspector-insert-kind": kind }
                        : {}),
                    }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

interface PillTone {
  bg: string;
  border: string;
  text: string;
  hoverBg: string;
  hoverBorder: string;
  hoverText: string;
  radius: number;
}

function PickerPill({
  label,
  tone,
  onClick,
  dataAttrs,
  dragPayload,
}: {
  label: string;
  tone: PillTone;
  onClick: () => void;
  dataAttrs: Record<string, string>;
  /**
   * P3-DRAG — when set, the pill becomes an HTML5 drag source carrying the
   * encoded palette payload on `BUILDER_NODE_PALETTE_DRAG_MIME`. The canvas
   * drop target (selection-layer) computes the parent + index and inserts.
   * Click-to-insert keeps working unchanged (drag and click are distinct
   * gestures). Omitted at mounts that can't host a canvas drop (e.g. the
   * navigator/inspector list pickers).
   */
  dragPayload?: BuilderNodePaletteDragPayload;
}) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const lit = hover || active;
  return (
    <button
      type="button"
      {...dataAttrs}
      draggable={dragPayload ? true : undefined}
      onDragStart={
        dragPayload
          ? (event) => {
              setActive(false);
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(
                BUILDER_NODE_PALETTE_DRAG_MIME,
                encodeBuilderNodePaletteDrag(dragPayload),
              );
              // A harmless text/plain mirror so the OS shows a label; the
              // canvas listener only ever reads the custom MIME.
              event.dataTransfer.setData("text/plain", label);
              // Bridge the payload to the canvas drop target (unreadable from
              // dataTransfer during dragover).
              setActiveBuilderNodePaletteDrag(dragPayload);
            }
          : undefined
      }
      onDragEnd={
        dragPayload
          ? () => setActiveBuilderNodePaletteDrag(null)
          : undefined
      }
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        minHeight: 26,
        padding: "0 11px",
        boxSizing: "border-box",
        borderRadius: tone.radius,
        border: `1px solid ${lit ? tone.hoverBorder : tone.border}`,
        background: lit ? tone.hoverBg : tone.bg,
        color: lit ? tone.hoverText : tone.text,
        fontSize: 10.5,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition:
          "background 110ms ease, border-color 110ms ease, color 110ms ease, transform 90ms ease",
        transform: active ? "scale(0.96)" : "scale(1)",
      }}
    >
      {label}
    </button>
  );
}
