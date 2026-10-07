/**
 * TUL-73b: pure guards, draft-vs-published diff, allow-list and runner for the
 * guarded "publish Jorgelina's approved draft home page" script. No app imports
 * and no database client: every read and write goes through the injected `Io`,
 * so the tests drive it with a fake and nothing here can reach production alone.
 *
 * What it publishes (the NARROW path, deliberately not `publishDemoSite`):
 *   talent_pages.blocks_published <- talent_pages.blocks, for the HOME page row
 *   only, compare-and-swap on `updated_at`, then a cache bust.
 * `publishDemoSite` would also publish every other page, copy the shell, flip the
 * site to published, and copy theme tokens with a theme_version bump. None of
 * that is approved here, so none of it runs.
 */

export const ALLOWED_PROFILE_CODE = "TAL-93938";
export const ALLOWED_SITE_SLUG = "book-jorgelina";
/** The QA talent and its site. Never a target. */
export const FORBIDDEN_PROFILE_CODES: readonly string[] = ["TAL-93900"];
export const FORBIDDEN_SITE_SLUGS: readonly string[] = ["jorg-beauty-qa"];

// ---------------------------------------------------------------- types

export type Node = { id?: string; kind?: string; props?: Record<string, unknown>; children?: Node[]; [k: string]: unknown };

export interface PageRow {
  id: string;
  is_home: boolean;
  status: string | null;
  blocks: unknown;
  blocks_published: unknown;
  updated_at: string;
}

export interface Snapshot {
  profile: { id: string; profile_code: string };
  site: {
    id: string;
    site_slug: string | null;
    shell_tree: unknown;
    shell_published: unknown;
    design_tokens_draft: unknown;
    design_tokens: unknown;
  };
  pages: PageRow[];
}

export interface Io {
  /** Read everything publish could touch. `null` when the profile does not exist. */
  load(profileCode: string): Promise<Snapshot | null>;
  /** Compare-and-swap on `updated_at`. Writes ONLY blocks_published, status, published_at, updated_at of the one row. */
  publishHome(input: { pageId: string; expectedUpdatedAt: string; blocks: unknown; now: string }): Promise<{ ok: true; matched: boolean } | { ok: false; error: string }>;
  /** Clear the public page cache. Never throws. */
  bust(input: { talentProfileId: string; profileCode: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Write a JSON backup, return its path. */
  backup(name: string, data: unknown): string;
  log(line: string): void;
  now(): string;
}

export interface Options { profileCode: string; publish: boolean; yes: boolean }
export interface Change { path: string; before: unknown; after: unknown }

export class RefusedError extends Error {}

// ---------------------------------------------------------------- guards

export function parseArgs(argv: readonly string[]): Options {
  let profileCode = ALLOWED_PROFILE_CODE;
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--profile") { profileCode = (argv[++i] ?? "").trim(); continue; }
    if (a.startsWith("--profile=")) { profileCode = a.slice("--profile=".length).trim(); continue; }
    if (a !== "--publish" && a !== "--yes") throw new RefusedError(`unknown argument ${a}`);
    flags.add(a);
  }
  return { profileCode, publish: flags.has("--publish"), yes: flags.has("--yes") };
}

/** Publishing needs BOTH flags; either alone is refused. */
export function assertMode(o: Options): void {
  if (o.yes && !o.publish) throw new RefusedError("--yes without --publish does nothing; refusing");
  if (o.publish && !o.yes) throw new RefusedError("--publish needs --yes as well (dry run is the default)");
}

export function assertProfileCode(code: string): void {
  if (FORBIDDEN_PROFILE_CODES.includes(code)) throw new RefusedError(`refusing ${code}: the QA talent is never a target`);
  if (code !== ALLOWED_PROFILE_CODE) throw new RefusedError(`refusing ${code}: only ${ALLOWED_PROFILE_CODE} is allowed`);
}

export function assertSiteSlug(slug: string | null | undefined): void {
  if (slug && FORBIDDEN_SITE_SLUGS.includes(slug)) throw new RefusedError(`refusing site ${slug}: the QA site is never a target`);
  if (slug !== ALLOWED_SITE_SLUG) throw new RefusedError(`refusing: resolved site slug is ${JSON.stringify(slug)}, expected ${ALLOWED_SITE_SLUG}`);
}

// ---------------------------------------------------------------- flatten + diff

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Leaf paths like `[0].children[1].props.text`. Empty arrays/objects and scalars are leaves. */
export function flatten(value: unknown, prefix = "", out: Map<string, unknown> = new Map()): Map<string, unknown> {
  if (Array.isArray(value) && value.length > 0) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (isObj(value) && Object.keys(value).length > 0) {
    for (const k of Object.keys(value).sort()) flatten(value[k], `${prefix}.${k}`, out);
  } else {
    out.set(prefix, value);
  }
  return out;
}

/** Every leaf that differs between `before` and `after` (a missing leaf is `undefined`). */
export function diffLeaves(before: unknown, after: unknown, scope: string): Change[] {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const out: Change[] = [];
  for (const k of keys) {
    if (!eq(a.get(k), b.get(k))) out.push({ path: `${scope}${k}`, before: a.get(k), after: b.get(k) });
  }
  return out;
}

// ---------------------------------------------------------------- node anchoring

function findPaths(nodes: unknown, pred: (n: Node) => boolean, base = ""): Array<{ path: string; node: Node }> {
  const out: Array<{ path: string; node: Node }> = [];
  if (!Array.isArray(nodes)) return out;
  nodes.forEach((n: Node, i) => {
    const path = `${base}[${i}]`;
    if (n && typeof n === "object") {
      if (pred(n)) out.push({ path, node: n });
      out.push(...findPaths(n.children, pred, `${path}.children`));
    }
  });
  return out;
}

const isH1 = (n: Node) => n.kind === "heading" && (n.props?.level === 1 || n.props?.level === "1");
const isHeroLede = (n: Node) => {
  const p = n.props ?? {};
  return n.kind === "paragraph" && (p.liveText === "hero_tagline" || p.layerLabel === "Hero lede" || p.text === "{{tagline}}");
};
const isMarquee = (n: Node) => n.kind === "marquee";

/**
 * A node is approved only when exactly one match exists in each tree and both
 * sit at the SAME path (same `id` when both carry one). Anything ambiguous
 * yields `null`, so its changes count as unexpected. The lede is matched on the
 * published tree (the approved draft no longer carries `liveText`) and then by
 * kind alone at that path in the draft.
 */
function anchor(published: unknown, draft: unknown, pred: (n: Node) => boolean, draftPred: (n: Node) => boolean = pred): string | null {
  const p = findPaths(published, pred);
  const d = findPaths(draft, draftPred);
  if (p.length !== 1 || d.length !== 1 || p[0]!.path !== d[0]!.path) return null;
  const pid = p[0]!.node.id;
  const did = d[0]!.node.id;
  if (pid !== undefined && did !== undefined && pid !== did) return null;
  return p[0]!.path;
}

export interface Anchors { headline: string | null; lede: string | null; marquee: string | null }

/** The node at a `[0].children[1]...` path, or null. */
function nodeAt(nodes: unknown, path: string): Node | null {
  const idx = [...path.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  let list: unknown = nodes;
  let node: Node | null = null;
  for (const i of idx) {
    if (!Array.isArray(list) || !list[i] || typeof list[i] !== "object") return null;
    node = list[i] as Node;
    list = node.children;
  }
  return node;
}

/**
 * The hero lede: exactly ONE published hero-lede paragraph, and the node at that very
 * path in the draft must be a paragraph with the same id (when both carry one). The
 * draft side is looked up BY PATH, never by "any paragraph" (a page has many).
 */
function ledeAnchor(published: unknown, draft: unknown): string | null {
  const p = findPaths(published, isHeroLede);
  if (p.length !== 1) return null;
  const at = nodeAt(draft, p[0]!.path);
  if (!at || at.kind !== "paragraph") return null;
  if (p[0]!.node.id !== undefined && at.id !== undefined && p[0]!.node.id !== at.id) return null;
  return p[0]!.path;
}

export function findAnchors(published: unknown, draft: unknown): Anchors {
  const lede = ledeAnchor(published, draft);
  return {
    headline: anchor(published, draft, isH1),
    // The draft-side match is by kind only; require it to be the very node found in the published tree.
    lede,
    marquee: anchor(published, draft, isMarquee),
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Is this home-page leaf change (path without the `home:` scope) an approved one? */
export function isApprovedHomeChange(c: Change, a: Anchors): boolean {
  for (const base of [a.headline, a.lede]) {
    if (base === null) continue;
    if (typeof c.after === "string" && [".props.text", ".props.i18n.es.text", ".props.i18n.en.text"].some((s) => c.path === `${base}${s}`)) return true;
    // liveText may only be REMOVED, never set to something else.
    if (c.path === `${base}.props.liveText` && c.after === undefined) return true;
  }
  if (a.marquee !== null) {
    const re = new RegExp(`^${escapeRe(a.marquee)}\\.props\\.items\\[\\d+\\]\\.text$`);
    if (re.test(c.path) && (typeof c.after === "string" || c.after === undefined)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- plan

export interface PublishPlan {
  home: PageRow;
  approved: Change[];
  unexpected: Change[];
}

export function planPublish(s: Snapshot): PublishPlan {
  const homes = s.pages.filter((p) => p.is_home);
  if (homes.length !== 1) throw new RefusedError(`expected exactly 1 home page, found ${homes.length}`);
  const home = homes[0]!;
  if (home.status !== "published") {
    throw new RefusedError(`home page status is ${JSON.stringify(home.status)}, not "published"; this script only refreshes an already-live page`);
  }

  const anchors = findAnchors(home.blocks_published, home.blocks);
  const approved: Change[] = [];
  const unexpected: Change[] = [];
  for (const c of diffLeaves(home.blocks_published, home.blocks, "")) {
    const scoped = { ...c, path: `home:${c.path}` };
    (isApprovedHomeChange(c, anchors) ? approved : unexpected).push(scoped);
  }
  // Everything else a whole-site publish would move. Any difference is unexpected.
  for (const p of s.pages.filter((x) => x !== home)) {
    unexpected.push(...diffLeaves(p.blocks_published, p.blocks, `page(${p.id}):`));
  }
  unexpected.push(...diffLeaves(s.site.shell_published, s.site.shell_tree, "shell:"));
  unexpected.push(...diffLeaves(s.site.design_tokens, s.site.design_tokens_draft, "tokens:"));
  return { home, approved, unexpected };
}

/** What must be identical before and after the publish (all but the home page's published body and timestamps). */
function untouched(s: Snapshot) {
  return {
    site: s.site,
    pages: s.pages.map((p) => (p.is_home ? { id: p.id, is_home: true, blocks: p.blocks, status: p.status } : p)),
  };
}

const show = (v: unknown) => (v === undefined ? "(absent)" : JSON.stringify(v));

// ---------------------------------------------------------------- runner

export interface RunResult { exitCode: number; status: "dry-run" | "no-op" | "published" | "refused" | "failed" }

export async function run(argv: readonly string[], io: Io): Promise<RunResult> {
  const { log } = io;
  let o: Options;
  try {
    o = parseArgs(argv);
    assertMode(o);
    assertProfileCode(o.profileCode);
  } catch (e) {
    if (e instanceof RefusedError) { log(`REFUSED: ${e.message}`); return { exitCode: 2, status: "refused" }; }
    throw e;
  }

  const before = await io.load(o.profileCode);
  if (!before) { log(`REFUSED: profile ${o.profileCode} not found`); return { exitCode: 2, status: "refused" }; }

  let plan: PublishPlan;
  try {
    assertProfileCode(before.profile.profile_code);
    assertSiteSlug(before.site.site_slug);
    plan = planPublish(before);
  } catch (e) {
    if (e instanceof RefusedError) { log(`REFUSED: ${e.message}`); return { exitCode: 2, status: "refused" }; }
    throw e;
  }

  log(`Target: ${before.profile.profile_code} / ${before.site.site_slug} (home page ${plan.home.id})`);
  if (plan.unexpected.length > 0) {
    log(`REFUSED: ${plan.unexpected.length} unexpected difference(s) between draft and published. Nothing is published:`);
    for (const c of plan.unexpected) log(`  ! ${c.path}\n      published: ${show(c.before)}\n      draft:     ${show(c.after)}`);
    return { exitCode: 2, status: "refused" };
  }
  if (plan.approved.length === 0) {
    log("Nothing to publish: the draft home page already equals the published one.");
    return { exitCode: 0, status: "no-op" };
  }

  log(`${plan.approved.length} approved change(s) would go live:`);
  for (const c of plan.approved) log(`  ~ ${c.path}\n      published: ${show(c.before)}\n      draft:     ${show(c.after)}`);
  if (!o.publish) {
    log("DRY RUN: nothing written. Add --publish --yes to publish.");
    return { exitCode: 0, status: "dry-run" };
  }

  const backupPath = io.backup("jorgelina-published-trees", {
    takenAt: io.now(),
    profile_code: before.profile.profile_code,
    site: { id: before.site.id, site_slug: before.site.site_slug, shell_published: before.site.shell_published, design_tokens: before.site.design_tokens },
    pages: before.pages.map((p) => ({ id: p.id, is_home: p.is_home, status: p.status, updated_at: p.updated_at, blocks_published: p.blocks_published })),
  });
  log(`Backup of the PUBLISHED trees: ${backupPath}`);

  const res = await io.publishHome({ pageId: plan.home.id, expectedUpdatedAt: plan.home.updated_at, blocks: plan.home.blocks, now: io.now() });
  if (!res.ok) { log(`FAILED: publish write error: ${res.error}`); return { exitCode: 1, status: "failed" }; }
  if (!res.matched) {
    log("FAILED: the home page was saved by someone while this ran (updated_at moved). Nothing was written. Re-run.");
    return { exitCode: 1, status: "failed" };
  }

  // Verify by re-reading through the same reader.
  const after = await io.load(o.profileCode);
  const problems: string[] = [];
  if (!after) problems.push("could not re-read the profile");
  else {
    const h = after.pages.find((p) => p.id === plan.home.id);
    if (!h) problems.push("home page missing after publish");
    else {
      if (!eq(h.blocks_published, plan.home.blocks)) problems.push("published home does not equal the draft that was read");
      if (!eq(h.blocks, plan.home.blocks)) problems.push("draft home changed during publish");
      for (const c of diffLeaves(h.blocks_published, h.blocks, "home:")) problems.push(`still differs: ${c.path}`);
    }
    if (!eq(untouched(before), untouched(after))) {
      problems.push("something other than the home page's published body changed (site row, other pages, shell or tokens)");
    }
  }
  if (problems.length > 0) {
    log("FAILED VERIFICATION (the write happened; use the backup to roll back if needed):");
    for (const p of problems) log(`  ! ${p}`);
    log(`Backup: ${backupPath}`);
    return { exitCode: 1, status: "failed" };
  }
  log("Verified: published home equals the draft; nothing else changed.");

  const bust = await io.bust({ talentProfileId: before.profile.id, profileCode: before.profile.profile_code });
  if (bust.ok) log("Cache cleared.");
  else log(`WARN: cache not cleared (${bust.error}). The publish stands; the live page refreshes when the cache expires or after a manual revalidate.`);
  return { exitCode: 0, status: "published" };
}
