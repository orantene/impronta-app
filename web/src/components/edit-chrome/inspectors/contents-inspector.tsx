/**
 * Content inspector for the shared `contents` (chapter index) block.
 * Editable labels + target anchors; reorderable list.
 */
"use client";

import type { ReactNode } from "react";

import {
  CONTENTS_DEFAULT_PROPS,
  CONTENTS_ITEMS_MAX,
  CONTENTS_NUMBER_STYLES,
  type ContentsItem,
  type ContentsNumberStyle,
} from "@/lib/site-admin/builder-node/contents-defaults";
import { normalizeAnchorId } from "@/lib/site-admin/builder-node/anchor-id";
import type { BuilderContentsNode } from "@/lib/site-admin/builder-node/types";

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

function cleanItems(items: ContentsItem[]): ContentsItem[] {
  return items.map((it) => ({
    label: (it.label ?? "").slice(0, 80),
    anchor: (it.anchor ?? "").slice(0, 64),
  }));
}

export function ContentsContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderContentsNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const showNumbers = p.showNumbers !== false;
  const numberStyle = (p.numberStyle ??
    CONTENTS_DEFAULT_PROPS.numberStyle ??
    "roman") as ContentsNumberStyle;
  const items = cleanItems(
    ((p.items as ContentsItem[] | undefined) ?? CONTENTS_DEFAULT_PROPS.items ?? []).slice(),
  );

  const patchItems = (next: ContentsItem[]) => {
    commitPatch({ items: cleanItems(next).slice(0, CONTENTS_ITEMS_MAX) });
  };

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="contents"
      data-contents-inspector="content"
    >
      <Section
        title="Content"
        info="A chapter index with links to sections on this page. Anchors must match a block Anchor name (Data panel) or a chapter id like chapter-1."
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Eyebrow</label>
          <input
            className={KIT.input}
            value={p.eyebrow ?? ""}
            placeholder="Optional"
            onChange={(e) => commitPatch({ eyebrow: e.target.value })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Heading</label>
          <input
            className={KIT.input}
            value={p.title ?? CONTENTS_DEFAULT_PROPS.title ?? ""}
            placeholder="Contents"
            onChange={(e) => commitPatch({ title: e.target.value })}
          />
        </div>
      </Section>

      <Section title="Numbers">
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showNumbers}
            onChange={(e) => commitPatch({ showNumbers: e.target.checked })}
          />
          <span>Show chapter numbers beside each link</span>
        </label>
        {showNumbers ? (
          <div className="flex flex-wrap gap-2">
            {CONTENTS_NUMBER_STYLES.map((id) => (
              <button
                key={id}
                type="button"
                className={
                  numberStyle === id
                    ? "rounded-md border border-stone-800 bg-stone-800 px-2.5 py-1.5 text-[12px] text-white"
                    : "rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
                }
                onClick={() => commitPatch({ numberStyle: id })}
              >
                {id === "roman" ? "Roman (I, II)" : "Decimal (01, 02)"}
              </button>
            ))}
          </div>
        ) : null}
      </Section>

      <Section
        title="Chapters"
        info="Each row needs a label and an anchor. Drag to reorder."
      >
        <DraggableList<ContentsItem>
          items={items}
          keyOf={(it, i) => `${it.anchor || "row"}-${i}`}
          onReorder={(next) => patchItems(next)}
        >
          {(item, index, handleProps) => (
            <ContentsItemRow
              item={item}
              handleProps={handleProps}
              canRemove={items.length > 1}
              onChange={(next) => {
                const copy = items.slice();
                copy[index] = next;
                patchItems(copy);
              }}
              onRemove={() => {
                patchItems(items.filter((_, i) => i !== index));
              }}
            />
          )}
        </DraggableList>
        {items.length < CONTENTS_ITEMS_MAX ? (
          <button
            type="button"
            className="mt-1 self-start rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
            onClick={() =>
              patchItems([
                ...items,
                {
                  label: `Chapter ${items.length + 1}`,
                  anchor: `chapter-${items.length + 1}`,
                },
              ])
            }
          >
            Add chapter
          </button>
        ) : null}
      </Section>
    </div>
  );
}

function ContentsItemRow({
  item,
  handleProps,
  canRemove,
  onChange,
  onRemove,
}: {
  item: ContentsItem;
  handleProps: DragHandleProps;
  canRemove: boolean;
  onChange: (next: ContentsItem) => void;
  onRemove: () => void;
}) {
  return (
    <InspectorItemRow
      handleProps={handleProps}
      trailing={canRemove ? <InspectorRowDelete onClick={onRemove} /> : null}
    >
      <div className="flex flex-col gap-1.5">
        <input
          type="text"
          className="w-full rounded-sm bg-transparent px-0 py-0.5 text-[13px] font-medium text-stone-900 placeholder:text-stone-500 focus:outline-none"
          value={item.label}
          placeholder="Editorial"
          maxLength={80}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
        />
        <input
          type="text"
          className="w-full rounded-sm bg-transparent px-0 py-0 text-[11px] text-stone-500 placeholder:text-stone-500 focus:outline-none"
          value={item.anchor}
          placeholder="chapter-1"
          maxLength={64}
          onChange={(e) => onChange({ ...item, anchor: e.target.value })}
          onBlur={() => {
            const normalized = normalizeAnchorId(item.anchor);
            if (normalized && normalized !== item.anchor) {
              onChange({ ...item, anchor: normalized });
            }
          }}
        />
      </div>
    </InspectorItemRow>
  );
}
