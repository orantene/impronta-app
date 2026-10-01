/**
 * AUTHORED OVERLAY ENGINE (S11). Pure, client-safe.
 *
 * An editor-authored design version lives in `talent_theme_versions`; the
 * committed `<slug>.overlay.json` is the same version expressed as a patch on
 * the RAW code payload, so git has its history and the code reflects it:
 *
 *   diffToOverlay(raw, authored)    -> patch (pull-authored.mts writes it)
 *   applyAuthoredOverlay(raw, o)    -> canonical authored payload
 *
 * Both sides are compared in canonical form (origin stamps stripped, every
 * node's design key frozen into `props.designKey`, token defaults sorted,
 * JSON round trip), i.e. the form the editor publishes. Nodes are addressed by
 * `<tree>:<key path>` (`homeTree:hero/masthead`); a list's parent is
 * `<tree>:<path>` with `<tree>:` for the top level.
 *
 * Apply is STRICT: every `from` must match the current code leaf, every
 * removed / patched / ordered key must exist, every added key must not. A kit
 * change that collides with a patched leaf therefore THROWS, so CI fails
 * loudly instead of silently shipping a half-applied design. Kit changes to
 * leaves the overlay does not touch flow through.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "../../types";
import { freezeDesignKeys } from "../../../theme-releases/design-keys";
import { hasKids, isPlainObject, kidsOf, siblingLocalKeys, stripDesignOrigin } from "../../../theme-releases/origin";

type Json = unknown;
export type OverlayTree = "shellTree" | "homeTree" | "optionalBlocks";
const TREES: ReadonlyArray<OverlayTree> = ["shellTree", "homeTree", "optionalBlocks"];

/** A leaf change. An omitted `from` / `to` means "absent". */
export interface LeafChange {
  path: string;
  from?: Json;
  to?: Json;
}

export interface AddedNode {
  tree: OverlayTree;
  /** `<tree>:<parent key path>`; `<tree>:` for the top level. */
  parentKey: string;
  /** Local key of the sibling it follows in the authored list; null = first. */
  afterKey: string | null;
  node: BuilderNode;
}

export interface AuthoredOverlayFile {
  authoredVersion: number;
  /** hashBuiltinPayload(raw code payload) the overlay was computed against. */
  codeHash: string;
  /** publish-core payloadHash of the authored snapshot (meta.payload_hash). */
  payloadHash: string;
  tokenDefaults: Record<string, { from?: string; to?: string }>;
  props: Record<string, LeafChange[]>;
  removed: string[];
  added: AddedNode[];
  order: Record<string, string[]>;
  labelsEs: Record<string, string>;
}

export class AuthoredOverlayError extends Error {
  constructor(message: string) {
    super(`Authored overlay does not apply: ${message}`);
    this.name = "AuthoredOverlayError";
  }
}

// ── Canonical form ───────────────────────────────────────────────────────────

function sortedRecord(r: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Same shape `publish-core.canonicalDesign` stores, with design keys frozen. */
export function canonicalOverlayPayload(payload: DesignPayload): DesignPayload {
  const out: DesignPayload = {
    shellTree: stripDesignOrigin(payload.shellTree ?? []),
    homeTree: stripDesignOrigin(payload.homeTree ?? []),
    ...(payload.optionalBlocks ? { optionalBlocks: stripDesignOrigin(payload.optionalBlocks) } : {}),
    ...(payload.tokenDefaults ? { tokenDefaults: sortedRecord(payload.tokenDefaults) } : {}),
  };
  // Like the editor: shell + home are frozen; optionalBlocks keep computed keys.
  const frozen = freezeDesignKeys(out);
  return JSON.parse(JSON.stringify(frozen)) as DesignPayload;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const stable = (v: Json): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    isPlainObject(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  ) ?? "undefined";
const same = (a: Json, b: Json): boolean => stable(a) === stable(b);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const show = (v: Json, has: boolean): string => (has ? JSON.stringify(v) : "(absent)");

/** Node fields minus `children`, flattened to leaves (arrays and `{}` are leaves). */
function flatten(obj: Record<string, unknown>, prefix = "", out = new Map<string, Json>()): Map<string, Json> {
  for (const [k, v] of Object.entries(obj)) {
    if (!prefix && k === "children") continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v) && Object.keys(v).length > 0) flatten(v, p, out);
    else out.set(p, v);
  }
  return out;
}

function readLeaf(obj: Record<string, unknown>, path: string): { has: boolean; value: Json } {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!isPlainObject(cur) || !Object.prototype.hasOwnProperty.call(cur, part)) return { has: false, value: undefined };
    cur = cur[part];
  }
  return { has: true, value: cur };
}

/** Mutating set; deleting prunes parents it empties. */
function writeLeaf(obj: Record<string, unknown>, path: string, has: boolean, value: Json): void {
  const parts = path.split(".");
  const chain: Record<string, unknown>[] = [obj];
  for (const part of parts.slice(0, -1)) {
    const cur = chain[chain.length - 1]!;
    if (!isPlainObject(cur[part])) {
      if (!has) return;
      cur[part] = {};
    }
    chain.push(cur[part] as Record<string, unknown>);
  }
  const last = parts[parts.length - 1]!;
  if (has) {
    chain[chain.length - 1]![last] = clone(value);
    return;
  }
  delete chain[chain.length - 1]![last];
  for (let i = chain.length - 1; i > 0; i -= 1) {
    if (Object.keys(chain[i]!).length > 0) break;
    delete chain[i - 1]![parts[i - 1]!];
  }
}

const rootOf = (tree: OverlayTree) => `${tree}:`;
const childPath = (parent: string, local: string) => (parent.endsWith(":") ? `${parent}${local}` : `${parent}/${local}`);

interface Indexed {
  /** full key -> node */
  nodes: Map<string, BuilderNode>;
  /** list key (`<tree>:<path>`) -> local keys in order */
  lists: Map<string, string[]>;
}

function indexPayload(p: DesignPayload): Indexed {
  const nodes = new Map<string, BuilderNode>();
  const lists = new Map<string, string[]>();
  const visit = (list: ReadonlyArray<BuilderNode>, parent: string) => {
    const locals = siblingLocalKeys(list);
    const seen = new Set<string>();
    locals.forEach((l) => {
      if (seen.has(l)) throw new AuthoredOverlayError(`duplicate design key "${l}" under ${parent}`);
      seen.add(l);
    });
    lists.set(parent, locals);
    list.forEach((n, i) => {
      const key = childPath(parent, locals[i]!);
      nodes.set(key, n);
      if (hasKids(n)) visit(kidsOf(n), key);
    });
  };
  for (const t of TREES) {
    const list = p[t];
    if (list) visit(list, rootOf(t));
  }
  return { nodes, lists };
}

const treeOfKey = (key: string): OverlayTree => key.slice(0, key.indexOf(":")) as OverlayTree;

// ── Diff ─────────────────────────────────────────────────────────────────────

export function emptyOverlay(authoredVersion: number, codeHash: string, payloadHash: string): AuthoredOverlayFile {
  return { authoredVersion, codeHash, payloadHash, tokenDefaults: {}, props: {}, removed: [], added: [], order: {}, labelsEs: {} };
}

/** True when the overlay changes nothing (identity patch). */
export function isEmptyOverlay(o: AuthoredOverlayFile): boolean {
  return (
    Object.keys(o.tokenDefaults).length === 0 &&
    Object.keys(o.props).length === 0 &&
    o.removed.length === 0 &&
    o.added.length === 0 &&
    Object.keys(o.order).length === 0
  );
}

/**
 * Patch that turns the raw code payload into the authored one. Header fields
 * (`authoredVersion`, hashes, `labelsEs`) are left for the caller.
 */
export function diffToOverlay(rawCodePayload: DesignPayload, authoredPayload: DesignPayload): AuthoredOverlayFile {
  const C = canonicalOverlayPayload(rawCodePayload);
  const P = canonicalOverlayPayload(authoredPayload);
  for (const t of TREES) {
    if (!!C[t] !== !!P[t]) throw new AuthoredOverlayError(`the authored payload ${P[t] ? "adds" : "drops"} ${t}; not supported`);
  }
  const o = emptyOverlay(0, "", "");

  const cTok = C.tokenDefaults ?? {};
  const pTok = P.tokenDefaults ?? {};
  for (const k of [...new Set([...Object.keys(cTok), ...Object.keys(pTok)])].sort()) {
    if (cTok[k] === pTok[k]) continue;
    o.tokenDefaults[k] = {
      ...(k in cTok ? { from: cTok[k] } : {}),
      ...(k in pTok ? { to: pTok[k] } : {}),
    };
  }
  if (!C.tokenDefaults !== !P.tokenDefaults && Object.keys(o.tokenDefaults).length === 0) {
    throw new AuthoredOverlayError("tokenDefaults presence differs with no key change; not supported");
  }

  const ci = indexPayload(C);
  const pi = indexPayload(P);

  // Removed: top-most only (a removed parent takes its children).
  for (const key of ci.nodes.keys()) {
    if (pi.nodes.has(key)) continue;
    const parent = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : null;
    if (parent && !pi.nodes.has(parent)) continue;
    o.removed.push(key);
  }

  // Props on surviving nodes.
  for (const [key, cn] of ci.nodes) {
    const pn = pi.nodes.get(key);
    if (!pn) continue;
    const cf = flatten(cn as unknown as Record<string, unknown>);
    const pf = flatten(pn as unknown as Record<string, unknown>);
    const changes: LeafChange[] = [];
    for (const path of [...new Set([...cf.keys(), ...pf.keys()])].sort()) {
      const ch = cf.has(path);
      const ph = pf.has(path);
      if (ch && ph && same(cf.get(path), pf.get(path))) continue;
      changes.push({ path, ...(ch ? { from: cf.get(path) } : {}), ...(ph ? { to: pf.get(path) } : {}) });
    }
    if (changes.length > 0) o.props[key] = changes;
  }

  // Added: top-most only, whole subtree, in authored list order.
  for (const [listKey, locals] of pi.lists) {
    if (!listKey.endsWith(":") && !ci.nodes.has(listKey)) continue; // inside an added node
    locals.forEach((local, i) => {
      const key = childPath(listKey, local);
      if (ci.nodes.has(key)) return;
      o.added.push({
        tree: treeOfKey(listKey),
        parentKey: listKey,
        afterKey: i === 0 ? null : locals[i - 1]!,
        node: clone(pi.nodes.get(key)!),
      });
    });
  }

  // Order: any surviving list whose post-add/remove order differs.
  for (const [listKey, cLocals] of ci.lists) {
    const pLocals = pi.lists.get(listKey);
    if (!pLocals) continue;
    const pending = applyListEdits(cLocals, listKey, o.removed, o.added);
    if (pending.join("\u0000") !== pLocals.join("\u0000")) o.order[listKey] = [...pLocals];
  }
  return o;
}

/** Local-key list after removals and insertions (what apply produces before `order`). */
function applyListEdits(
  locals: ReadonlyArray<string>,
  listKey: string,
  removed: ReadonlyArray<string>,
  added: ReadonlyArray<AddedNode>,
): string[] {
  const gone = new Set(removed);
  const out = locals.filter((l) => !gone.has(childPath(listKey, l)));
  for (const a of added) {
    if (a.parentKey !== listKey) continue;
    const local = keyOfAdded(a);
    if (out.includes(local)) throw new AuthoredOverlayError(`added key "${childPath(listKey, local)}" already exists`);
    if (a.afterKey === null) out.unshift(local);
    else {
      const at = out.indexOf(a.afterKey);
      if (at < 0) {
        throw new AuthoredOverlayError(`added "${childPath(listKey, local)}" follows "${a.afterKey}", which is not in ${listKey}`);
      }
      out.splice(at + 1, 0, local);
    }
  }
  return out;
}

function keyOfAdded(a: AddedNode): string {
  const k = siblingLocalKeys([a.node])[0];
  if (!k) throw new AuthoredOverlayError(`added node under ${a.parentKey} has no design key`);
  return k;
}

// ── Apply ────────────────────────────────────────────────────────────────────

/**
 * Raw code payload + overlay -> the authored payload in canonical form.
 * Throws AuthoredOverlayError on any collision (see file header).
 */
export function applyAuthoredOverlay(rawCodePayload: DesignPayload, overlay: AuthoredOverlayFile): DesignPayload {
  const C = canonicalOverlayPayload(rawCodePayload);
  const idx = indexPayload(C);

  // 1. Token defaults.
  const tok: Record<string, string> = { ...(C.tokenDefaults ?? {}) };
  for (const [k, ch] of Object.entries(overlay.tokenDefaults ?? {})) {
    const has = Object.prototype.hasOwnProperty.call(tok, k);
    const wantHas = ch.from !== undefined;
    if (has !== wantHas || (has && tok[k] !== ch.from)) {
      throw new AuthoredOverlayError(
        `token default "${k}" is ${show(tok[k], has)} in code, the overlay expects ${show(ch.from, wantHas)}`,
      );
    }
    if (ch.to === undefined) delete tok[k];
    else tok[k] = ch.to;
  }

  // 2. Leaf props on existing nodes (mutate clones held in a map).
  const patched = new Map<string, Record<string, unknown>>();
  for (const [key, changes] of Object.entries(overlay.props ?? {})) {
    const node = idx.nodes.get(key);
    if (!node) throw new AuthoredOverlayError(`patched node "${key}" is not in the code payload`);
    const obj = clone(node) as unknown as Record<string, unknown>;
    const ordered = [...changes].sort((a, b) => Number(a.to !== undefined) - Number(b.to !== undefined));
    for (const ch of ordered) {
      const cur = readLeaf(obj, ch.path);
      const leaf = cur.has && !(isPlainObject(cur.value) && Object.keys(cur.value).length > 0);
      const wantHas = Object.prototype.hasOwnProperty.call(ch, "from");
      if (leaf !== wantHas || (leaf && !same(cur.value, ch.from))) {
        throw new AuthoredOverlayError(
          `"${key}" ${ch.path} is ${show(cur.value, leaf)} in code, the overlay expects ${show(ch.from, wantHas)}`,
        );
      }
      writeLeaf(obj, ch.path, Object.prototype.hasOwnProperty.call(ch, "to"), ch.to);
    }
    patched.set(key, obj);
  }

  // 3. Structure: removals, insertions, order.
  for (const key of overlay.removed ?? []) {
    if (!idx.nodes.has(key)) throw new AuthoredOverlayError(`removed node "${key}" is not in the code payload`);
  }
  for (const a of overlay.added ?? []) {
    if (!a.parentKey.endsWith(":") && !idx.nodes.has(a.parentKey)) {
      throw new AuthoredOverlayError(`added node's parent "${a.parentKey}" is not in the code payload`);
    }
  }
  const lists = new Map<string, string[]>();
  const listKeys = new Set<string>([...idx.lists.keys(), ...(overlay.added ?? []).map((a) => a.parentKey)]);
  for (const listKey of listKeys) {
    lists.set(listKey, applyListEdits(idx.lists.get(listKey) ?? [], listKey, overlay.removed ?? [], overlay.added ?? []));
  }
  for (const [listKey, want] of Object.entries(overlay.order ?? {})) {
    const have = lists.get(listKey);
    if (!have) throw new AuthoredOverlayError(`ordered list "${listKey}" is not in the code payload`);
    if ([...have].sort().join("\u0000") !== [...want].sort().join("\u0000")) {
      throw new AuthoredOverlayError(`ordered list "${listKey}" has keys [${have.join(", ")}], the overlay orders [${want.join(", ")}]`);
    }
    lists.set(listKey, [...want]);
  }

  const addedByKey = new Map<string, BuilderNode>();
  for (const a of overlay.added ?? []) addedByKey.set(childPath(a.parentKey, keyOfAdded(a)), a.node);

  const build = (listKey: string): BuilderNode[] =>
    (lists.get(listKey) ?? []).map((local) => {
      const key = childPath(listKey, local);
      const added = addedByKey.get(key);
      if (added) return clone(added);
      const base = (patched.get(key) ?? clone(idx.nodes.get(key)!)) as Record<string, unknown>;
      const orig = idx.nodes.get(key)!;
      if (hasKids(orig) || lists.has(key)) base.children = build(key);
      return base as unknown as BuilderNode;
    });

  const out: DesignPayload = {
    shellTree: build(rootOf("shellTree")),
    homeTree: build(rootOf("homeTree")),
    ...(C.optionalBlocks ? { optionalBlocks: build(rootOf("optionalBlocks")) } : {}),
    ...(C.tokenDefaults || Object.keys(tok).length > 0 ? { tokenDefaults: sortedRecord(tok) } : {}),
  };
  return JSON.parse(JSON.stringify(out)) as DesignPayload;
}

/** Overlay token defaults as a `key -> value` patch (absent `to` = removed). */
export function overlayTokenPatch(o: Pick<AuthoredOverlayFile, "tokenDefaults"> | null): {
  set: Record<string, string>;
  unset: string[];
} {
  const set: Record<string, string> = {};
  const unset: string[] = [];
  for (const [k, ch] of Object.entries(o?.tokenDefaults ?? {})) {
    if (ch.to === undefined) unset.push(k);
    else set[k] = ch.to;
  }
  return { set, unset };
}
