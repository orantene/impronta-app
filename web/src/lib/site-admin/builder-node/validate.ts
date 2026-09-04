import { BUILDER_NODE_REGISTRY } from "./registry";
import { builderNodeKindAllowedAtRoot } from "./drop-policy";
import { normalizeBuilderVisibilityCondition } from "./visibility";
import { normalizeNodeI18nOverlay } from "./i18n-overlay";
import { normalizeNodeExperimentConfig } from "./experiment";
import { normalizeAnchorId } from "./anchor-id";
import { BUILDER_MAX_TREE_DEPTH } from "./tree-depth";
import { isBuilderNodeRole } from "./role-bindings";
import type { BuilderNode, BuilderNodeTree } from "./types";

/**
 * OPTIONAL node-level fields that must survive tree reconstruction. Without
 * this carry a value is silently dropped on the next `validateBuilderNodeTree`
 * (which rebuilds each node as `{ id, kind, props, [children] }` and whose
 * per-kind propsSchema strips any key it does not declare).
 *
 * SINGLE SOURCE OF TRUTH = `props[key]` (where the `patchBuilderNodeProps` path
 * writes, and where change-detection / clear-to-undefined reads). The value is
 * normalized defensively and written back into `props` so the field round-trips
 * exactly like a declared prop; it is ALSO mirrored onto the node BASE so the
 * renderer + typed access can read `node[key]` directly. Both stay in sync
 * because validate re-derives them from the same raw source on every pass.
 * A normalized `undefined` (cleared / garbage) leaves the field off BOTH.
 */
const BASE_NODE_FIELD_CARRIERS: ReadonlyArray<{
  key: string;
  normalize: (value: unknown) => unknown;
}> = [
  { key: "locked", normalize: (value) => (value === true ? true : undefined) },
  {
    key: "lockedProps",
    normalize: (value) => {
      if (!Array.isArray(value)) return undefined;
      const keys = value.filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      );
      return keys.length > 0 ? keys : undefined;
    },
  },
  {
    key: "visibilityCondition",
    normalize: (value) => normalizeBuilderVisibilityCondition(value) ?? undefined,
  },
  // WS5 — per-element translation overlay: { es: { text: "Hola" }, fr: {…} }.
  // SOURCE OF TRUTH = props.i18n (where patchBuilderNodeProps writes); mirrored
  // onto node.i18n so the renderer + i18n primitives (resolveNodeProp,
  // propHasLocale) read `node.i18n` directly. An empty overlay normalizes to
  // undefined → carried on NEITHER (a node with no translations is byte-identical
  // to today's single-language behavior).
  {
    key: "i18n",
    normalize: (value) => normalizeNodeI18nOverlay(value),
  },
  // ABTEST-1 — minimal A/B experiment config on an eligible CTA / form node.
  // SOURCE OF TRUTH = props.experiment (where patchBuilderNodeProps writes);
  // mirrored onto node.experiment so the shared renderer reads it directly.
  // Normalizes to undefined (carried on NEITHER) when there is no usable 2-arm
  // experiment — a node with no experiment is byte-identical to today.
  {
    key: "experiment",
    normalize: (value) => normalizeNodeExperimentConfig(value) ?? undefined,
  },
  // C11 — the optional DOM `id` that makes an in-page anchor resolve. Any node
  // can be an anchor target, so this is a base field rather than 47 per-kind
  // props. Slugified defensively: the value reaches the DOM as an `id` and is
  // targeted by `href="#…"`, so junk must become something that works rather
  // than something that half-works. Normalizes to undefined (carried on
  // NEITHER) when empty — a node with no anchor renders byte-identically.
  {
    key: "anchorId",
    normalize: (value) => normalizeAnchorId(value),
  },
  // EJECT PROVENANCE — the curated role an ejected child was minted from.
  // Written by `ejectSectionInTree`; read by `section-eject-repair.ts` so
  // "Restore original styling" knows which child is the headline without
  // guessing. Not a per-kind prop (it is meaningless to the renderer), so it
  // must be carried here or the very next validate pass would strip it.
  {
    key: "originRole",
    normalize: (value) => (isBuilderNodeRole(value) ? value : undefined),
  },
];

/**
 * Carry normalized optional node fields onto the reconstructed node `out`.
 * Reads each from the RAW node's `props[key]` (the patch landing zone) first,
 * then a base-level `node[key]`; writes the normalized result into BOTH
 * `out.props` (source of truth) and `out` (base mirror). Removes the key from
 * `out.props` when there is no usable value.
 */
function carryBaseNodeFields(
  raw: RawNode,
  out: Record<string, unknown>,
  outProps: Record<string, unknown>,
): void {
  const rawProps =
    raw.props && typeof raw.props === "object" && !Array.isArray(raw.props)
      ? (raw.props as Record<string, unknown>)
      : undefined;
  for (const carrier of BASE_NODE_FIELD_CARRIERS) {
    const source =
      rawProps && carrier.key in rawProps
        ? rawProps[carrier.key]
        : (raw as Record<string, unknown>)[carrier.key];
    const normalized = carrier.normalize(source);
    if (normalized !== undefined) {
      out[carrier.key] = normalized;
      outProps[carrier.key] = normalized;
    } else {
      delete outProps[carrier.key];
    }
  }
}

/**
 * Re-derive the base-mirror fields (locked, visibilityCondition) on a SINGLE
 * node from its current props, mutating the node in place. The structural-
 * sharing mutation path (patchBuilderNodeProps / convertBuilderTextNodeRole)
 * returns the shared tree WITHOUT a full re-validate — to preserve node identity
 * for the canvas memo — so it must keep the base mirror in sync itself, exactly
 * as `validateBuilderNodeTree` would on the next reload. Call ONLY on a freshly
 * copied node the caller just produced (this mutates); never on an input node.
 */
export function syncBaseNodeFieldsFromProps(node: BuilderNode): void {
  const props =
    node.props && typeof node.props === "object" && !Array.isArray(node.props)
      ? (node.props as Record<string, unknown>)
      : undefined;
  const base = node as unknown as Record<string, unknown>;
  for (const carrier of BASE_NODE_FIELD_CARRIERS) {
    const normalized = carrier.normalize(props?.[carrier.key]);
    if (normalized !== undefined) {
      base[carrier.key] = normalized;
      if (props) props[carrier.key] = normalized;
    } else {
      delete base[carrier.key];
      if (props) delete props[carrier.key];
    }
  }
}

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
  /** Defaults to `BUILDER_MAX_TREE_DEPTH` — the ONE cap the normalizer, this
   *  validator and the performance budget share (see tree-depth.ts). */
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
  const maxDepth = options.maxDepth ?? BUILDER_MAX_TREE_DEPTH;
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
      const leafProps = { ...(parsedProps.data as Record<string, unknown>) };
      const leaf: Record<string, unknown> = {
        id: node.id,
        kind,
        props: leafProps,
      };
      carryBaseNodeFields(node, leaf, leafProps);
      return leaf as unknown as BuilderNode;
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

    const parentProps = { ...(parsedProps.data as Record<string, unknown>) };
    const parent: Record<string, unknown> = {
      id: node.id,
      kind,
      props: parentProps,
      children,
    };
    carryBaseNodeFields(node, parent, parentProps);
    return parent as unknown as BuilderNode;
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
