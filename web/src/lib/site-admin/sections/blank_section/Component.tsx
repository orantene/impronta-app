import type { SectionComponentProps } from "../types";
import type { BlankSectionV1 } from "./schema";

/**
 * Presentation tokens apply on the `[data-cms-section]` wrapper for this type
 * so band styling wraps **both** this placeholder and persisted builder children
 * (`homepage-cms-sections.tsx`).
 */
export function BlankSectionComponent(
  {}: SectionComponentProps<BlankSectionV1>,
) {
  return null;
}
