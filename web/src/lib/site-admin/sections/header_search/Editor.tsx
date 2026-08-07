"use client";

import { HeaderWidgetEditorNote } from "../shared/HeaderWidgetEditor";
import { useSectionT } from "../shared/section-editor-i18n";
import type { SectionEditorProps } from "../types";
import type { HeaderSearchV1 } from "./schema";

export function HeaderSearchEditor(_props: SectionEditorProps<HeaderSearchV1>) {
  const t = useSectionT();
  return (
    <HeaderWidgetEditorNote title={t("Header search")}>
      {t(
        "Drops the live talent-search affordance (search icon → directory) into the shell. It is interactive on the published site; the editor shows a placeholder chip so the canvas stays safe.",
      )}
    </HeaderWidgetEditorNote>
  );
}
