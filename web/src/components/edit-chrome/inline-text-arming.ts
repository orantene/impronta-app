"use client";

/**
 * WAVE 2.1 — the arming decision for a canvas double-click on LEGACY
 * CMS-section text (role-bound nodes such as `legacy:hero:…:heading:headline`,
 * which `resolveEditableBuilderNodeTextTarget` deliberately declines).
 *
 * WHY THIS EXISTS AS A PURE FUNCTION
 *
 * Until this change the double-click handler refused to arm unless BOTH
 *
 *   1. the double-clicked section was already the SELECTED one, and
 *   2. the inspector had already finished loading that section's `draftProps`
 *
 * were true. Both become true as a CONSEQUENCE of the very click the operator
 * just made, but only asynchronously — so the first double-click on a section
 * armed nothing, was silently swallowed, and the operator had to double-click
 * a second time. Measured live on `nova-crew`: double-click #1 opened no
 * overlay and dropped every keystroke; double-click #2 opened it.
 *
 * Neither gate protected anything. `runCommitText` resolves the target field by
 * matching the ORIGINAL string against the loaded draft tree at COMMIT time
 * (`findPathByValue`), and fails loudly when it cannot find a unique match. So
 * the props only have to be loaded when the operator finishes the edit, not
 * when they start it — by which point the selection click has long since
 * landed.
 *
 * The decision is therefore a function of the DOM target alone. It is pure and
 * tested so the two removed gates cannot quietly grow back:
 * `inline-text-arming.test.ts` asserts that an unselected section with no
 * draft props loaded still arms.
 */

export interface LegacySectionArmingInput {
  /** `data-section-id` of the `[data-cms-section]` ancestor, if any. */
  sectionId: string | null;
  /** Text resolved from the double-clicked element. */
  originalText: string;
  /**
   * Whether the inspector has loaded this section's draft props yet.
   * DELIBERATELY NOT A GATE — see the module comment. Kept on the input so the
   * regression test can state the invariant in the caller's own vocabulary.
   */
  draftPropsLoaded: boolean;
  /**
   * The section selected at the instant of the double-click.
   * DELIBERATELY NOT A GATE — see the module comment.
   */
  selectedSectionId: string | null;
}

export type LegacySectionArmingDecision =
  | { arm: true }
  | { arm: false; reason: "no-section" | "empty-text" };

/**
 * Decide whether a legacy CMS-section double-click opens the inline editor.
 *
 * Reads ONLY `sectionId` and `originalText` by design. If you find yourself
 * adding a readiness condition here, put it on the COMMIT path instead: the
 * operator must never lose a gesture (or the keystrokes that follow it) to a
 * race they cannot see.
 */
export function resolveLegacySectionArming(
  input: LegacySectionArmingInput,
): LegacySectionArmingDecision {
  if (!input.sectionId) return { arm: false, reason: "no-section" };
  if (input.originalText.trim().length === 0) {
    return { arm: false, reason: "empty-text" };
  }
  return { arm: true };
}
