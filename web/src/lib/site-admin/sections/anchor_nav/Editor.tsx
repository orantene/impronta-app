"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { LinkPicker } from "../shared/LinkPicker";
import type { SectionEditorProps } from "../types";
import type { AnchorNavV1, AnchorNavLink } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT = "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function AnchorNavEditor({ initial, onChange }: SectionEditorProps<AnchorNavV1>) {
  const value: AnchorNavV1 = {
    links:
      initial.links ??
      [
        { label: "About", href: "#about" },
        { label: "Services", href: "#services" },
        { label: "Work", href: "#work" },
        { label: "Contact", href: "#contact" },
      ],
    variant: initial.variant ?? "pills",
    sticky: initial.sticky ?? false,
    align: initial.align ?? "center",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<AnchorNavV1>) => onChange({ ...value, ...p });
  const patchLink = (i: number, p: Partial<AnchorNavLink>) =>
    patch({ links: value.links.map((l, j) => (j === i ? { ...l, ...p } : l)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Variant</span>
          <select className={INPUT} value={value.variant} onChange={(e) => patch({ variant: e.target.value as AnchorNavV1["variant"] })}>
            <option value="pills">Pills</option>
            <option value="underline">Underline</option>
            <option value="tabs">Tabs</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Alignment</span>
          <select className={INPUT} value={value.align} onChange={(e) => patch({ align: e.target.value as AnchorNavV1["align"] })}>
            <option value="start">Start</option>
            <option value="center">Center</option>
            <option value="end">End</option>
          </select>
        </label>
        <label className={`${FIELD} flex-row items-center gap-2`}>
          <input type="checkbox" checked={value.sticky} onChange={(e) => patch({ sticky: e.target.checked })} />
          <span className={LABEL}>Sticky to top</span>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Links ({value.links.length} / 20)</span>
          <button
            type="button"
            disabled={value.links.length >= 20}
            onClick={() => patch({ links: [...value.links, { label: "New", href: "#" }] })}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.links.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
            <input className={INPUT} placeholder="Label" value={l.label} onChange={(e) => patchLink(i, { label: e.target.value })} />
            <LinkPicker value={l.href} onChange={(next) => patchLink(i, { href: next })} />
            <button
              type="button"
              disabled={value.links.length <= 2}
              onClick={() => patch({ links: value.links.filter((_, j) => j !== i) })}
              className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <PresentationPanel value={value.presentation} onChange={(next) => patch({ presentation: next })} />
    </div>
  );
}
