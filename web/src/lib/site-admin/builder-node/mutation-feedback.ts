import type {
  BuilderNodeOpCode,
  BuilderNodeOperationKind,
} from "./operations";

export type BuilderNodeMutationCode =
  | BuilderNodeOpCode
  | "GUARDED_NODE"
  | "VERSION_CONFLICT"
  | "SAVE_FAILED";

export interface BuilderNodeMutationIssue {
  path: string;
  message: string;
}

function humanizeIssuePath(path: string): string {
  const normalized = path.trim();
  if (!normalized) return "";
  if (normalized === "target.parent") return "Target container";
  if (normalized === "target.parentId") return "Target parent";
  if (normalized === "target.index") return "Destination position";
  if (normalized === "target.patch") return "Update payload";
  if (normalized === "target.root") return "Page root";
  if (normalized === "target.child") return "Dragged block";
  if (normalized === "source.nodeId") return "Source block";
  if (normalized === "source.parent") return "Source container";
  if (normalized === "source.group") return "Source group";
  if (normalized === "target.tree") return "Builder tree";
  if (normalized.startsWith("tree[")) return "Builder tree";
  return normalized;
}

function operationLabel(operation: BuilderNodeOperationKind): string {
  switch (operation) {
    case "insert":
      return "Insert blocked";
    case "move":
      return "Move blocked";
    case "remove":
      return "Delete blocked";
    case "duplicate":
      return "Duplicate blocked";
    case "paste":
      return "Paste blocked";
    case "patch":
      return "Update blocked";
    default:
      return "Builder change blocked";
  }
}

export function summarizeBuilderNodeIssues(
  issues: ReadonlyArray<BuilderNodeMutationIssue> | undefined,
): ReadonlyArray<string> {
  if (!issues || issues.length === 0) return [];
  const seen = new Set<string>();
  return issues
    .map((issue) => {
      const path = humanizeIssuePath(issue.path);
      const message = issue.message.trim();
      if (!path) return message;
      return `${path}: ${message}`;
    })
    .filter((line) => {
      if (!line) return false;
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .slice(0, 3);
}

export function formatBuilderNodeMutationError(input: {
  operation: BuilderNodeOperationKind;
  code: BuilderNodeMutationCode;
  message: string;
  details?: ReadonlyArray<string>;
}): string {
  const operationPrefix = operationLabel(input.operation);
  const detailSuffix =
    input.details && input.details.length > 0
      ? ` Details: ${input.details.join(" • ")}`
      : "";

  switch (input.code) {
    case "NODE_NOT_FOUND":
      return `${operationPrefix}. That block no longer exists. Refresh and retry.${detailSuffix}`;
    case "NODE_KIND_NOT_DUPLICABLE":
      return `${operationPrefix}. This block can't be duplicated here; use section duplicate instead.`;
    case "PARENT_NOT_FOUND":
      return `${operationPrefix}. The destination group was not found. Refresh and retry.${detailSuffix}`;
    case "PARENT_DOES_NOT_ALLOW_CHILDREN":
      return `${operationPrefix}. Invalid target: this parent does not accept child blocks.${detailSuffix}`;
    case "ROOT_KIND_NOT_ALLOWED":
      return `${operationPrefix}. Invalid target: this block type cannot live at page root.${detailSuffix}`;
    case "CHILD_KIND_NOT_ALLOWED":
      return `${operationPrefix}. Invalid target: this parent does not allow that block type.${detailSuffix}`;
    case "INVALID_MOVE_TARGET": {
      const moveMessage = input.message.trim();
      if (moveMessage) {
        return `${operationPrefix}. ${moveMessage}${detailSuffix}`;
      }
      return `${operationPrefix}. Invalid move target for this block.${detailSuffix}`;
    }
    case "VALIDATION_FAILED":
      return `${operationPrefix}. Schema mismatch detected; adjust the target or block settings and retry.${detailSuffix}`;
    case "GUARDED_NODE":
      return input.message;
    case "VERSION_CONFLICT":
      // W1-L2 — honest conflict protocol: nothing is auto-reloaded anymore.
      // The toast offers the choice; this copy must describe the real state.
      return "This page changed in another tab or session, so your last change was not saved. Your work here is untouched. Reload latest to take those changes (this resets undo), or keep editing this copy to overwrite them.";
    case "SAVE_FAILED":
      return input.message || "Couldn't save this builder change.";
    default:
      return input.message || "Couldn't apply this builder change.";
  }
}
