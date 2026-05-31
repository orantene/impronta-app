import { BUILDER_NODE_REGISTRY } from "./registry";
import { builderNodeKindAllowedAtRoot } from "./drop-policy";
import type { BuilderNode, BuilderNodeTree } from "./types";

export interface BuilderNodeValidationIssue {
  path: string;
  message: string;
}

export type BuilderNodeValidationResult =
  | { ok: true; tree: BuilderNodeTree }
  | {
      ok: false;
      issues: ReadonlyArray<BuilderNodeValidationIssue>;
      /**
       * Best-effort repaired tree: the input with every node that failed
       * validation (and its subtree) dropped. Guaranteed to itself pass
       * `validateBuilderNodeTree`. Resilience boundaries (e.g. structural
       * operations) use this so a few corrupt nodes don't make the whole tree
       * unusable; strict boundaries (publish) keep gating on `issues`.
       */
      tree: BuilderNodeTree;
    };

interface ValidateOptions {
  maxDepth?: number;
}

interface RawNode {
  id?: unknown;
  kind?: unknown;
  props?: unknown;
  children?: unknown;
}

function childAllowed(parentKind: BuilderNode["kind"], childKind: BuilderNode["kind"]): boolean {
  const policy = BUILDER_NODE_REGISTRY[parentKind].children;
  if (policy.type === "any") return true;
  if (policy.type === "none") return false;
  return policy.kinds.includes(childKind);
}

function asPath(parts: ReadonlyArray<string | number>): string {
  return parts.join(".");
}

export function validateBuilderNodeTree(
  input: unknown,
  options: ValidateOptions = {},
): BuilderNodeValidationResult {
  const issues: BuilderNodeValidationIssue[] = [];
  const maxDepth = options.maxDepth ?? 8;
  const seenIds = new Set<string>();

  if (!Array.isArray(input)) {
    return {
      ok: false,
      issues: [{ path: "root", message: "Node tree must be an array." }],
      tree: [],
    };
  }

  function walk(
    raw: unknown,
    path: Array<string | number>,
    depth: number,
    parentKind: BuilderNode["kind"] | null,
  ): BuilderNode | null {
    if (depth > maxDepth) {
      issues.push({
        path: asPath(path),
        message: `Node depth exceeds max depth ${maxDepth}.`,
      });
      return null;
    }
    if (typeof raw !== "object" || raw == null) {
      issues.push({ path: asPath(path), message: "Node must be an object." });
      return null;
    }
    const node = raw as RawNode;
    if (typeof node.id !== "string" || node.id.trim().length === 0) {
      issues.push({ path: asPath([...path, "id"]), message: "Node id must be a non-empty string." });
      return null;
    }
    if (seenIds.has(node.id)) {
      issues.push({ path: asPath([...path, "id"]), message: `Duplicate node id "${node.id}".` });
      return null;
    }
    seenIds.add(node.id);

    if (typeof node.kind !== "string" || !(node.kind in BUILDER_NODE_REGISTRY)) {
      issues.push({ path: asPath([...path, "kind"]), message: "Node kind is unknown." });
      return null;
    }
    const kind = node.kind as BuilderNode["kind"];

    if (!parentKind && !builderNodeKindAllowedAtRoot(kind)) {
      issues.push({
        path: asPath(path),
        message: `Root cannot contain node kind "${kind}".`,
      });
      return null;
    }

    if (parentKind && !childAllowed(parentKind, kind)) {
      issues.push({
        path: asPath(path),
        message: `Child kind "${kind}" is not allowed under "${parentKind}".`,
      });
      return null;
    }

    const entry = BUILDER_NODE_REGISTRY[kind];
    const parsedProps = entry.propsSchema.safeParse(node.props ?? {});
    if (!parsedProps.success) {
      const message = parsedProps.error.issues
        .map((issue) => `${issue.path.join(".") || "props"}: ${issue.message}`)
        .join("; ");
      issues.push({
        path: asPath([...path, "props"]),
        message,
      });
      return null;
    }

    if (entry.children.type === "none") {
      if (node.children != null) {
        if (!Array.isArray(node.children) || node.children.length > 0) {
          issues.push({
            path: asPath([...path, "children"]),
            message: `Node kind "${kind}" does not allow children.`,
          });
          return null;
        }
      }
      return {
        id: node.id,
        kind,
        props: parsedProps.data,
      } as BuilderNode;
    }

    const rawChildren = node.children ?? [];
    if (!Array.isArray(rawChildren)) {
      issues.push({
        path: asPath([...path, "children"]),
        message: `Node kind "${kind}" requires a children array.`,
      });
      return null;
    }

    const children: BuilderNode[] = [];
    rawChildren.forEach((child, childIndex) => {
      const parsed = walk(child, [...path, "children", childIndex], depth + 1, kind);
      if (parsed) children.push(parsed);
    });

    return {
      id: node.id,
      kind,
      props: parsedProps.data,
      children,
    } as BuilderNode;
  }

  const out: BuilderNode[] = [];
  input.forEach((item, index) => {
    const parsed = walk(item, ["root", index], 1, null);
    if (parsed) out.push(parsed);
  });

  // `out` already excludes every node that failed validation (and its
  // subtree), so it is a valid tree even on the failure path — expose it as
  // the best-effort repaired tree for resilience boundaries.
  if (issues.length > 0) return { ok: false, issues, tree: out };
  return { ok: true, tree: out };
}
