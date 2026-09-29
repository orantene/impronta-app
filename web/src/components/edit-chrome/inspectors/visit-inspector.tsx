"use client";

/**
 * Content inspector for the shared `visit` native block.
 */
import type { ReactNode } from "react";

import {
  VISIT_DEFAULT_PROPS,
  VISIT_LAYOUTS,
  type VisitLayout,
} from "@/lib/site-admin/builder-node/visit-defaults";
import type { BuilderVisitNode } from "@/lib/site-admin/builder-node/types";

import { KIT } from "./kit/tokens";
import { InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;

const LAYOUT_LABELS: Record<VisitLayout, string> = {
  facts: "Facts",
  split: "Map + facts",
};

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

export function VisitContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderVisitNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const layout = (p.layout ?? VISIT_DEFAULT_PROPS.layout) as VisitLayout;
  const showMap = p.showMap !== false;
  const band = p.band !== false;

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="visit"
      data-visit-inspector="content"
    >
      <Section
        title="Content"
        info="Live facts from your service areas, languages, and booking days. The block hides itself when there are none."
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
            value={p.title ?? VISIT_DEFAULT_PROPS.title ?? ""}
            placeholder="Your visit"
            onChange={(e) => commitPatch({ title: e.target.value })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Italic accent</label>
          <input
            className={KIT.input}
            value={p.titleAccent ?? VISIT_DEFAULT_PROPS.titleAccent ?? ""}
            placeholder="visit"
            onChange={(e) => commitPatch({ titleAccent: e.target.value })}
          />
        </div>
      </Section>

      <Section title="Layout">
        <div className="flex flex-wrap gap-2">
          {VISIT_LAYOUTS.map((id) => (
            <button
              key={id}
              type="button"
              className={
                layout === id
                  ? "rounded-md border border-stone-800 bg-stone-800 px-2.5 py-1.5 text-[12px] text-white"
                  : "rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
              }
              onClick={() => commitPatch({ layout: id })}
            >
              {LAYOUT_LABELS[id]}
            </button>
          ))}
        </div>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={band}
            onChange={(e) => commitPatch({ band: e.target.checked })}
          />
          <span>
            Soft band background
            <span className="mt-0.5 block text-[12px] text-stone-500">
              Uses the surface-raised token behind the section.
            </span>
          </span>
        </label>
      </Section>

      {layout === "split" ? (
        <Section
          title="Map"
          info="Optional. Without a map URL the facts render alone, even in the split layout."
        >
          <label className="flex items-start gap-2 text-[13px] text-stone-800">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={showMap}
              onChange={(e) => commitPatch({ showMap: e.target.checked })}
            />
            <span>Show map when a URL is set</span>
          </label>
          <div className={KIT.field}>
            <label className={KIT.label}>Map image URL</label>
            <input
              className={KIT.input}
              value={p.mapImageUrl ?? ""}
              placeholder="https://example.com/map.png"
              onChange={(e) => commitPatch({ mapImageUrl: e.target.value })}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>Map caption</label>
            <input
              className={KIT.input}
              value={p.mapCaption ?? ""}
              placeholder="Neighbourhood"
              onChange={(e) => commitPatch({ mapCaption: e.target.value })}
            />
          </div>
        </Section>
      ) : null}
    </div>
  );
}
