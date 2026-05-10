"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import type { SectionEditorProps } from "../types";
import type { BlankSectionV1 } from "./schema";

export function BlankSectionEditor({
  initial,
  onChange,
}: SectionEditorProps<BlankSectionV1>) {
  const value: BlankSectionV1 = {
    presentation: initial.presentation,
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-[color:var(--chrome-muted,rgba(36,41,66,0.72))]">
        This section starts empty. Add elements from the navigator or canvas —
        blocks persist as real nodes on the builder tree (not props-only
        placeholders).
      </p>
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
