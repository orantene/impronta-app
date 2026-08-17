"use client";

import { HeaderWidgetEditorNote } from "../shared/HeaderWidgetEditor";
import { useSectionT } from "../shared/section-editor-i18n";
import type { SectionEditorProps } from "../types";
import type { HeaderLanguageV1 } from "./schema";

export function HeaderLanguageEditor(
  _props: SectionEditorProps<HeaderLanguageV1>,
) {
  const t = useSectionT();
  return (
    <HeaderWidgetEditorNote title={t("Header language")}>
      {t(
        "Drops the live EN | ES language toggle into the shell. It switches the visitor to the same page in the other language, and hides itself automatically when your site publishes only one language.",
      )}
    </HeaderWidgetEditorNote>
  );
}
