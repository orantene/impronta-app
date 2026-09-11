/**
 * Server-side publish preflight gate.
 *
 * THE DEFECT. Heading / alt / contrast / SEO checks lived only in the editor
 * drawer. `publishPageSnapshot` and the scheduled-publish cron wrote live
 * snapshots with none of those checks, so an operator (or a schedule) could
 * ship a page the drawer itself would have blocked.
 *
 * This module is the shared refuse-on-error gate. Interactive publishes call
 * `runPublishPreflight` (session-scoped). Cron and service-role paths call
 * `preflightBlocksPublish` with issues already collected, so they share the
 * same "any error severity blocks" rule without inventing a second checklist.
 */

export type PreflightIssueLike = {
  severity: "error" | "warn" | string;
  message?: string;
  category?: string;
};

export function preflightBlocksPublish(
  issues: readonly PreflightIssueLike[] | null | undefined,
): { blocked: false } | { blocked: true; message: string } {
  const blockers = (issues ?? []).filter((i) => i.severity === "error");
  if (blockers.length === 0) return { blocked: false };
  const first = blockers[0]?.message?.trim() || "Fix publish issues before going live.";
  const extra = blockers.length > 1 ? ` (+${blockers.length - 1} more)` : "";
  return { blocked: true, message: `${first}${extra}` };
}
