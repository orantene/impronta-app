/**
 * builtin-starter-hash.ts — content hashing for the built-in Site Starter Kit
 * rows, so the Lab can SEE when the published `page_template` rows have drifted
 * from the code registry that authored them.
 *
 * THE BUG CLASS THIS EXISTS FOR
 * ─────────────────────────────
 * `syncBuiltinStartersAction` is a one-way mechanical import of `PAGE_DESIGNS`
 * into `builder_templates`. It is idempotent, but nothing RE-RUNS it, and
 * nothing tells an operator that it needs re-running. The 11 published built-in
 * rows were all imported on 2026-06-18 at `version: 2`; `page-designs/` has
 * changed four times since, including two real rendering bug fixes. Provable:
 * `animationRepeat` was added to 8 of the 11 design files and appears in ZERO
 * published rows. Pointing the platform Default Storefront at one of those rows
 * today would ship known bugs to every new tenant.
 *
 * WHY A HASH AND NOT A TIMESTAMP
 * ──────────────────────────────
 * `updated_at` moves whenever an operator edits a row's title or thumbnail, and
 * a code edit does not move it at all — it is the exact wrong signal. And the
 * FILES cannot be hashed either: a comment, an import reorder, or a refactor
 * that leaves the rendered tree byte-identical would cry wolf. So we hash the
 * BAKED DESIGN TREE — the same artefact the sync writes — and compare it to the
 * tree that is actually published.
 *
 * WHAT THE HASH COVERS
 * ────────────────────
 *   • every node's `kind`, in depth-first order
 *   • every node prop, with object keys sorted so Postgres `jsonb` key
 *     reordering on the round-trip cannot look like drift
 *   • the full child structure and ordering
 *   • the BAKED tree, so a change to a design's inline `dataSources` (which the
 *     bake expands into static children) is drift too
 *
 * WHAT THE HASH DELIBERATELY IGNORES
 * ──────────────────────────────────
 *   • node `id`s. `bakePageDesignTree` re-mints every id through `makeId()` on
 *     every call, so ids are random per bake and can never match what is stored.
 *     Hashing them would report 11/11 stale, forever, which is the same as
 *     reporting nothing.
 *   • the two id-REFERENCE props (`defaultOpenItemIds`, `defaultTabId`), which
 *     the bake remaps alongside the ids. Rather than dropping them (which would
 *     hide a real "which tab opens first" change) they are rewritten to the
 *     STRUCTURAL PATH of the node they point at, e.g. `#0.2.1`, so the signal
 *     survives while the randomness does not.
 *   • row METADATA — title, description, category, tags, target_context. Sync
 *     overwrites those from code, but an operator can also curate them in the
 *     Lab, and a curated title is not a reason to shout "stale". Content drift
 *     is the dangerous one; metadata drift self-heals on the next sync.
 *   • `undefined` props (dropped by the JSON round-trip on the way to `jsonb`
 *     anyway, so they must be dropped here too or every row reads stale).
 *
 * Kept a plain module (NOT "use server") so it is unit-testable in the node
 * runner and importable from both the action file and a guard test.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

// ── Slug convention ──────────────────────────────────────────────────────────

/** Prefix of the deterministic slug every built-in design's imported row uses. */
export const BUILTIN_STARTER_SLUG_PREFIX = "builtin-";

/**
 * Deterministic slug for a built-in design's imported row. The whole import is
 * idempotent on this — re-running matches the existing row and refreshes it.
 * Owned here (rather than in the `"use server"` import file, which may only
 * export async functions) so the drift check and the sync agree by construction.
 */
export function builtinStarterSlug(designId: string): string {
  return `${BUILTIN_STARTER_SLUG_PREFIX}${designId}`;
}

/** True for a slug minted by {@link builtinStarterSlug}. */
export function isBuiltinStarterSlug(slug: string): boolean {
  return slug.startsWith(BUILTIN_STARTER_SLUG_PREFIX);
}

// ── Normalisation ────────────────────────────────────────────────────────────

/** Props whose VALUES are node ids the bake remaps. Rewritten to node paths. */
const ID_REFERENCE_ARRAY_PROPS = ["defaultOpenItemIds"] as const;
const ID_REFERENCE_STRING_PROPS = ["defaultTabId"] as const;

function childrenOf(node: BuilderNode): BuilderNode[] | null {
  return "children" in node && Array.isArray(node.children) ? node.children : null;
}

/**
 * Map every node id in the tree to its structural path ("0", "0.3", "0.3.1").
 * Used to make the id-reference props stable across a re-bake.
 */
function indexNodePaths(
  tree: ReadonlyArray<BuilderNode>,
  prefix = "",
  out: Map<string, string> = new Map(),
): Map<string, string> {
  tree.forEach((node, index) => {
    const path = prefix ? `${prefix}.${index}` : String(index);
    out.set(node.id, path);
    const kids = childrenOf(node);
    if (kids) indexNodePaths(kids, path, out);
  });
  return out;
}

/**
 * Canonicalise an arbitrary prop value: sort object keys, keep array order,
 * drop `undefined` (jsonb does), and leave primitives alone.
 */
function canonicalValue(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = canonicalValue(v);
    return out;
  }
  if (typeof value === "undefined") return null;
  return value;
}

/** One normalised node: kind + canonical props + normalised children. */
interface NormalizedNode {
  k: string;
  p: unknown;
  c?: NormalizedNode[];
}

/**
 * Normalise a builder tree into the id-free, key-sorted shape the hash is taken
 * over. Exported for the guard test, which asserts the two documented
 * invariants directly (ids ignored; a prop change is not).
 */
export function normalizeBuilderTreeForHash(
  tree: ReadonlyArray<BuilderNode>,
): NormalizedNode[] {
  const pathById = indexNodePaths(tree);
  const refPath = (id: unknown): unknown =>
    typeof id === "string" && pathById.has(id) ? `#${pathById.get(id)}` : id;

  const visit = (node: BuilderNode): NormalizedNode => {
    const props: Record<string, unknown> = {
      ...((node.props ?? {}) as Record<string, unknown>),
    };
    for (const key of ID_REFERENCE_ARRAY_PROPS) {
      if (Array.isArray(props[key])) {
        props[key] = (props[key] as unknown[]).map(refPath);
      }
    }
    for (const key of ID_REFERENCE_STRING_PROPS) {
      if (typeof props[key] === "string") props[key] = refPath(props[key]);
    }
    const kids = childrenOf(node);
    const normalized: NormalizedNode = {
      k: node.kind,
      p: canonicalValue(props),
    };
    if (kids) normalized.c = kids.map(visit);
    return normalized;
  };

  return tree.map(visit);
}

// ── Hash ─────────────────────────────────────────────────────────────────────

/**
 * FNV-1a 64-bit over the canonical JSON, rendered as 16 hex chars.
 *
 * Deliberately NOT `node:crypto`: this runs in the same module graph a client
 * component can pull in transitively, and a synchronous, dependency-free digest
 * keeps that safe. Collision risk is irrelevant here — the alternative to a
 * matching hash is no check at all, and the two inputs are never adversarial.
 */
export function hashBuilderTreeContent(
  tree: ReadonlyArray<BuilderNode>,
): string {
  const json = JSON.stringify(normalizeBuilderTreeForHash(tree));
  let hi = 0x811c9dc5;
  let lo = 0x9dc5811c;
  for (let i = 0; i < json.length; i += 1) {
    const code = json.charCodeAt(i);
    hi ^= code;
    lo ^= (code << 3) | (code >>> 5);
    // Two independent 32-bit FNV-1a lanes; multiply by 16777619 via shifts so
    // the intermediate never leaves the 32-bit int range.
    hi = Math.imul(hi, 0x01000193) >>> 0;
    lo = Math.imul(lo, 0x01000193) >>> 0;
  }
  return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}

// ── Drift report ─────────────────────────────────────────────────────────────

/** Why a built-in design is not in sync with what is published. */
export type BuiltinStarterDriftState =
  /** A published row exists and its tree hash matches the code. */
  | "in_sync"
  /** A published row exists but its tree differs from the code design. */
  | "stale"
  /** The row exists but is not published (draft / in_review / archived). */
  | "unpublished"
  /** No row for this design at all — sync has never imported it. */
  | "missing";

export interface BuiltinStarterDriftEntry {
  /** PageDesign id. */
  designId: string;
  /** The deterministic row slug (`builtin-<designId>`). */
  slug: string;
  /** Operator-facing design label. */
  label: string;
  /** The `builder_templates.id` of the matched row, when one exists. */
  templateId: string | null;
  state: BuiltinStarterDriftState;
}

export interface BuiltinStarterDriftReport {
  entries: BuiltinStarterDriftEntry[];
  /** Count of entries whose state is anything other than `in_sync`. */
  outOfSyncCount: number;
  /** Row ids that are published but stale — the Default-surfaces panel keys on
   *  these to warn that the pointed-at template ships known-old content. */
  staleTemplateIds: string[];
}

/** The minimum row shape the comparison needs. */
export interface DriftComparableRow {
  id: string;
  slug: string;
  status: string;
  builder_tree: BuilderNode[];
}

/** The minimum design shape the comparison needs (label + baked tree hash). */
export interface DriftComparableDesign {
  designId: string;
  label: string;
  /** Hash of the BAKED tree, from {@link hashBuilderTreeContent}. */
  hash: string;
}

/**
 * Pure comparison: for each built-in design, find its row by the deterministic
 * slug and classify it. No I/O — the caller supplies both sides, which is what
 * makes this testable without a database.
 */
export function compareBuiltinStarterDrift(
  designs: ReadonlyArray<DriftComparableDesign>,
  rows: ReadonlyArray<DriftComparableRow>,
): BuiltinStarterDriftReport {
  const rowBySlug = new Map<string, DriftComparableRow>();
  for (const row of rows) rowBySlug.set(row.slug, row);

  const entries: BuiltinStarterDriftEntry[] = designs.map((design) => {
    const slug = builtinStarterSlug(design.designId);
    const row = rowBySlug.get(slug);
    if (!row) {
      return {
        designId: design.designId,
        slug,
        label: design.label,
        templateId: null,
        state: "missing" as const,
      };
    }
    if (row.status !== "published") {
      return {
        designId: design.designId,
        slug,
        label: design.label,
        templateId: row.id,
        state: "unpublished" as const,
      };
    }
    const publishedHash = hashBuilderTreeContent(row.builder_tree ?? []);
    return {
      designId: design.designId,
      slug,
      label: design.label,
      templateId: row.id,
      state: publishedHash === design.hash ? ("in_sync" as const) : ("stale" as const),
    };
  });

  return {
    entries,
    outOfSyncCount: entries.filter((e) => e.state !== "in_sync").length,
    staleTemplateIds: entries
      .filter((e) => e.state === "stale" && e.templateId)
      .map((e) => e.templateId as string),
  };
}

/** Slugs of every entry that is not in sync — the "name which rows" list. */
export function outOfSyncSlugs(report: BuiltinStarterDriftReport): string[] {
  return report.entries.filter((e) => e.state !== "in_sync").map((e) => e.slug);
}

/**
 * One operator-readable line for the drift banner. Deliberately says what the
 * consequence is, not just the count: a stale starter is only interesting
 * because pointing a default at it ships old content.
 */
export function driftHeadline(report: BuiltinStarterDriftReport): string {
  const n = report.outOfSyncCount;
  if (n === 0) return "Built-in starters match the code designs.";
  return `${n} built-in starter${n === 1 ? "" : "s"} ${
    n === 1 ? "is" : "are"
  } out of date. Publishing or pointing a default at ${
    n === 1 ? "it" : "one of them"
  } ships older content than the code designs.`;
}
