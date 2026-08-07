"use client";

import { HeaderWidgetEditorNote } from "../shared/HeaderWidgetEditor";
import { useSectionT } from "../shared/section-editor-i18n";
import type { SectionEditorProps } from "../types";
import type { HeaderInquiryV1 } from "./schema";

export function HeaderInquiryEditor(_props: SectionEditorProps<HeaderInquiryV1>) {
  const t = useSectionT();
  return (
    <HeaderWidgetEditorNote title={t("Header inquiry")}>
      {t(
        "Drops the live inquiry lineup control (plane icon, opens the inquiry drawer) into the shell, the same discovery cluster the default header uses. Interactive on the published site; a placeholder chip in the editor.",
      )}
    </HeaderWidgetEditorNote>
  );
}
