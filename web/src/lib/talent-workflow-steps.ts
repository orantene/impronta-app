/** Linear agency workflow positions for UI (0 = draft, 3 = approved). */
export function talentWorkflowStepIndex(workflowStatus: string): number {
  switch (workflowStatus) {
    case "draft":
    case "hidden":
      return 0;
    case "submitted":
      return 1;
    case "under_review":
      return 2;
    case "approved":
      return 3;
    case "archived":
      return -1;
    default:
      return 0;
  }
}

export const TALENT_WORKFLOW_STEP_LABELS = [
  "Draft",
  "Submitted",
  "Under review",
  "Approved",
] as const;
