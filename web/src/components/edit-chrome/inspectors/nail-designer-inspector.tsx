/**
 * Content inspector for the `app_nail_designer` block. Every prop the renderer
 * reads has a control here: heading, intro and button label (per content
 * locale, through the shared localizable field), whether the CTA that sends the
 * design with a booking is on, and which shapes / colours / art / finishes /
 * charms the visitor can use.
 */
"use client";

import type { ReactNode } from "react";

import {
  NAIL_ARTS,
  NAIL_CHARMS,
  NAIL_COLORS,
  NAIL_DESIGNER_CATALOG_IDS,
  NAIL_FINISHES,
  NAIL_SHAPES,
  type NailOptionGroup,
} from "@/lib/site-admin/builder-node/nail-designer-model";
import type { BuilderAppNailDesignerNode } from "@/lib/site-admin/builder-node/types";

import { KIT, InspectorLabelWithInfo } from "./kit";
import { useEditorLocale } from "../use-editor-locale";
import { useInspectorT } from "./kit/use-inspector-t";

type CommitPatch = (patch: Record<string, unknown>) => void;

export type NailDesignerTextRenderer = (
  prop: "title" | "intro" | "ctaLabel",
  label: string,
  kind: "input" | "textarea",
  placeholder: string,
) => ReactNode;

function Section({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>{info ? <InspectorLabelWithInfo label={title} info={info} /> : title}</h3>
      {children}
    </section>
  );
}

const GROUPS: ReadonlyArray<{
  key: NailOptionGroup;
  label: string;
  items: ReadonlyArray<{ id: string; en: string; es: string }>;
}> = [
  { key: "shapes", label: "Shapes", items: NAIL_SHAPES },
  { key: "colors", label: "Colours", items: NAIL_COLORS },
  { key: "arts", label: "Nail art", items: NAIL_ARTS },
  { key: "finishes", label: "Finishes", items: NAIL_FINISHES },
  { key: "charms", label: "Charms", items: NAIL_CHARMS.filter((c) => c.id !== "none") },
];

export function NailDesignerContentInspector({
  node,
  commitPatch,
  renderText,
}: {
  node: BuilderAppNailDesignerNode;
  commitPatch: CommitPatch;
  renderText: NailDesignerTextRenderer;
}) {
  const { t } = useInspectorT();
  const { locale } = useEditorLocale();
  const p = node.props;

  const selected = (key: NailOptionGroup): string[] => p[key] ?? [...NAIL_DESIGNER_CATALOG_IDS[key]];
  const toggle = (key: NailOptionGroup, id: string, on: boolean) => {
    const cur = new Set(selected(key));
    if (on) cur.add(id);
    else cur.delete(id);
    // Keep catalog order so the stored list is stable and diff-friendly.
    commitPatch({ [key]: NAIL_DESIGNER_CATALOG_IDS[key].filter((x) => cur.has(x)) });
  };

  return (
    <div className="flex flex-col gap-4" data-builder-node-content-panel="app_nail_designer" data-nail-designer-inspector="content">
      <Section title={t("Content")}>
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Heading")}</label>
          {renderText("title", t("Heading"), "input", t("Design your nails"))}
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Intro")}</label>
          {renderText("intro", t("Intro"), "textarea", t("Optional"))}
        </div>
      </Section>
      <Section
        title={t("Send with booking")}
        info={t("Adds a button that opens your booking or inquiry form with the design written in the message. Nothing is sent until the visitor submits.")}
      >
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={p.sendWithBooking !== false}
            onChange={(e) => commitPatch({ sendWithBooking: e.target.checked })}
          />
          {t("Show the send button")}
        </label>
        {p.sendWithBooking !== false ? (
          <div className={KIT.field}>
            <label className={KIT.label}>{t("Button label")}</label>
            {renderText("ctaLabel", t("Button label"), "input", t("Send my design"))}
          </div>
        ) : null}
      </Section>
      <Section
        title={t("What visitors can pick")}
        info={t("Untick anything you do not offer. A group with nothing ticked is hidden from the tool.")}
      >
        {GROUPS.map((g) => (
          <fieldset key={g.key} className="flex flex-col gap-1.5 border-0 p-0" data-nail-options={g.key}>
            <legend className={KIT.label}>{t(g.label)}</legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {g.items.map((it) => (
                <label key={it.id} className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={selected(g.key).includes(it.id)}
                    onChange={(e) => toggle(g.key, it.id, e.target.checked)}
                  />
                  {locale === "es" ? it.es : it.en}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </Section>
    </div>
  );
}
