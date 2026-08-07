"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { useSectionT } from "../shared/section-editor-i18n";
import type { SectionEditorProps } from "../types";
import type { BlankSectionV1 } from "./schema";

export function BlankSectionEditor({
  initial,
  onChange,
}: SectionEditorProps<BlankSectionV1>) {
  const t = useSectionT();
  const value: BlankSectionV1 = {
    presentation: initial.presentation,
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-[color:var(--chrome-muted,rgba(36,41,66,0.72))]">
        {t(
          "This section starts empty. Add blocks from the navigator or the canvas, blocks persist as real nodes on the builder tree (not props-only placeholders).",
        )}
      </p>
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
