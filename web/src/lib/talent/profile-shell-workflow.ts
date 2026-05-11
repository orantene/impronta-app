/**
 * Maps between profile shell UI status pills and DB columns on talent_profiles.
 *
 * DB enum `profile_workflow_status`: draft, submitted, under_review, approved,
 * hidden, archived (see init migration).
 */

export type UiProfileShellStatus = "draft" | "pending" | "published" | "hidden";

export function uiProfileShellStatusToDbPatch(status: UiProfileShellStatus): {
  workflow_status: string;
  visibility?: "public" | "hidden" | "private";
} {
  switch (status) {
    case "draft":
      return { workflow_status: "draft" };
    case "pending":
      return { workflow_status: "submitted" };
    case "published":
      return { workflow_status: "approved", visibility: "public" };
    case "hidden":
      return { workflow_status: "hidden", visibility: "hidden" };
    default:
      return { workflow_status: "draft" };
  }
}

export function dbToUiProfileShellStatus(
  workflow_status: string | null | undefined,
  _visibility: string | null | undefined,
): UiProfileShellStatus {
  const w = workflow_status ?? "draft";
  if (w === "hidden") return "hidden";
  if (w === "approved") return "published";
  if (w === "submitted" || w === "under_review") return "pending";
  if (w === "archived") return "hidden";
  return "draft";
}
