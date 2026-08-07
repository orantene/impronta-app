"use client";

import { HeaderWidgetEditorNote } from "../shared/HeaderWidgetEditor";
import { useSectionT } from "../shared/section-editor-i18n";
import type { SectionEditorProps } from "../types";
import type { HeaderFavoritesV1 } from "./schema";

export function HeaderFavoritesEditor(
  _props: SectionEditorProps<HeaderFavoritesV1>,
) {
  const t = useSectionT();
  return (
    <HeaderWidgetEditorNote title={t("Header favorites")}>
      {t(
        "Drops the live saved-talent / favorites affordance (bookmark icon) into the shell. Interactive on the published site; a placeholder chip in the editor.",
      )}
    </HeaderWidgetEditorNote>
  );
}
