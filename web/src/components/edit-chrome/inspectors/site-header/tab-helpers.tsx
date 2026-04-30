"use client";

/**
 * Phase 1 premium-restraint pass:
 *   - GroupDescription was always-on microcopy under every group title.
 *     Replaced by passing the same copy as `info` on InspectorGroup,
 *     which renders an info-tip glyph next to the title and reveals
 *     the description on hover. Reclaims ~40% of vertical real estate
 *     and removes 12+ lines of always-visible microcopy.
 *   - NextPassRow placeholder rows were removed entirely. The roadmap
 *     lives in commit messages and source comments, not in the shipped
 *     UI. They were reading as "incomplete product," not "thoughtful
 *     roadmap" — premium UX ships only what works and keeps placeholders
 *     out of the operator's eye.
 *
 * The file remains so existing imports keep working through the
 * deprecation, but both helpers below are now no-ops you can delete in
 * the next pass.
 */

import type { ReactNode } from "react";

/**
 * @deprecated Pass the description as `info` on <InspectorGroup> instead.
 * Renders nothing.
 */
export function GroupDescription({ children: _ }: { children: ReactNode }) {
  return null;
}

/**
 * @deprecated Removed from shipped UI. Roadmap notes belong in source
 * comments, not in the UI tree.
 */
export function NextPassRow({
  label: _label,
  hint: _hint,
}: {
  label: string;
  hint: string;
}) {
  return null;
}
