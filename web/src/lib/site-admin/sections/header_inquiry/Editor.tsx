"use client";

import { HeaderWidgetEditorNote } from "../shared/HeaderWidgetEditor";
import type { SectionEditorProps } from "../types";
import type { HeaderInquiryV1 } from "./schema";

export function HeaderInquiryEditor(_props: SectionEditorProps<HeaderInquiryV1>) {
  return (
    <HeaderWidgetEditorNote title="Header inquiry">
      Drops the live inquiry-cart affordance (plane icon → inquiry drawer) into
      the shell — the same discovery cluster the default header uses. Interactive
      on the published site; a placeholder chip in the editor.
    </HeaderWidgetEditorNote>
  );
}
