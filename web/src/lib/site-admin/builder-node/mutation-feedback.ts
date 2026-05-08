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
  return issues
    .map((issue) => {
      const path = issue.path.trim();
      const message = issue.message.trim();
      if (!path) return message;
      return `${path}: ${message}`;
    })
    .filter(Boolean)
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
      return `${operationPrefix}. That block no longer exists. Refresh and retry.`;
    case "NODE_KIND_NOT_DUPLICABLE":
      return `${operationPrefix}. This block can't be duplicated here; use section duplicate instead.`;
    case "PARENT_NOT_FOUND":
      return `${operationPrefix}. The destination group was not found. Refresh and retry.`;
    case "PARENT_DOES_NOT_ALLOW_CHILDREN":
      return `${operationPrefix}. Invalid target: this parent does not accept child blocks.`;
    case "ROOT_KIND_NOT_ALLOWED":
      return `${operationPrefix}. Invalid target: this block type cannot live at page root.`;
    case "CHILD_KIND_NOT_ALLOWED":
      return `${operationPrefix}. Invalid target: this parent does not allow that block type.`;
    case "INVALID_MOVE_TARGET":
      return `${operationPrefix}. Invalid move target for this block.${detailSuffix}`;
    case "VALIDATION_FAILED":
      return `${operationPrefix}. Schema mismatch detected; adjust the target or block settings and retry.${detailSuffix}`;
    case "GUARDED_NODE":
      return input.message;
    case "VERSION_CONFLICT":
      return "Your draft changed in another session. Latest state was reloaded; retry your edit.";
    case "SAVE_FAILED":
      return input.message || "Couldn't save this builder change.";
    default:
      return input.message || "Couldn't apply this builder change.";
  }
}
