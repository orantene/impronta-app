/**
 * W3-M1 — mobile horizontal overflow is a publish-BLOCKING error.
 *
 * Pure tier-mapping layer between the `mobile-health` detector and the publish
 * preflight. A block whose resolved fixed width / min-width on the mobile
 * breakpoint exceeds the narrowest viewport (e.g. a `width: 1120px` container
 * inside a ~390px frame) forces a horizontal scrollbar on phones — a
 * mobile-broken page that cannot go live until it's fixed. Each offender maps
 * to a blocking `error` / `mobile_overflow` issue that carries the offending
 * node id, so the publish drawer can point straight at the block (and the
 * W3-M3 AI fixer can target it).
 *
 * The softer "likely overflow" heuristics (multi-column grids, non-collapsing
 * splits) are intentionally NOT promoted here — they stay advisory in
 * `MobileHealthPanel`. Kept as a non-`"use server"` module so the mapping is
 * unit-testable and importable by the server action without a runtime-500
 * non-async server-export footgun.
 */

import {
  collectMobileOverflowOffenders,
  type MobileOverflowOffender,
} from "@/lib/site-admin/builder-node/mobile-health";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/** The exact PreflightIssue shape this module emits (subset of the action's union). */
export interface MobileOverflowPreflightIssue {
  severity: "error";
  category: "mobile_overflow";
  sectionId?: string;
  nodeId: string;
  message: string;
}

/** Build the publish-drawer message for one overflow offender. */
export function mobileOverflowIssueMessage(
  offender: Pick<
    MobileOverflowOffender,
    "nodeKind" | "widthPx" | "viewportPx"
  >,
): string {
  return `Mobile overflow: ${offender.nodeKind.replace(/_/g, " ")} is ${offender.widthPx}px wide, wider than the ${offender.viewportPx}px mobile viewport, so it forces horizontal scrolling on phones. Set a relative width (%, 100%) or a mobile width override before publishing.`;
}

/**
 * Map every definite mobile-overflow offender in a builder tree to a blocking
 * preflight issue. Returns `[]` for a clean/responsive tree (nothing blocks).
 */
export function collectMobileOverflowPreflightIssues(
  tree: BuilderNodeTree,
): MobileOverflowPreflightIssue[] {
  return collectMobileOverflowOffenders(tree).map((offender) => ({
    severity: "error" as const,
    category: "mobile_overflow" as const,
    sectionId: offender.ownerSectionId ?? undefined,
    nodeId: offender.nodeId,
    message: mobileOverflowIssueMessage(offender),
  }));
}
