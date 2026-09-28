"use client";

/**
 * Content inspector for the W-12 `portfolio` native block.
 */
import type { ReactNode } from "react";

import {
  PORTFOLIO_DEFAULT_PROPS,
  PORTFOLIO_LAYOUTS,
  type PortfolioLayout,
} from "@/lib/site-admin/builder-node/portfolio-defaults";
import type { BuilderPortfolioNode } from "@/lib/site-admin/builder-node/types";

import { KIT } from "./kit/tokens";
import { InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;

const LAYOUT_LABELS: Record<PortfolioLayout, string> = {
  filmstrip: "Filmstrip",
  grid: "Grid",
  masonry: "Masonry",
  contact_sheet: "Contact sheet",
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

export function PortfolioContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderPortfolioNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const layout = (p.layout ?? PORTFOLIO_DEFAULT_PROPS.layout) as PortfolioLayout;
  const showCaptions = p.showCaptions === true;
  const linkMode = p.linkMode ?? PORTFOLIO_DEFAULT_PROPS.linkMode;
  const columns =
    p.columns ?? (layout === "contact_sheet" ? 4 : layout === "masonry" ? 2 : 3);

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="portfolio"
      data-portfolio-inspector="content"
    >
      <Section
        title="Content"
        info="Live photos from your media library. Captions are optional; linking opens the tagged service."
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
            value={p.title ?? PORTFOLIO_DEFAULT_PROPS.title ?? ""}
            placeholder="Recent work"
            onChange={(e) => commitPatch({ title: e.target.value })}
          />
        </div>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showCaptions}
            onChange={(e) => commitPatch({ showCaptions: e.target.checked })}
          />
          <span>
            Show captions
            <span className="mt-0.5 block text-[12px] text-stone-500">
              Optional captions and the linked service name under each photo.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={linkMode !== "none"}
            onChange={(e) =>
              commitPatch({ linkMode: e.target.checked ? "offering" : "none" })
            }
          />
          <span>
            Link photos to a service
            <span className="mt-0.5 block text-[12px] text-stone-500">
              When a photo is tagged to a service in your catalogue, tapping it opens that service.
            </span>
          </span>
        </label>
        <div className={KIT.field}>
          <label className={KIT.label}>Empty message</label>
          <input
            className={KIT.input}
            value={p.emptyMessage ?? PORTFOLIO_DEFAULT_PROPS.emptyMessage ?? ""}
            onChange={(e) => commitPatch({ emptyMessage: e.target.value })}
          />
        </div>
      </Section>
      <Section title="Layout">
        <div className="flex flex-wrap gap-1.5">
          {PORTFOLIO_LAYOUTS.map((l) => {
            const active = layout === l;
            return (
              <button
                key={l}
                type="button"
                className={
                  active
                    ? "rounded-full bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white"
                    : "rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-stone-800"
                }
                onClick={() => commitPatch({ layout: l })}
              >
                {LAYOUT_LABELS[l]}
              </button>
            );
          })}
        </div>
        {layout !== "filmstrip" ? (
          <div className="flex flex-wrap gap-1.5">
            {([2, 3, 4] as const).map((n) => {
              const active = columns === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={
                    active
                      ? "rounded-full bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white"
                      : "rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-stone-800"
                  }
                  onClick={() => commitPatch({ columns: n })}
                >
                  {n} columns
                </button>
              );
            })}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
