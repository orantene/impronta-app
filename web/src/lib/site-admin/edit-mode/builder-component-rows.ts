import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

export type BuilderComponentVisibility = "private" | "platform" | "archived";

/**
 * A saved "living component" — a single reusable builder-node subtree the
 * operator authored on the canvas and stored for re-use. Phase 1 inserts
 * copies (ids re-minted on insert); a later phase can link instances.
 */
export interface BuilderComponentRow {
  id: string;
  name: string;
  description: string | null;
  rootKind: string;
  /** The reusable subtree (re-minted on insert). */
  subtree: BuilderNode;
  /** Count of nodes in the subtree (for the gallery card). */
  nodeCount: number;
  visibility: BuilderComponentVisibility;
  createdAt: string;
  ownTenant: boolean;
}

export interface BuilderComponentRecord {
  id: unknown;
  tenant_id: unknown;
  name: unknown;
  description: unknown;
  root_kind: unknown;
  subtree_jsonb: unknown;
  visibility: unknown;
  created_at: unknown;
}

function normalizeVisibility(value: unknown): BuilderComponentVisibility {
  if (value === "platform" || value === "archived") return value;
  return "private";
}

export function countSubtreeNodes(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const n = node as { children?: unknown };
  let total = 1;
  if (Array.isArray(n.children)) {
    for (const child of n.children) total += countSubtreeNodes(child);
  }
  return total;
}

/**
 * Light shape guard — a stored subtree must at least look like a BuilderNode
 * (object with string id + kind). Full validation happens against the
 * registry when the subtree is inserted.
 */
export function looksLikeBuilderNode(value: unknown): value is BuilderNode {
  if (!value || typeof value !== "object") return false;
  const n = value as { id?: unknown; kind?: unknown };
  return typeof n.id === "string" && typeof n.kind === "string";
}

export function buildBuilderComponentRow(
  record: BuilderComponentRecord,
  activeTenantId: string,
): BuilderComponentRow | null {
  const subtree = record.subtree_jsonb;
  if (!looksLikeBuilderNode(subtree)) return null;
  const name =
    typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : "Untitled block";
  const description =
    typeof record.description === "string" && record.description.trim()
      ? record.description.trim()
      : null;
  const rootKind =
    typeof record.root_kind === "string" && record.root_kind.trim()
      ? record.root_kind
      : (subtree as BuilderNode).kind;
  return {
    id: String(record.id ?? ""),
    name,
    description,
    rootKind,
    subtree: subtree as BuilderNode,
    nodeCount: countSubtreeNodes(subtree),
    visibility: normalizeVisibility(record.visibility),
    createdAt: String(record.created_at ?? ""),
    ownTenant: record.tenant_id === activeTenantId,
  };
}
