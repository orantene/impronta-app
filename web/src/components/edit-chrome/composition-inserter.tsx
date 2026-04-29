"use client";

/**
 * CompositionInserters — RETIRED in Sprint 3.1.
 *
 * The between-section "+" bars this component used to render were
 * replaced by a per-section left-corner control rail rendered in
 * `selection-layer.tsx`. The new rail anchors a drag handle and a "+"
 * insert button to a specific section (top-left corner, hover-revealed,
 * chip-style dark pill). Single affordance per section, attached to
 * the section instead of floating between them.
 *
 * The component is preserved as a no-op so any remaining import in
 * `EditShell` doesn't fail; the next cleanup pass can delete the
 * import and this file entirely.
 */

export function CompositionInserters() {
  return null;
}
