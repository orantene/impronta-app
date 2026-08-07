"use client";

import { HeaderWidgetEditorNote } from "../shared/HeaderWidgetEditor";
import { useSectionT } from "../shared/section-editor-i18n";
import type { SectionEditorProps } from "../types";
import type { HeaderAccountV1 } from "./schema";

export function HeaderAccountEditor(_props: SectionEditorProps<HeaderAccountV1>) {
  const t = useSectionT();
  return (
    <HeaderWidgetEditorNote title={t("Header account")}>
      {t(
        "Drops the live account menu / sign-in control into the shell, the same widget the default header uses. It is interactive on the published site; the editor shows a placeholder chip so the canvas never reads the session.",
      )}
    </HeaderWidgetEditorNote>
  );
}
