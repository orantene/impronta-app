/**
 * TUL-524 — owner-facing publish preflight hygiene.
 *
 * System concerns (locale snapshots, free-plan policy jargon, legacy slots)
 * must never appear as blockers. Brand identity defaults to the business name
 * and is at most a soft tip, never a wall.
 *
 * Kept free of `publish-preflight-action` imports so the "use server" action
 * file can call these helpers without a cycle.
 */

export type OwnerPreflightIssue = {
  severity: "error" | "warn";
  category: string;
  message: string;
  sectionId?: string;
  nodeId?: string;
  autoFixable?: boolean;
  fixHref?: string;
  fixLabel?: string;
};

/** Internal terms that must never reach the owner publish dialog. */
const INTERNAL_TERM_RE = /\b(snapshot|policy|locale|legacy)\b/i;

export function messageContainsInternalPublishTerms(message: string): boolean {
  return INTERNAL_TERM_RE.test(message) || /free publish/i.test(message);
}

/**
 * Finalize issues before they reach the drawer: drop internal system copy,
 * demote brand identity to advisory, promote only real owner alt/link gaps
 * on free plans (without appending policy jargon).
 */
export function finalizeOwnerPreflightIssues<T extends OwnerPreflightIssue>(
  issues: ReadonlyArray<T>,
  workspacePlan: string | null | undefined,
): T[] {
  const out: T[] = [];
  for (const issue of issues) {
    if (messageContainsInternalPublishTerms(issue.message)) continue;

    if (issue.category === "brand_identity") {
      out.push({ ...issue, severity: "warn" });
      continue;
    }

    if (issue.category === "alt_text" && issue.severity === "warn") {
      out.push({
        ...issue,
        severity: "error",
        message: `${issue.message} Add alt text before publishing.`,
      });
      continue;
    }

    if (
      workspacePlan === "free" &&
      issue.severity === "warn" &&
      issue.category === "link_integrity"
    ) {
      out.push({ ...issue, severity: "error" });
      continue;
    }

    // SEO (canonical, multi-locale completeness, etc.) stays advisory for
    // owners. The platform creates snapshots; free-plan policy never blocks.
    out.push(issue);
  }
  return out;
}

/** Pure helper for tests: a seeded new site should have zero hard blockers. */
export function countOwnerPublishBlockers(
  issues: ReadonlyArray<OwnerPreflightIssue>,
  workspacePlan: string | null | undefined = "free",
): number {
  return finalizeOwnerPreflightIssues(issues, workspacePlan).filter(
    (i) => i.severity === "error",
  ).length;
}
