"use client";

/**
 * Talent surfaces lead the selected-section inspector with its plain name and
 * presets; the raw flex/grid controls sit behind a collapsed "Advanced"
 * (owner rule: presets first, advanced hidden).
 */

import type { ReactNode } from "react";

import { sectionLabel } from "@/lib/talent-site/history/draft-diff";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";
import { useInspectorT } from "../kit/use-inspector-t";
import { useEditContext } from "../../edit-context";
import { useEditorLocale } from "../../use-editor-locale";
import { NodeLayoutPresetGrid } from "./node-layout-presets";
import { nodeKindLabel, type AdvancedEditableBuilderNode } from "./node-layout-options";

/** Display name of the selected node: section name on talent surfaces, else the kind. */
export function useSelectedNodeName(node: AdvancedEditableBuilderNode | null): {
  name: string;
  talent: boolean;
} {
  const { t } = useInspectorT();
  const { locale } = useEditorLocale();
  const { surfaceKind } = useEditContext();
  const talent = surfaceKind === "talent_page";
  if (!node) return { name: "", talent };
  const name = talent
    ? sectionLabel(node as unknown as BuilderNode, locale)
    : t(nodeKindLabel(node.kind));
  return { name, talent };
}

export function TalentAdvancedGroup({
  talent,
  node,
  onPatch,
  children,
}: {
  talent: boolean;
  node: AdvancedEditableBuilderNode;
  onPatch: (patch: Record<string, unknown>) => void;
  children: ReactNode;
}) {
  const { t } = useInspectorT();
  if (!talent) return <>{children}</>;
  return (
    <>
      {node.kind === "container" ? (
        <NodeLayoutPresetGrid kind={node.kind} onApply={onPatch} />
      ) : null}
      <details data-builder-layout-advanced="" className="group">
        <summary className={`${FIELD_LABEL} cursor-pointer select-none`}>
          {t("Advanced")}
        </summary>
        <div className="mt-3 flex flex-col gap-3">{children}</div>
      </details>
    </>
  );
}
