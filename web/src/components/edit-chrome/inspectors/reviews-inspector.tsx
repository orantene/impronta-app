"use client";

/**
 * Content inspector for the W-14 `reviews` native block.
 */
import type { ReactNode } from "react";

import {
  REVIEWS_DEFAULT_PROPS,
  REVIEWS_LAYOUTS,
  type ReviewsLayout,
} from "@/lib/site-admin/builder-node/reviews-defaults";
import type { BuilderReviewsNode } from "@/lib/site-admin/builder-node/types";

import { KIT } from "./kit/tokens";
import { InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;

const LAYOUT_LABELS: Record<ReviewsLayout, string> = {
  trio: "Trio",
  single: "Single",
  row: "Row",
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

export function ReviewsContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderReviewsNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const layout = (p.layout ?? REVIEWS_DEFAULT_PROPS.layout) as ReviewsLayout;
  const showRating = p.showRating !== false;
  const autoplayMs = p.autoplayMs ?? REVIEWS_DEFAULT_PROPS.autoplayMs ?? 0;
  const loop = p.loop !== false;
  const showDots = p.showDots !== false;
  const showArrows = p.showArrows === true;

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="reviews"
      data-reviews-inspector="content"
    >
      <Section
        title="Content"
        info="Live quotes from published client reviews. The block hides itself when there are none."
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
            value={p.title ?? REVIEWS_DEFAULT_PROPS.title ?? ""}
            placeholder="What clients say"
            onChange={(e) => commitPatch({ title: e.target.value })}
          />
        </div>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showRating}
            onChange={(e) => commitPatch({ showRating: e.target.checked })}
          />
          <span>
            Show star rating
            <span className="mt-0.5 block text-[12px] text-stone-500">
              From the published review. Never invents stars.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Layout" info="Trio, single, or row on the shared slider.">
        <div className={KIT.field}>
          <label className={KIT.label}>Layout</label>
          <select
            className={KIT.input}
            value={layout}
            onChange={(e) =>
              commitPatch({ layout: e.target.value as ReviewsLayout })
            }
          >
            {REVIEWS_LAYOUTS.map((key) => (
              <option key={key} value={key}>
                {LAYOUT_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Motion" info="Autoplay pauses for reduced motion and while editing.">
        <div className={KIT.field}>
          <label className={KIT.label}>Autoplay (ms)</label>
          <input
            className={KIT.input}
            type="number"
            min={0}
            max={60000}
            step={500}
            value={autoplayMs}
            onChange={(e) => {
              const n = Number(e.target.value);
              commitPatch({ autoplayMs: Number.isFinite(n) ? Math.max(0, n) : 0 });
            }}
          />
          <p className="mt-1 text-[12px] text-stone-500">0 turns autoplay off.</p>
        </div>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={loop}
            onChange={(e) => commitPatch({ loop: e.target.checked })}
          />
          <span>Loop</span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showDots}
            onChange={(e) => commitPatch({ showDots: e.target.checked })}
          />
          <span>Show dots</span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showArrows}
            onChange={(e) => commitPatch({ showArrows: e.target.checked })}
          />
          <span>Show arrows</span>
        </label>
      </Section>
    </div>
  );
}
