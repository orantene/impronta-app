import type { WorkspaceStatus } from "./inquiry-workspace-types";

const LOCKED: WorkspaceStatus[] = ["booked", "rejected", "expired", "closed_lost", "archived"];

export function isWorkspaceLocked(status: WorkspaceStatus): boolean {
  return LOCKED.includes(status);
}
