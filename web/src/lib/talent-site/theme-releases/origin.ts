/**
 * THEME RELEASES: design origin stamps (plan §1.2).
 *
 * Every node a Design seeds carries `props.__origin = { design, version, key,
 * fp, cp? }` (shape + validator carrier in
 * `site-admin/builder-node/design-origin.ts`). Pure, client-safe.
 *
 * KEY: the section `slotKey` for a top-level node; `parentKey/segment` below
 * it, where a segment is the child's own slotKey, else its originRole, else
 * its kind, suffixed `#2`, `#3` only when siblings share a segment. Never the
 * node id (ids are positional `seqIds`).
 *
 * DESIGN-OWNED vs CONTENT-OWNED props (per leaf path, every node kind):
 *   - Props are flattened into leaf paths; plain objects recurse
 *     (`style.paddingY`, `style.responsive.mobile.paddingX`), arrays are one
 *     leaf (`items`, `navLinks`).
 *   - CONTENT-OWNED: a leaf whose seeded value carries a `{{token}}`
 *     (heading/paragraph `text` = `{{displayName}}`, image `src` =
 *     `{{headshotUrl}}`, button `href` = `{{inquireHref}}`, marquee `items`
 *     with `{{service1}}`, the footer copyright with `{{year}}`). Recorded in
 *     `cp`; an update never writes them.
 *   - Always content-owned (never fingerprinted): `i18n` (the talent's
 *     translations) and `__origin` itself.
 *   - DESIGN-OWNED: everything else. Variant, layout, style, columns,
 *     visibility, locks, anchor, slot/role, data-bound widget settings
 *     (services_catalog layout/categoryNav/density/...) and literal seeded
 *     labels ("Book now", "Services"), which a talent edit makes hers.
 *   - ORDER is structural, compared separately by the merge (child key order).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  DESIGN_KEY_PROP,
  DESIGN_ORIGIN_PROP,
  normalizeDesignKey,
  normalizeDesignOrigin,
  type DesignOrigin,
} from "@/lib/site-admin/builder-node/design-origin";

export { DESIGN_KEY_PROP, DESIGN_ORIGIN_PROP, type DesignOrigin };

export type Props = Record<string, unknown>;

/** Fingerprint for a node whose seeded state is unknown: never matches. */
export const UNKNOWN_FP = "?";

const TOKEN_RE = /\{\{\s*[\w.]+\s*\}\}/;
const NEVER_DESIGN = new Set<string>([DESIGN_ORIGIN_PROP, DESIGN_KEY_PROP, "i18n"]);

export function propsOf(node: BuilderNode): Props {
  const p = node.props as unknown;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as Props) : {};
}

export function kidsOf(node: BuilderNode): BuilderNode[] {
  return "children" in node && Array.isArray(node.children) ? (node.children as BuilderNode[]) : [];
}

export function hasKids(node: BuilderNode): boolean {
  return "children" in node && Array.isArray(node.children);
}

export function isPlainObject(v: unknown): v is Props {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** JSON with sorted object keys (stable across key order). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, x: unknown) =>
    isPlainObject(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  ) ?? "undefined";
}

/** cyrb53: small, stable, dependency-free string hash (base36). */
export function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function containsToken(value: unknown): boolean {
  if (typeof value === "string") return TOKEN_RE.test(value);
  if (Array.isArray(value)) return value.some(containsToken);
  if (isPlainObject(value)) return Object.values(value).some(containsToken);
  return false;
}

/** Leaf paths of a props object (plain objects recurse, arrays are leaves). */
export function flattenProps(props: Props): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const walk = (value: Props, trail: string) => {
    for (const [k, v] of Object.entries(value)) {
      if (!trail && NEVER_DESIGN.has(k)) continue;
      if (v === undefined) continue;
      const path = trail ? `${trail}.${k}` : k;
      if (isPlainObject(v) && Object.keys(v).length > 0) walk(v, path);
      else out.set(path, v);
    }
  };
  walk(props, "");
  return out;
}

/** Content-owned leaf paths: the seeded value carries a `{{token}}`. */
export function contentPaths(props: Props): string[] {
  const out: string[] = [];
  for (const [path, v] of flattenProps(props)) if (containsToken(v)) out.push(path);
  return out.sort();
}

function isContentPath(path: string, cp: ReadonlySet<string>): boolean {
  if (cp.has(path)) return true;
  for (const c of cp) if (path.startsWith(`${c}.`) || c.startsWith(`${path}.`)) return true;
  return false;
}

/** Design-owned leaves (path → stable JSON), content paths removed. */
export function designLeaves(props: Props, cp: ReadonlyArray<string> = []): Map<string, string> {
  const set = new Set(cp);
  const out = new Map<string, string>();
  for (const [path, v] of flattenProps(props)) {
    if (!isContentPath(path, set)) out.set(path, stableStringify(v));
  }
  return out;
}

/** Design-owned raw leaf values (for writes), content paths removed. */
export function designLeafValues(props: Props, cp: ReadonlyArray<string> = []): Map<string, unknown> {
  const set = new Set(cp);
  const out = new Map<string, unknown>();
  for (const [path, v] of flattenProps(props)) if (!isContentPath(path, set)) out.set(path, v);
  return out;
}

export function fingerprintProps(props: Props, cp: ReadonlyArray<string> = []): string {
  const leaves = [...designLeaves(props, cp)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return hashString(JSON.stringify(leaves));
}

export function readOrigin(node: BuilderNode): DesignOrigin | undefined {
  return normalizeDesignOrigin(propsOf(node)[DESIGN_ORIGIN_PROP]);
}

/** The node's CURRENT design-owned fingerprint (content paths from its stamp). */
export function nodeFingerprint(node: BuilderNode, origin = readOrigin(node)): string {
  return fingerprintProps(propsOf(node), origin?.cp ?? []);
}

/** Talent-edited: the current design-owned props no longer hash to the stamp. */
export function isNodeEdited(node: BuilderNode): boolean {
  const origin = readOrigin(node);
  if (!origin) return false;
  return origin.fp === UNKNOWN_FP || nodeFingerprint(node, origin) !== origin.fp;
}

export function withOrigin(node: BuilderNode, origin: DesignOrigin | undefined): BuilderNode {
  const props = { ...propsOf(node) };
  if (origin) props[DESIGN_ORIGIN_PROP] = origin;
  else delete props[DESIGN_ORIGIN_PROP];
  // `validateBuilderNodeTree` mirrors carried props onto the node base; keep
  // that mirror in step (props stays the source of truth).
  const out = { ...node, props } as Record<string, unknown>;
  if (origin && DESIGN_ORIGIN_PROP in node) out[DESIGN_ORIGIN_PROP] = origin;
  else if (!origin) delete out[DESIGN_ORIGIN_PROP];
  return out as unknown as BuilderNode;
}

/** A child's key segment (before sibling de-duplication). */
export function nodeSegment(node: BuilderNode): string {
  const p = propsOf(node);
  if (typeof p.slotKey === "string" && p.slotKey) return p.slotKey;
  if (typeof p.originRole === "string" && p.originRole) return p.originRole;
  return node.kind;
}

/** The node's pinned local key (`props.designKey`), when valid. */
export function pinnedDesignKey(node: BuilderNode): string | undefined {
  return normalizeDesignKey(propsOf(node)[DESIGN_KEY_PROP]);
}

/**
 * Local keys for a sibling list. A node pinned with `props.designKey` uses it
 * verbatim. Un-pinned nodes get `segment`, then `segment#2`, `segment#3`, the
 * ordinal skipping any key already pinned in the list (so a list with no pins
 * keys exactly as before pins existed).
 */
export function siblingLocalKeys(nodes: ReadonlyArray<BuilderNode>): string[] {
  const pinned = new Set<string>();
  for (const n of nodes) {
    const k = pinnedDesignKey(n);
    if (k) pinned.add(k);
  }
  const seen = new Map<string, number>();
  return nodes.map((n) => {
    const pin = pinnedDesignKey(n);
    if (pin) return pin;
    const seg = nodeSegment(n);
    let count = seen.get(seg) ?? 0;
    let local: string;
    do {
      count += 1;
      local = count === 1 ? seg : `${seg}#${count}`;
    } while (pinned.has(local));
    seen.set(seg, count);
    return local;
  });
}

/** Keys for a sibling list, qualified by the parent key. */
export function siblingKeys(nodes: ReadonlyArray<BuilderNode>, parentKey: string | null): string[] {
  return siblingLocalKeys(nodes).map((local) => (parentKey ? `${parentKey}/${local}` : local));
}

export interface StampSource {
  design: string;
  version: number;
}

/**
 * Stamp every node of a DESIGN tree (raw payload, `{{tokens}}` intact) with
 * its origin: key, content paths and fingerprint. Pure; returns a new tree.
 * Call `refreshOriginFingerprints` after validation so `fp` matches the
 * persisted (schema-normalized) props.
 */
export function stampDesignOrigin(tree: ReadonlyArray<BuilderNode>, src: StampSource): BuilderNode[] {
  const visit = (nodes: ReadonlyArray<BuilderNode>, parentKey: string | null): BuilderNode[] => {
    const keys = siblingKeys(nodes, parentKey);
    return nodes.map((node, i) => {
      const props = propsOf(node);
      const cp = contentPaths(props);
      const origin: DesignOrigin = {
        design: src.design,
        version: src.version,
        key: keys[i]!,
        fp: fingerprintProps(props, cp),
        ...(cp.length > 0 ? { cp } : {}),
      };
      const stamped = withOrigin(node, origin);
      return hasKids(node)
        ? ({ ...stamped, children: visit(kidsOf(node), keys[i]!) } as BuilderNode)
        : stamped;
    });
  };
  return visit(tree, null);
}

/** Recompute `fp` of every stamped node from its current props. Pure. */
export function refreshOriginFingerprints(tree: ReadonlyArray<BuilderNode>): BuilderNode[] {
  return tree.map((node) => {
    const origin = readOrigin(node);
    const next = origin ? withOrigin(node, { ...origin, fp: nodeFingerprint(node, origin) }) : node;
    return hasKids(node)
      ? ({ ...next, children: refreshOriginFingerprints(kidsOf(node)) } as BuilderNode)
      : next;
  });
}

/** Remove every stamp (tests, exports). Pure. */
export function stripDesignOrigin(tree: ReadonlyArray<BuilderNode>): BuilderNode[] {
  return tree.map((node) => {
    const next = withOrigin(node, undefined);
    return hasKids(node) ? ({ ...next, children: stripDesignOrigin(kidsOf(node)) } as BuilderNode) : next;
  });
}

/** Token origin: key → hash of the Design default as applied. */
export function tokenOriginMap(defaults: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(defaults ?? {})) if (typeof v === "string") out[k] = hashString(v);
  return out;
}

// ── Path helpers (dotted leaf paths into props) ──────────────────────────────

export function getPath(obj: Props, path: string): { has: boolean; value: unknown } {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!isPlainObject(cur) || !(part in cur)) return { has: false, value: undefined };
    cur = cur[part];
  }
  return { has: cur !== undefined, value: cur };
}

/** Immutable set (`has` false deletes; empty parent objects are pruned). */
export function setPath(obj: Props, path: string, has: boolean, value: unknown): Props {
  const [head, ...rest] = path.split(".");
  const out: Props = { ...obj };
  if (rest.length === 0) {
    if (has) out[head!] = value;
    else delete out[head!];
    return out;
  }
  const child = isPlainObject(obj[head!]) ? (obj[head!] as Props) : {};
  const next = setPath(child, rest.join("."), has, value);
  if (Object.keys(next).length === 0 && !has) delete out[head!];
  else out[head!] = next;
  return out;
}
