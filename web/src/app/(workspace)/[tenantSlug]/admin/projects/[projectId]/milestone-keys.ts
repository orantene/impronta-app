/**
 * Milestone status copy keys and pill tones, shared by the record's tabs,
 * spelled out so `message-key-usage.static.test` can see each one.
 */

import type { MilestoneStatus } from "@/lib/projects/project-record";
import type { PillTone } from "../_shared";

export const MILESTONE_STATUS_KEY: Record<MilestoneStatus, string> = {
  draft: "dashboard.projects.milestones.statusDraft",
  submitted: "dashboard.projects.milestones.statusSubmitted",
  approved: "dashboard.projects.milestones.statusApproved",
  revision_requested: "dashboard.projects.milestones.statusRevisionRequested",
  cancelled: "dashboard.projects.milestones.statusCancelled",
};

export function milestoneTone(status: MilestoneStatus): PillTone {
  switch (status) {
    case "submitted":
      return "coral";
    case "approved":
      return "green";
    case "revision_requested":
      return "indigo";
    case "cancelled":
      return "red";
    default:
      return "slate";
  }
}
