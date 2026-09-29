/**
 * Content inspector for the shared `statement_footer` block.
 * Editable statement text plus optional credit / contact lines.
 */
"use client";

import type { ReactNode } from "react";

import {
  STATEMENT_FOOTER_ALIGNS,
  STATEMENT_FOOTER_DEFAULT_PROPS,
  type StatementFooterAlign,
} from "@/lib/site-admin/builder-node/statement-footer-defaults";
import type { BuilderStatementFooterNode } from "@/lib/site-admin/builder-node/types";

import { KIT } from "./kit";
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

export function StatementFooterContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderStatementFooterNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const align = (p.align ??
    STATEMENT_FOOTER_DEFAULT_PROPS.align ??
    "center") as StatementFooterAlign;
  const showRule = p.showRule !== false;

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="statement_footer"
      data-statement-footer-inspector="content"
    >
      <Section
        title="Statement"
        info="A short closing line for the page. Keep it to one or two sentences."
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Statement</label>
          <textarea
            className={KIT.input}
            rows={3}
            value={p.statement ?? STATEMENT_FOOTER_DEFAULT_PROPS.statement ?? ""}
            placeholder="Available for editorial, campaign, and portrait commissions."
            maxLength={280}
            onChange={(e) => commitPatch({ statement: e.target.value.slice(0, 280) })}
          />
        </div>
      </Section>

      <Section
        title="Credit and contact"
        info="Optional lines under the statement. Credit is usually the name; contact can be an email, handle, or short ask."
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Credit</label>
          <input
            className={KIT.input}
            value={p.creditLine ?? ""}
            placeholder="Optional credit"
            maxLength={160}
            onChange={(e) => commitPatch({ creditLine: e.target.value.slice(0, 160) })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Contact</label>
          <input
            className={KIT.input}
            value={p.contactLine ?? ""}
            placeholder="Optional contact line"
            maxLength={160}
            onChange={(e) => commitPatch({ contactLine: e.target.value.slice(0, 160) })}
          />
        </div>
      </Section>

      <Section title="Layout">
        <div className="flex flex-wrap gap-2">
          {STATEMENT_FOOTER_ALIGNS.map((id) => (
            <button
              key={id}
              type="button"
              className={
                align === id
                  ? "rounded-md border border-stone-800 bg-stone-800 px-2.5 py-1.5 text-[12px] text-white"
                  : "rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
              }
              onClick={() => commitPatch({ align: id })}
            >
              {id === "center" ? "Centered" : "Start"}
            </button>
          ))}
        </div>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showRule}
            onChange={(e) => commitPatch({ showRule: e.target.checked })}
          />
          <span>Show hairline above the statement</span>
        </label>
      </Section>
    </div>
  );
}
