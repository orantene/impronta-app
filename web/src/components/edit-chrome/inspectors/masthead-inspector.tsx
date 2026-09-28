/**
 * Content inspector for the shared `masthead` (stacked giant words) block.
 * Editable lines, optional subline / credit, cover + B&W filter.
 */
"use client";

import type { ReactNode } from "react";

import {
  MASTHEAD_COVER_FILTERS,
  MASTHEAD_DEFAULT_PROPS,
  MASTHEAD_LINES_MAX,
  type MastheadCoverFilter,
} from "@/lib/site-admin/builder-node/masthead-defaults";
import type { BuilderMastheadNode } from "@/lib/site-admin/builder-node/types";

import {
  KIT,
  InspectorItemRow,
  InspectorRowDelete,
  DraggableList,
  type DragHandleProps,
} from "./kit";
import { InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;

function Section({
  title,
  info,
  children,
}: {
  title: string;
  info?: string;
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

function cleanLines(lines: string[]): string[] {
  return lines.map((line) => (line ?? "").slice(0, 80));
}

export function MastheadContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderMastheadNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const splitWords = p.splitWords !== false;
  const showCover = p.showCover !== false;
  const coverFilter = (p.coverFilter ??
    MASTHEAD_DEFAULT_PROPS.coverFilter ??
    "bw") as MastheadCoverFilter;
  const lines = cleanLines(
    ((p.lines as string[] | undefined) ?? MASTHEAD_DEFAULT_PROPS.lines ?? []).slice(),
  );

  const patchLines = (next: string[]) => {
    commitPatch({ lines: cleanLines(next).slice(0, MASTHEAD_LINES_MAX) });
  };

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="masthead"
      data-masthead-inspector="content"
    >
      <Section
        title="Stacked words"
        info="Each row is one giant line in the masthead. With one line and Split words on, spaces become separate stack rows on the page."
      >
        <DraggableList<string>
          items={lines}
          keyOf={(line, i) => `${line || "row"}-${i}`}
          onReorder={(next) => patchLines(next)}
        >
          {(line, index, handleProps) => (
            <MastheadLineRow
              line={line}
              handleProps={handleProps}
              canRemove={lines.length > 1}
              onChange={(next) => {
                const copy = lines.slice();
                copy[index] = next;
                patchLines(copy);
              }}
              onRemove={() => {
                patchLines(lines.filter((_, i) => i !== index));
              }}
            />
          )}
        </DraggableList>
        {lines.length < MASTHEAD_LINES_MAX ? (
          <button
            type="button"
            className="mt-1 self-start rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
            onClick={() => patchLines([...lines, `Line ${lines.length + 1}`])}
          >
            Add line
          </button>
        ) : null}
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={splitWords}
            onChange={(e) => commitPatch({ splitWords: e.target.checked })}
          />
          <span>Split a single line into stacked words</span>
        </label>
      </Section>

      <Section title="Credit">
        <div className={KIT.field}>
          <label className={KIT.label}>Subline</label>
          <input
            className={KIT.input}
            value={p.subline ?? ""}
            placeholder="Optional role or issue line"
            onChange={(e) => commitPatch({ subline: e.target.value })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Credit</label>
          <input
            className={KIT.input}
            value={p.creditLine ?? ""}
            placeholder="Optional credit"
            onChange={(e) => commitPatch({ creditLine: e.target.value })}
          />
        </div>
      </Section>

      <Section
        title="Cover"
        info="Full-bleed photo behind the stacked words. B&W is the magazine default."
      >
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showCover}
            onChange={(e) => commitPatch({ showCover: e.target.checked })}
          />
          <span>Show cover photo</span>
        </label>
        {showCover ? (
          <>
            <div className={KIT.field}>
              <label className={KIT.label}>Cover image URL</label>
              <input
                className={KIT.input}
                value={p.coverSrc ?? MASTHEAD_DEFAULT_PROPS.coverSrc ?? ""}
                placeholder="{{headshotUrl}}"
                onChange={(e) => commitPatch({ coverSrc: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {MASTHEAD_COVER_FILTERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={
                    coverFilter === id
                      ? "rounded-md border border-stone-800 bg-stone-800 px-2.5 py-1.5 text-[12px] text-white"
                      : "rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
                  }
                  onClick={() => commitPatch({ coverFilter: id })}
                >
                  {id === "bw" ? "Black and white" : "Full color"}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </Section>
    </div>
  );
}

function MastheadLineRow({
  line,
  handleProps,
  canRemove,
  onChange,
  onRemove,
}: {
  line: string;
  handleProps: DragHandleProps;
  canRemove: boolean;
  onChange: (next: string) => void;
  onRemove: () => void;
}) {
  return (
    <InspectorItemRow
      handleProps={handleProps}
      trailing={canRemove ? <InspectorRowDelete onClick={onRemove} /> : null}
    >
      <input
        type="text"
        className="w-full rounded-sm bg-transparent px-0 py-0.5 text-[13px] font-medium text-stone-900 placeholder:text-stone-500 focus:outline-none"
        value={line}
        placeholder="Word or line"
        maxLength={80}
        onChange={(e) => onChange(e.target.value)}
      />
    </InspectorItemRow>
  );
}
