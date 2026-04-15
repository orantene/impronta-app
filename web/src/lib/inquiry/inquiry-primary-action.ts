import type { PrimaryAction, WorkspaceStateInput } from "./inquiry-workspace-types";
import { resolvePrimaryActionFromMatrix } from "./inquiry-workspace-state-matrix";
import { getWorkspacePermissions } from "./inquiry-workspace-permissions";

export function getPrimaryAction(input: WorkspaceStateInput): PrimaryAction {
  const perms = getWorkspacePermissions(input);
  return resolvePrimaryActionFromMatrix(input, perms);
}
