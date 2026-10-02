/**
 * Content inspector for the `app_nail_designer` block. The app is a zero-config
 * drop-in, so the only controls are optional text overrides (heading, intro and
 * the label of the button that sends the design with a booking), per content
 * locale through the shared localizable field. Leave them empty for the design
 * exactly as drawn.
 */
"use client";

import type { ReactNode } from "react";

import type { BuilderAppNailDesignerNode } from "@/lib/site-admin/builder-node/types";

import { KIT, InspectorLabelWithInfo } from "./kit";
import { useInspectorT } from "./kit/use-inspector-t";

type CommitPatch = (patch: Record<string, unknown>) => void;

export type NailDesignerTextRenderer = (
  prop: "title" | "intro" | "ctaLabel",
  label: string,
  kind: "input" | "textarea",
  placeholder: string,
) => ReactNode;

export function NailDesignerContentInspector({
  renderText,
}: {
  node: BuilderAppNailDesignerNode;
  commitPatch: CommitPatch;
  renderText: NailDesignerTextRenderer;
}) {
  const { t } = useInspectorT();
  return (
    <div className="flex flex-col gap-4" data-builder-node-content-panel="app_nail_designer" data-nail-designer-inspector="content">
      <section className="flex flex-col gap-2.5">
        <h3 className={KIT.blockHeading}>
          <InspectorLabelWithInfo
            label={t("Text (optional)")}
            info={t("The Nail Designer works as is. Add a heading or intro above it, or rename the send button. Nothing is sent until the visitor submits.")}
          />
        </h3>
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Heading")}</label>
          {renderText("title", t("Heading"), "input", t("Optional"))}
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Intro")}</label>
          {renderText("intro", t("Intro"), "textarea", t("Optional"))}
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Button label")}</label>
          {renderText("ctaLabel", t("Button label"), "input", t("Send my design"))}
        </div>
      </section>
    </div>
  );
}
