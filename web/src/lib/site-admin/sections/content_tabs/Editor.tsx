"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import type { SectionEditorProps } from "../types";
import type { ContentTabsV1, ContentTab } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT = "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function ContentTabsEditor({ initial, onChange }: SectionEditorProps<ContentTabsV1>) {
  const value: ContentTabsV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    tabs:
      initial.tabs ??
      [
        { label: "Approach", body: "How we work, in one paragraph." },
        { label: "Process", body: "Three-step flow from inquiry to wrap." },
        { label: "FAQ", body: "Common questions, short answers." },
      ],
    variant: initial.variant ?? "underline",
    defaultTab: initial.defaultTab ?? 0,
    presentation: initial.presentation,
  };
  const patch = (p: Partial<ContentTabsV1>) => onChange({ ...value, ...p });
  const patchTab = (i: number, p: Partial<ContentTab>) =>
    patch({ tabs: value.tabs.map((t, j) => (j === i ? { ...t, ...p } : t)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input className={INPUT} maxLength={60} value={value.eyebrow ?? ""} onChange={(e) => patch({ eyebrow: e.target.value })} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline</span>
          <input className={INPUT} maxLength={200} value={value.headline ?? ""} onChange={(e) => patch({ headline: e.target.value })} />
        </label>
      </div>

      <VariantPicker
        name="tabs.variant"
        legend="Variant"
        sectionKey="content_tabs"
        options={[
          { value: "underline", label: "Underline", hint: "Active tab gets a hairline underline.", schematic: "row" },
          { value: "pills", label: "Pills", hint: "Active tab is a filled pill.", schematic: "row" },
          { value: "bordered", label: "Bordered", hint: "Each tab in a card border.", schematic: "row" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <label className={FIELD}>
        <span className={LABEL}>Default tab (#{value.defaultTab + 1})</span>
        <input
          type="number"
          className={INPUT}
          min={0}
          max={value.tabs.length - 1}
          value={value.defaultTab}
          onChange={(e) => patch({ defaultTab: Math.max(0, Math.min(value.tabs.length - 1, Number(e.target.value))) })}
        />
      </label>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Tabs ({value.tabs.length} / 8)</span>
          <button
            type="button"
            disabled={value.tabs.length >= 8}
            onClick={() => patch({ tabs: [...value.tabs, { label: "New tab", body: "Tab body." }] })}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.tabs.map((t, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <input className={INPUT} placeholder="Tab label" value={t.label} onChange={(e) => patchTab(i, { label: e.target.value })} />
            <textarea className={INPUT} rows={4} placeholder="Tab body (paragraphs separated by blank lines)" value={t.body} onChange={(e) => patchTab(i, { body: e.target.value })} />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={value.tabs.length <= 2}
                onClick={() => patch({ tabs: value.tabs.filter((_, j) => j !== i) })}
                className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
              >
                × Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <PresentationPanel value={value.presentation} onChange={(next) => patch({ presentation: next })} />
    </div>
  );
}
