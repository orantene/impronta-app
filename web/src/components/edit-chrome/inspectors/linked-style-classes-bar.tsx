"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { InlineNameInput } from "./kit/inline-name-input";

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

const inputStyle = {
  height: 28,
  paddingInline: 8,
  fontSize: 11,
  fontWeight: 500,
  background: CHROME.surface,
  border: `1px solid ${CHROME.controlBorder}`,
  borderRadius: 7,
  color: CHROME.ink,
  flex: 1,
  minWidth: 0,
} as const;

export function LinkedStyleClassesBar({
  pageId,
  currentStyle,
  onSetStyle,
}: {
  pageId: string | null;
  currentStyle: BuilderNodeStyle | undefined;
  onSetStyle: (style: BuilderNodeStyle | undefined) => void;
}) {
  const [classes, setClasses] = useState<ReadonlyArray<BuilderStyleClass>>([]);
  const [picking, setPicking] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [namingMode, setNamingMode] = useState<"create" | "rename" | null>(null);
  const [namingValue, setNamingValue] = useState("");
  const [renameClassId, setRenameClassId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  // INS-3: inline confirm for delete (replaces window.confirm).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setClasses(readClasses(pageId));
  }, [pageId]);

  useEffect(() => {
    if (namingMode && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [namingMode]);

  const persist = useCallback(
    (next: ReadonlyArray<BuilderStyleClass>): boolean => {
      const ok = writeClasses(pageId, next);
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
  const styleSnapshot = stripClassRef(currentStyle) ?? {};
  const hasStyle = Object.keys(styleSnapshot).length > 0;

  const clearNaming = () => {
    setNamingMode(null);
    setNamingValue("");
    setRenameClassId(null);
  };

  const applyClass = (classId: string) => {
    setPicking(false);
    setInlineMessage(null);
    onSetStyle({ ...(currentStyle ?? {}), classRef: classId });
  };

  const commitCreateClass = () => {
    const name = namingValue.trim();
    if (!name) {
      setInlineMessage("Enter a name for the style class.");
      return;
    }
    if (Object.keys(styleSnapshot).length === 0) {
      setInlineMessage(
        "Style this block first, set padding, color, or another property below, then save it as a class.",
      );
      clearNaming();
      return;
    }
    const id = styleClassIdFromName(
      name,
      classes.map((c) => c.id),
    );
    const nextClass: BuilderStyleClass = { id, name, style: styleSnapshot };
    const saved = persist([...classes, nextClass]);
    if (!saved) {
      setInlineMessage(
        "Couldn't save the style class in this browser. Free up space and try again.",
      );
      return;
    }
    onSetStyle({ classRef: id });
    clearNaming();
    setInlineMessage(null);
    setPicking(false);
  };

  const commitRenameClass = () => {
    const name = namingValue.trim();
    if (!name || !renameClassId) {
      clearNaming();
      return;
    }
    persist(
      classes.map((c) => (c.id === renameClassId ? { ...c, name } : c)),
    );
    clearNaming();
  };

  const handleApplyClick = () => {
    setInlineMessage(null);
    clearNaming();
    if (classes.length === 0) {
      setInlineMessage(
        "No classes yet. Style a block, then use “Create class from this block”.",
      );
      setPicking(false);
      return;
    }
    setPicking((v) => !v);
  };

  const handleCreateClick = () => {
    setInlineMessage(null);
    setPicking(false);
    if (!hasStyle) {
      setInlineMessage(
        "Style this block first, set padding, color, or another property below, then save it as a class.",
      );
      clearNaming();
      return;
    }
    setNamingMode("create");
    setNamingValue("");
    setRenameClassId(null);
  };

  const startRenameClass = (klass: BuilderStyleClass) => {
    setInlineMessage(null);
    setPicking(false);
    setNamingMode("rename");
    setNamingValue(klass.name);
    setRenameClassId(klass.id);
  };

  const confirmDeleteClass = (classId: string) => {
    // Show inline confirm — user must click the confirm button (replaces window.confirm).
    setConfirmDeleteId(classId);
  };

  const commitDeleteClass = (classId: string) => {
    setConfirmDeleteId(null);
    persist(classes.filter((c) => c.id !== classId));
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
    const flattened = mergeBuilderNodeStyle(
      linkedClass.style,
      stripClassRef(currentStyle) ?? {},
    );
    onSetStyle(flattened && Object.keys(flattened).length > 0 ? flattened : undefined);
  };

  const updateClassFromBlock = () => {
    if (!linkedClass) return;
    const effective = stripClassRef(currentStyle) ?? {};
    const merged = mergeBuilderNodeStyle(linkedClass.style, effective);
    persist(
      classes.map((c) => (c.id === linkedClass.id ? { ...c, style: merged } : c)),
    );
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
          style={{ ...btnStyle, opacity: classes.length > 0 ? 1 : 0.65 }}
          aria-disabled={classes.length === 0}
          onClick={handleApplyClick}
        >
          Apply class…
        </button>
        <button
          type="button"
          data-builder-style-class-action="create"
          style={{ ...btnStyle, opacity: hasStyle ? 1 : 0.65 }}
          aria-disabled={!hasStyle}
          onClick={handleCreateClick}
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

      {inlineMessage ? (
        <p
          data-builder-style-class-hint=""
          style={{
            margin: 0,
            fontSize: 11,
            lineHeight: 1.45,
            color: CHROME.muted,
          }}
        >
          {inlineMessage}
        </p>
      ) : null}

      {namingMode ? (
        <div
          className="flex flex-col gap-1.5"
          data-builder-style-class-naming=""
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              clearNaming();
            }
          }}
        >
          <label
            htmlFor="builder-style-class-name"
            style={{ fontSize: 11, fontWeight: 600, color: CHROME.ink }}
          >
            {namingMode === "create" ? "Class name" : "Rename class"}
          </label>
          <div className="flex gap-1.5">
            <input
              ref={nameInputRef}
              id="builder-style-class-name"
              type="text"
              value={namingValue}
              placeholder="e.g. Card shadow"
              onChange={(event) => setNamingValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (namingMode === "create") commitCreateClass();
                  else commitRenameClass();
                }
              }}
              style={inputStyle}
            />
            <button
              type="button"
              style={btnStyle}
              onClick={
                namingMode === "create" ? commitCreateClass : commitRenameClass
              }
            >
              Save
            </button>
            <button
              type="button"
              style={{ ...btnStyle, background: "transparent" }}
              onClick={clearNaming}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {picking && classes.length > 0 ? (
        <div className="flex flex-col gap-1" data-builder-style-class-picker="">
          {classes.map((klass) => (
            <div key={klass.id} className="flex flex-col gap-1">
              <div
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
                  onClick={() => startRenameClass(klass)}
                  title="Rename"
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="cursor-pointer leading-none"
                  style={{ fontSize: 14, color: CHROME.muted, background: "transparent" }}
                  onClick={() => confirmDeleteClass(klass.id)}
                  title="Delete class"
                >
                  ×
                </button>
              </div>
              {confirmDeleteId === klass.id ? (
                <InlineNameInput
                  mode="confirm"
                  title={`Delete class "${klass.name}"?`}
                  description="Blocks linked to this class keep their current look."
                  confirmLabel="Delete"
                  cancelLabel="Keep"
                  onConfirm={() => commitDeleteClass(klass.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
