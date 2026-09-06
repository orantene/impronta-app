/**
 * validate-publish.ts — Builder Studio WS-D D1.
 *
 * Pure, side-effect-free validation gate that `publishTemplate` runs BEFORE it
 * writes status=published. A broken / empty / unbindable template must never
 * reach a tenant's "+" gallery, so publish blocks on any failure with a clear,
 * operator-readable reason.
 *
 * Kept a plain module (NOT "use server") so it is unit-testable in the node
 * runner and importable from the server action without Next.js bootstrapping.
 *
 * Checks, in order:
 *   1. Tree is non-empty AND `validateBuilderNodeTree` passes (blocks an empty
 *      template — which would insert nothing — and a structurally corrupt one).
 *   2. Every data-bound node references a REGISTERED data source. A dangling
 *      binding (unknown / removed source key) is resolved against
 *      `getBuilderDataSourceDefinition`, which is backed by
 *      BUILDER_DATA_SOURCE_REGISTRY (+ `collection:` keys, which are opaque and
 *      treated as valid). This is a STRUCTURAL binding check: it proves every
 *      binding points at a source the renderer knows how to resolve. It does
 *      NOT execute the binding against a live preview subject — that needs
 *      tenant DB plumbing (a real subject id, RLS-scoped data loaders) that is
 *      out of scope for a pure publish gate and would couple validation to a
 *      specific tenant. See `diffTemplateTreeForPublish` for the change check.
 */

import {
  validateBuilderNodeTree,
  type BuilderNodeValidationIssue,
} from "@/lib/site-admin/builder-node/validate";
import {
  getBuilderNodeDataBinding,
  getBuilderDataSourceDefinition,
} from "@/lib/site-admin/builder-node/data-bindings";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { isStyleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";

// ── Result type ───────────────────────────────────────────────────────────────

export type ValidateTemplateForPublishResult =
  | { ok: true; treeDiff: TemplateTreeDiff }
  | { ok: false; reasons: string[] };

export interface ValidateTemplateForPublishOptions {
  /**
   * The builder_tree of the most recent published revision (or the current live
   * row before this publish). When supplied, the gate surfaces whether anything
   * changed since then. A no-op publish (identical tree) does NOT block — it is
   * surfaced via `diffTemplateTreeForPublish` for callers that want to warn —
   * but is never a hard failure here.
   */
  previousTree?: ReadonlyArray<BuilderNode> | null;
}

// ── Dangling-binding scan ─────────────────────────────────────────────────────

/**
 * Walk the tree and collect every data-bound node whose `sourceKey` is NOT a
 * registered data source. `getBuilderDataSourceDefinition` returns null only
 * for an unknown source — it already accepts `collection:<id>` keys and the
 * legacy aliases (`roster_talent`, `taxonomy_category`, `location`).
 */
function collectDanglingBindings(
  tree: ReadonlyArray<BuilderNode>,
): Array<{ nodeId: string; sourceKey: string }> {
  const dangling: Array<{ nodeId: string; sourceKey: string }> = [];

  const visit = (node: BuilderNode): void => {
    const binding = getBuilderNodeDataBinding(node);
    if (binding?.sourceKey) {
      if (!getBuilderDataSourceDefinition(binding.sourceKey)) {
        dangling.push({ nodeId: node.id, sourceKey: binding.sourceKey });
      }
    }
    const children = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(children)) {
      for (const child of children) visit(child);
    }
  };

  for (const node of tree) visit(node);
  return dangling;
}

// ── Diff vs the last snapshot ─────────────────────────────────────────────────

export interface TemplateTreeDiff {
  /** False when there is no previous tree to compare against (first publish). */
  hasPrevious: boolean;
  /** True when the tree differs from the previous snapshot (or is the first). */
  changed: boolean;
}

/**
 * Cheap structural diff: did the builder_tree change vs the previous snapshot?
 * Uses a stable JSON comparison (the tree is plain JSON at rest). This is
 * advisory — a no-op publish is allowed (re-publishing to bump version is a
 * legitimate operation); the gate only SURFACES the result, it does not block.
 */
export function diffTemplateTreeForPublish(
  tree: ReadonlyArray<BuilderNode>,
  previousTree?: ReadonlyArray<BuilderNode> | null,
): TemplateTreeDiff {
  if (previousTree == null) return { hasPrevious: false, changed: true };
  const changed = stableStringify(tree) !== stableStringify(previousTree);
  return { hasPrevious: true, changed };
}

/**
 * Deterministic JSON stringify (object keys sorted) so two trees that differ
 * only by key insertion order compare equal. Arrays keep their order (order is
 * meaningful for a node tree).
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

// ── The gate ──────────────────────────────────────────────────────────────────

function summarizeIssues(
  issues: ReadonlyArray<BuilderNodeValidationIssue>,
): string {
  const MAX = 5;
  const head = issues
    .slice(0, MAX)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join(", ");
  const more = issues.length > MAX ? ` (+${issues.length - MAX} more)` : "";
  return `template structure is invalid — ${head}${more}`;
}

/**
 * The publish gate. Returns `{ ok: true }` when the template is safe to publish,
 * or `{ ok: false, reasons }` with one or more operator-readable reasons.
 *
 * Pure: no I/O, no logging, no throwing. The caller turns `reasons` into the
 * action's `{ ok: false, error }` shape.
 */
/**
 * A token-backed background paired with a LITERAL text colour.
 *
 * The background follows the tenant's palette; a literal ink follows nothing.
 * So the pair is only readable for whichever tenant it was authored against —
 * two published templates carried `backgroundColor: "token:color.primary"` with
 * `textColor: "#1a1407"`, ink authored for Impronta's gold, which measured
 * 1.03:1 on the registry-default primary. `render.tsx` lets an explicit literal
 * win over the paired-foreground role, correctly, so no amount of fixing the
 * pairing token reaches it.
 *
 * Only the PAIRING is refused. A literal background with a literal ink is a
 * deliberate fixed-colour block and stays publishable; token + token is the
 * correct form. A check that refused every literal would be a check someone
 * disables the first time they ship a fixed-colour block.
 */
const COLOUR_LITERAL = /^(#|rgb|hsl|color\()/i;

function isColourLiteral(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Bind the trimmed string BEFORE the token guard. `isStyleTokenRef` is a
  // `value is string` predicate, so its NEGATIVE branch narrows an
  // already-string value to `never` — and `never.trim()` does not compile.
  // A guard that narrows the wrong way in the branch you need is easy to write
  // and reads as correct.
  const text = value.trim();
  if (text.length === 0) return false;
  if (isStyleTokenRef(text)) return false;
  return COLOUR_LITERAL.test(text);
}

function collectContrastBombs(
  nodes: ReadonlyArray<BuilderNode>,
): Array<{ nodeId: string; background: string; ink: string }> {
  const out: Array<{ nodeId: string; background: string; ink: string }> = [];
  const walk = (list: ReadonlyArray<BuilderNode>): void => {
    for (const node of list) {
      const style = (node.props as { style?: Record<string, unknown> } | undefined)
        ?.style;
      const bg = style?.backgroundColor;
      const ink = style?.textColor;
      if (typeof bg === "string" && isStyleTokenRef(bg) && isColourLiteral(ink)) {
        out.push({ nodeId: node.id, background: bg, ink });
      }
      const kids = (node as { children?: ReadonlyArray<BuilderNode> }).children;
      if (Array.isArray(kids)) walk(kids);
    }
  };
  walk(nodes);
  return out;
}

export function validateTemplateForPublish(
  tree: ReadonlyArray<BuilderNode> | null | undefined,
  opts?: ValidateTemplateForPublishOptions,
): ValidateTemplateForPublishResult {
  const reasons: string[] = [];

  // 1. Non-empty + structurally valid.
  if (!Array.isArray(tree) || tree.length === 0) {
    reasons.push(
      "template has no content — it would insert nothing into a page",
    );
    // Nothing else is meaningful to check on an empty tree.
    return { ok: false, reasons };
  }

  const validation = validateBuilderNodeTree(tree);
  if (!validation.ok) {
    reasons.push(summarizeIssues(validation.issues));
  }

  // 2. No dangling data bindings. Run against the validated/repaired tree when
  //    available so we scan the same node set the renderer would ship; fall
  //    back to the input tree if validation rebuilt nothing.
  const scanTree = validation.tree.length > 0 ? validation.tree : tree;
  const dangling = collectDanglingBindings(scanTree);
  if (dangling.length > 0) {
    const detail = dangling
      .slice(0, 5)
      .map((d) => `"${d.sourceKey}" (node ${d.nodeId})`)
      .join(", ");
    const more = dangling.length > 5 ? ` (+${dangling.length - 5} more)` : "";
    reasons.push(
      `unknown data source${dangling.length > 1 ? "s" : ""}: ${detail}${more} — pick a supported source before publishing`,
    );
  }

  // 3. No contrast bombs. A token ground with a literal ink publishes a button
  //    whose label is readable only for the tenant it was authored against, and
  //    it is invisible to every other check: the tree is structurally valid and
  //    the bindings all resolve.
  const bombs = collectContrastBombs(scanTree);
  if (bombs.length > 0) {
    const detail = bombs
      .slice(0, 5)
      .map((b) => `node ${b.nodeId} (${b.background} + ${b.ink})`)
      .join(", ");
    const more = bombs.length > 5 ? ` (+${bombs.length - 5} more)` : "";
    reasons.push(
      `token background with a hardcoded text colour: ${detail}${more} — the ` +
        `background follows each tenant's palette and the ink does not, so the ` +
        `label is only readable for the tenant this was authored against. Bind ` +
        `the text colour to the pairing token (token:color.primary-on) or make ` +
        `the background a literal too`,
    );
  }

  if (reasons.length > 0) return { ok: false, reasons };

  // 3. Diff vs the last snapshot is advisory only (never blocks). Returned in
  //    the result so callers can surface "no changes since v(N)" warnings — see
  //    diffTemplateTreeForPublish. Previously void-discarded; now threaded out.
  const treeDiff = diffTemplateTreeForPublish(tree, opts?.previousTree);

  return { ok: true, treeDiff };
}

// ── Pre-publish checklist (A6 — read-only preview) ────────────────────────────

/**
 * One row in the pre-publish checklist surfaced by `PublishNotePanel` (A6).
 * `pass` is whether the check is satisfied; `blocking` distinguishes a hard
 * failure (publish would be rejected by `validateTemplateForPublish`) from a
 * soft warning (publish still works, but the template ships incomplete — e.g.
 * no description / thumbnail / changelog).
 */
export interface PublishChecklistRow {
  /** Stable machine key (for tests / data-testid). */
  key:
    | "has_content"
    | "bindings_resolvable"
    | "has_description"
    | "has_thumbnail"
    | "has_changelog";
  /** Human label shown in the panel. */
  label: string;
  /** True when the check is satisfied. */
  pass: boolean;
  /** True when a failure BLOCKS publish; false = advisory warning only. */
  blocking: boolean;
  /** Optional one-line detail shown when the check fails. */
  detail?: string;
}

/** Aggregate checklist verdict. */
export interface PublishChecklist {
  rows: PublishChecklistRow[];
  /** True when no BLOCKING row is failing — i.e. publish would be accepted. */
  canPublish: boolean;
  /** True when at least one advisory (non-blocking) row is failing. */
  hasWarnings: boolean;
}

/**
 * The read-only inputs the checklist needs. This is exactly the subset of a
 * `builder_templates` row the publish UI already holds in memory, so the
 * preview is computed WITHOUT a DB round-trip and WITHOUT mutating anything.
 */
export interface PublishChecklistInput {
  tree: ReadonlyArray<BuilderNode> | null | undefined;
  description?: string | null;
  thumbnailAssetId?: string | null;
  changelog?: string | null;
  /** Optional changelog the admin is about to type in the panel (A6). When
   *  non-empty it satisfies the changelog row even if the row's stored value
   *  is blank — the note is about to be stamped on this publish. */
  pendingChangelog?: string | null;
  previousTree?: ReadonlyArray<BuilderNode> | null;
}

function isNonBlank(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * READ-ONLY wrapper over `validateTemplateForPublish` (A6). Runs the SAME
 * structural validator the publish gate runs (no fork) and maps its result —
 * plus the advisory metadata checks (description / thumbnail / changelog) — into
 * a flat list of pass/fail rows for `PublishNotePanel` to render BEFORE the
 * admin ships. Never mutates, never does I/O: purely a function of its input.
 *
 * The two structural rows (`has_content`, `bindings_resolvable`) are BLOCKING —
 * they mirror the two failure modes of `validateTemplateForPublish`. The three
 * metadata rows are advisory warnings: a template with no description still
 * publishes, but the operator sees what's missing first.
 */
export function previewPublishChecklist(
  input: PublishChecklistInput,
): PublishChecklist {
  const validation = validateTemplateForPublish(input.tree, {
    previousTree: input.previousTree,
  });

  // Derive the two structural rows from the validator's reasons. An empty tree
  // is the first reason; a dangling-binding reason mentions "data source".
  const reasons = validation.ok ? [] : validation.reasons;
  const emptyContent =
    !Array.isArray(input.tree) || input.tree.length === 0;
  const bindingReason = reasons.find((r) => r.includes("data source"));
  const structureReason = reasons.find(
    (r) => r.includes("template structure is invalid"),
  );

  // "Has content" fails when the tree is empty OR structurally invalid (both
  // would make validateTemplateForPublish reject — both are blocking).
  const contentPass = !emptyContent && structureReason == null;
  const contentDetail = emptyContent
    ? "Template has no content — it would insert nothing into a page."
    : structureReason;

  const bindingsPass = bindingReason == null;

  const rows: PublishChecklistRow[] = [
    {
      key: "has_content",
      label: "Has content",
      pass: contentPass,
      blocking: true,
      ...(contentPass ? {} : { detail: contentDetail ?? undefined }),
    },
    {
      key: "bindings_resolvable",
      label: "Bindings resolvable",
      pass: bindingsPass,
      blocking: true,
      ...(bindingsPass ? {} : { detail: bindingReason }),
    },
    {
      key: "has_description",
      label: "Has description",
      pass: isNonBlank(input.description),
      blocking: false,
      ...(isNonBlank(input.description)
        ? {}
        : { detail: "No description — clients see a blank gallery card." }),
    },
    {
      key: "has_thumbnail",
      label: "Has thumbnail",
      pass: isNonBlank(input.thumbnailAssetId),
      blocking: false,
      ...(isNonBlank(input.thumbnailAssetId)
        ? {}
        : { detail: "No thumbnail — the gallery shows a placeholder." }),
    },
    {
      key: "has_changelog",
      label: "Has changelog",
      pass:
        isNonBlank(input.pendingChangelog) || isNonBlank(input.changelog),
      blocking: false,
      ...(isNonBlank(input.pendingChangelog) || isNonBlank(input.changelog)
        ? {}
        : { detail: "No changelog — the revision will read “No changelog”." }),
    },
  ];

  const canPublish = rows.every((r) => !r.blocking || r.pass);
  const hasWarnings = rows.some((r) => !r.blocking && !r.pass);

  return { rows, canPublish, hasWarnings };
}
