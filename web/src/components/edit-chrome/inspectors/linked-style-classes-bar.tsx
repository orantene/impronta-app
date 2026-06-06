"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { BuilderNodeStyle } from "@/lib/site-admin/builder-node/types";
import {
  mergeBuilderNodeStyle,
  stripClassRef,
  styleClassIdFromName,
  type BuilderStyleClass,
} from "@/lib/site-admin/builder-node/style-classes";
import {
  readClasses,
  writeClasses,
} from "@/lib/site-admin/builder-node/style-classes-storage";
import { CHROME } from "../kit/tokens";

/**
 * Wave 3 · Item 3B — LINKED STYLE CLASSES inspector control.
 *
 * Unlike "Save preset" (style-presets-bar.tsx) which COPIES a style, this bar
 * manages named, REFERENCED style classes: applying a class stores only its id
 * (`style.classRef`) on the block, so editing the class restyles every linked
 * block. The class REGISTRY is PAGE-SCOPED and persisted in localStorage keyed
 * by `pageId` (no DB migration — the same per-browser persistence the preset
 * bar uses). The renderer merges a referenced class beneath the node's own
 * props (see style-classes.ts + render.tsx).
 *
 * The control surfaces:
 *   • the linked class NAME badge (when the block is linked)
 *   • "Apply class …" — link the block to an existing class (its id is written
 *     onto the block's style; the block's own props still win on top)
 *   • "Create class from this block" — snapshot the block's CURRENT style into
 *     a new named class and link the block to it (the block's own style becomes
 *     just `{ classRef }`, so the class fully drives it — the cleanest "edit the
 *     class → the block changes" demo)
 *   • per-class "Edit name" / "Delete" and, on the linked block, "Unlink"
 *     (flattens the class back onto the block so its look is preserved)
 *
 * STORAGE: the read/write helpers + the live cross-subtree registry bridge now
 * live in the shared `builder-node/style-classes-storage.ts` so the editor
 * canvas + the publish path read ONE source of truth (W1-T1). `writeClasses`
 * republishes the registry to the canvas bridge on every change. As of W1-T2
 * the publish path BAKES the registry into the snapshot, so linked styles also
 * reach the live site.
 */

const btnStyle = {
  height: 28,
  paddingInline: 10,
  fontSize: 11,
  fontWeight: 600,
  background: CHROME.surface2,
  border: `1px solid ${CHROME.controlBorder}`,
  borderRadius: 7,
  color: CHROME.ink,
  cursor: "pointer" as const,
};

export function LinkedStyleClassesBar({
  pageId,
  currentStyle,
  onSetStyle,
}: {
  /** Page id → registry localStorage key (page-scoped classes). */
  pageId: string | null;
  /** The selected block's full style (incl. any existing classRef). */
  currentStyle: BuilderNodeStyle | undefined;
  /**
   * Overwrite the selected block's style. Used to (a) write `classRef` on
   * apply/create, and (b) flatten the class back onto the block on unlink.
   * Passing `undefined` clears the block's style.
   */
  onSetStyle: (style: BuilderNodeStyle | undefined) => void;
}) {
  const [classes, setClasses] = useState<ReadonlyArray<BuilderStyleClass>>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setClasses(readClasses(pageId));
  }, [pageId]);

  const persist = useCallback(
    (next: ReadonlyArray<BuilderStyleClass>): boolean => {
      const ok = writeClasses(pageId, next);
      // Only mirror into React state when the registry actually persisted, so
      // local state never claims a class exists that storage refused to keep.
      if (ok) setClasses(next);
      return ok;
    },
    [pageId],
  );

  const linkedId = currentStyle?.classRef ?? null;
  const linkedClass = useMemo(
    () => (linkedId ? classes.find((c) => c.id === linkedId) ?? null : null),
    [classes, linkedId],
  );
  const hasStyle = Boolean(currentStyle && Object.keys(currentStyle).length > 0);

  const applyClass = (classId: string) => {
    setPicking(false);
    onSetStyle({ ...(currentStyle ?? {}), classRef: classId });
  };

  const createClassFromBlock = () => {
    // Snapshot the block's CURRENT style (minus any existing classRef) as the
    // new class, then link the block so the class fully drives it.
    const snapshot = stripClassRef(currentStyle) ?? {};
    if (Object.keys(snapshot).length === 0) {
      window.alert("Style this block first, then save it as a class.");
      return;
    }
    const name = window.prompt("Name this style class");
    if (!name?.trim()) return;
    const id = styleClassIdFromName(
      name,
      classes.map((c) => c.id),
    );
    const nextClass: BuilderStyleClass = { id, name: name.trim(), style: snapshot };
    // SAFETY (Marathon W1-T3): persist FIRST and only collapse the block to a
    // bare `{ classRef }` once the registry write is confirmed. If storage
    // refused the write (quota / private mode), the class would not exist and
    // `{ classRef: id }` would resolve to the node's own (now-stripped) style —
    // i.e. it would blank the block. On failure we keep the block's existing
    // style intact and tell the operator nothing was saved.
    const saved = persist([...classes, nextClass]);
    if (!saved) {
      window.alert(
        "Couldn't save the style class in this browser, so the block was left unchanged. Free up some space and try again.",
      );
      return;
    }
    // The block now references the class and keeps no local overrides, so the
    // class is the single source of truth for its look.
    onSetStyle({ classRef: id });
  };

  const renameClass = (klass: BuilderStyleClass) => {
    const name = window.prompt("Rename style class", klass.name);
    if (!name?.trim()) return;
    persist(classes.map((c) => (c.id === klass.id ? { ...c, name: name.trim() } : c)));
  };

  const deleteClass = (classId: string) => {
    if (
      !window.confirm(
        "Delete this style class? Blocks linked to it keep their current look.",
      )
    ) {
      return;
    }
    persist(classes.filter((c) => c.id !== classId));
    // If the SELECTED block was linked to it, flatten so its look is preserved.
    if (linkedId === classId) {
      const klass = classes.find((c) => c.id === classId);
      const flattened = klass
        ? mergeBuilderNodeStyle(klass.style, stripClassRef(currentStyle) ?? {})
        : stripClassRef(currentStyle);
      onSetStyle(flattened && Object.keys(flattened).length > 0 ? flattened : undefined);
    }
  };

  const unlinkSelected = () => {
    if (!linkedClass) {
      onSetStyle(stripClassRef(currentStyle));
      return;
    }
    // Flatten the class onto the block so unlinking does not change its look.
    const flattened = mergeBuilderNodeStyle(
      linkedClass.style,
      stripClassRef(currentStyle) ?? {},
    );
    onSetStyle(flattened && Object.keys(flattened).length > 0 ? flattened : undefined);
  };

  const updateClassFromBlock = () => {
    // "Edit class" by example: push the SELECTED block's effective style into the
    // linked class so every other linked block updates too. The block's own
    // local overrides (beyond classRef) are folded into the class.
    if (!linkedClass) return;
    const effective = stripClassRef(currentStyle) ?? {};
    const merged = mergeBuilderNodeStyle(linkedClass.style, effective);
    persist(
      classes.map((c) => (c.id === linkedClass.id ? { ...c, style: merged } : c)),
    );
    // The block's local overrides are now part of the class → reset it to a pure
    // reference so the class is the single source of truth.
    onSetStyle({ classRef: linkedClass.id });
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-2"
      data-builder-style-classes=""
      style={{ background: CHROME.surface, border: `1px solid ${CHROME.line}` }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 11, fontWeight: 700, color: CHROME.muted }}>
          Style class
        </span>
        {linkedClass ? (
          <span
            data-builder-style-class-linked={linkedClass.id}
            className="inline-flex items-center gap-1 rounded-full"
            style={{
              paddingInline: 8,
              height: 22,
              fontSize: 11,
              fontWeight: 600,
              background: CHROME.surface2,
              border: `1px solid ${CHROME.controlBorder}`,
              color: CHROME.ink,
            }}
            title={`Linked to "${linkedClass.name}"`}
          >
            <span aria-hidden style={{ color: CHROME.accent }}>
              ◆
            </span>
            {linkedClass.name}
          </span>
        ) : linkedId ? (
          // Linked to a class id that is not in this browser's registry (e.g.
          // authored elsewhere). Show the raw id so the link is still visible.
          <span
            data-builder-style-class-linked={linkedId}
            style={{ fontSize: 11, color: CHROME.muted }}
            title="Linked to a class not stored in this browser"
          >
            ◆ {linkedId}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          data-builder-style-class-action="apply"
          style={{ ...btnStyle, opacity: classes.length > 0 ? 1 : 0.45 }}
          disabled={classes.length === 0}
          onClick={() => setPicking((v) => !v)}
        >
          Apply class…
        </button>
        <button
          type="button"
          data-builder-style-class-action="create"
          style={{ ...btnStyle, opacity: hasStyle ? 1 : 0.45 }}
          disabled={!hasStyle}
          onClick={createClassFromBlock}
        >
          Create class from this block
        </button>
        {linkedId ? (
          <button
            type="button"
            data-builder-style-class-action="unlink"
            style={btnStyle}
            onClick={unlinkSelected}
          >
            Unlink
          </button>
        ) : null}
        {linkedClass ? (
          <button
            type="button"
            data-builder-style-class-action="update"
            style={btnStyle}
            onClick={updateClassFromBlock}
            title="Push this block's style into the class (updates all linked blocks)"
          >
            Update class from block
          </button>
        ) : null}
      </div>

      {picking && classes.length > 0 ? (
        <div className="flex flex-col gap-1" data-builder-style-class-picker="">
          {classes.map((klass) => (
            <div
              key={klass.id}
              className="flex items-center justify-between gap-2 rounded-md"
              style={{
                paddingInline: 8,
                height: 28,
                background: CHROME.surface2,
                border: `1px solid ${CHROME.line}`,
              }}
            >
              <button
                type="button"
                data-builder-style-class-pick={klass.id}
                className="flex-1 text-left"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: linkedId === klass.id ? CHROME.accent : CHROME.ink,
                  background: "transparent",
                }}
                onClick={() => applyClass(klass.id)}
                title={`Apply "${klass.name}"`}
              >
                {linkedId === klass.id ? "◆ " : ""}
                {klass.name}
              </button>
              <button
                type="button"
                className="cursor-pointer"
                style={{ fontSize: 11, color: CHROME.muted, background: "transparent" }}
                onClick={() => renameClass(klass)}
                title="Rename"
              >
                Edit
              </button>
              <button
                type="button"
                className="cursor-pointer leading-none"
                style={{ fontSize: 14, color: CHROME.muted, background: "transparent" }}
                onClick={() => deleteClass(klass.id)}
                title="Delete class"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
