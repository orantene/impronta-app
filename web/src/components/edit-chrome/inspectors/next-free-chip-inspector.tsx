/**
 * Content inspector for the `next_free_chip` block (the live "Next free" slot
 * chip, e.g. over the Maison v2 hero photo).
 *
 * Before this inspector the kind fell through to the generic "no editor"
 * panel, so the two things the renderer reads (the inline vs stacked variant
 * and the EN / ES label) could only be set by a design, never by the talent.
 * `days` is not offered: the renderer reserves it (the slots fetch always
 * looks 14 days ahead today), so a control would do nothing.
 */
"use client";

import type { ReactNode } from "react";

import type { BuilderNextFreeChipNode } from "@/lib/site-admin/builder-node/types";

import { KIT } from "./kit";
import { InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;

export const NEXT_FREE_CHIP_VARIANTS = ["inline", "stacked"] as const;

const VARIANT_LABELS: Record<(typeof NEXT_FREE_CHIP_VARIANTS)[number], string> = {
  inline: "Inline pill",
  stacked: "Stacked card",
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

export function NextFreeChipContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderNextFreeChipNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const variant = p.variant ?? "inline";

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="next_free_chip"
      data-next-free-chip-inspector="content"
    >
      <Section
        title="Style"
        info="Shows your next open time from your live calendar. It hides itself when nothing is free."
      >
        <div className="flex flex-wrap gap-2">
          {NEXT_FREE_CHIP_VARIANTS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={variant === id}
              className={
                variant === id
                  ? "rounded-md border border-stone-800 bg-stone-800 px-2.5 py-1.5 text-[12px] text-white"
                  : "rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
              }
              onClick={() => commitPatch({ variant: id })}
            >
              {VARIANT_LABELS[id]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Label" info="The words before the time. Leave empty for the default.">
        <div className={KIT.field}>
          <label className={KIT.label}>English</label>
          <input
            className={KIT.input}
            value={p.labelEn ?? ""}
            placeholder="Next free"
            maxLength={40}
            onChange={(e) => commitPatch({ labelEn: e.target.value.slice(0, 40) })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Spanish</label>
          <input
            className={KIT.input}
            value={p.labelEs ?? ""}
            placeholder="Próximo libre"
            maxLength={40}
            onChange={(e) => commitPatch({ labelEs: e.target.value.slice(0, 40) })}
          />
        </div>
      </Section>
    </div>
  );
}
