/**
 * Pure planning + orchestration for scripts/release-theme-patch-cta.mts
 * (ticket #88).
 *
 * Maison v2's code seed now leads with a booking button in the header and the
 * hero. Existing sites only get a seed change through a NEW theme version, and
 * the live Maison v2 version is DB-authored, so this patches the open draft in
 * exactly two places and releases it through Builder Lab's own functions:
 *
 *   1. home tree: the "Hero actions" row. Primary button -> "Book an appointment"
 *      (mode-dependent label, `#book`), the old secondary becomes
 *      "See services" (ghost, `#services`, own es/en overlay).
 *   2. shell tree: the site_header cta item (and `primaryCta`) -> the same
 *      booking label/href; a cta item is added from the code seed when absent.
 *
 * The draft must equal the released version (ignoring `props.designKey`), OR
 * differ from it only by ADDITIVE i18n (an overlay saved by
 * release-theme-i18n-overlay.mts, which cannot publish on its own because i18n
 * is not design-owned). In that case the patch is computed against the draft
 * trees so the overlay is preserved, and the one published version carries both.
 * The computed change must touch nothing outside those nodes. Nothing here
 * touches a database: every effect goes through the injected `CtaPorts`.
 *
 * Exit codes: 0 ok, 1 error, 2 REFUSED (a guard fired, nothing unsafe done).
 */
import { isDeepStrictEqual } from "node:util";

import {
  isI18nOnlyAdditive,
  parseArgs,
  type Args,
  type DraftInfo,
  type PayloadLike,
  type Ports,
  type Released,
  type ReleaseRow,
  type TNode,
} from "./release-theme-i18n-plan";

export const CTA_ALLOWED_SLUGS = ["maison-v2"] as const;
export const BOOK_LABEL = "Book an appointment";
export const BOOK_HREF = "#book";
/** Secondary hero CTA scrolls to the catalog; never opens the booking sheet. */
export const SERVICES_HREF = "#services";
/** What the header cta says in the Maison v2 versions released before this change. */
const OLD_HEADER_LABELS: readonly string[] = ["Menu and prices", BOOK_LABEL];

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});

/** The seed tree pair the patch is built from (the code seed's payload). */
export type SeedTrees = { shellTree: TNode[]; homeTree: TNode[] };

/** The ports this script needs: Builder Lab's, minus the i18n lookup, plus the code seed. */
export type CtaPorts = Omit<Ports, "lookup"> & { seed(): SeedTrees };

// ── Comparison ───────────────────────────────────────────────────────────────
/** Drops `props.designKey` (an open Triage ticket: it drifts between draft and release). */
export function stripDesignKey<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripDesignKey) as unknown as T;
  if (value && typeof value === "object") {
    const out: Rec = {};
    for (const [k, v] of Object.entries(value as Rec)) {
      if (k === "props" && v && typeof v === "object" && !Array.isArray(v)) {
        const { designKey: _dk, ...rest } = v as Rec;
        void _dk;
        out[k] = stripDesignKey(rest);
      } else out[k] = stripDesignKey(v);
    }
    return out as T;
  }
  return value;
}

/** Leaf paths where two JSON values differ. */
export function diffLeaves(a: unknown, b: unknown, path = ""): string[] {
  if (isDeepStrictEqual(a, b)) return [];
  const ao = a && typeof a === "object";
  const bo = b && typeof b === "object";
  if (!ao || !bo || Array.isArray(a) !== Array.isArray(b)) return [path || "(root)"];
  const keys = new Set([...Object.keys(a as Rec), ...Object.keys(b as Rec)]);
  const out: string[] = [];
  for (const k of keys) {
    const sub = Array.isArray(a) ? `${path}[${k}]` : `${path}/${k}`;
    out.push(...diffLeaves((a as Rec)[k], (b as Rec)[k], sub));
  }
  return out;
}

// ── Patches ──────────────────────────────────────────────────────────────────
export interface Edit {
  tree: "homeTree" | "shellTree";
  /** Index path of the touched node/item; every diff leaf must live under one of these. */
  prefix: string;
  what: string;
  before: unknown;
  after: unknown;
}

function seedHeroButtons(seed: SeedTrees): TNode[] | null {
  let found: TNode[] | null = null;
  const walk = (nodes: TNode[] | undefined) => {
    for (const n of nodes ?? []) {
      if (n.kind === "container" && rec(n.props).layerLabel === "Hero actions") {
        found = (n.children ?? []).filter((c) => c.kind === "button");
        return;
      }
      walk(n.children);
      if (found) return;
    }
  };
  walk(seed.homeTree);
  const buttons = found as TNode[] | null;
  if (!buttons || buttons.length !== 2) return null;
  return buttons;
}

function seedHeaderCta(seed: SeedTrees): Rec | null {
  for (const n of seed.shellTree) {
    if (n.kind !== "section" || rec(n.props).sectionTypeKey !== "site_header") continue;
    const right = rec(rec(rec(n.props).sectionProps).regions).right;
    const cta = Array.isArray(right) ? right.find((i) => rec(i).type === "cta") : null;
    return cta ? (cta as Rec) : null;
  }
  return null;
}

/** Overwrite a live button from the seed's, keeping its id, style and any other prop. */
function retargetButton(live: TNode, seedButton: TNode): TNode {
  const props = rec(live.props);
  const sprops = rec(seedButton.props);
  const { label: _l, href: _h, tone: _t, layerLabel: _ll, i18n: _i, ...keep } = props;
  void [_l, _h, _t, _ll, _i];
  const next: Rec = {
    ...keep,
    label: sprops.label,
    href: sprops.href,
    tone: sprops.tone,
    layerLabel: sprops.layerLabel,
    ...(sprops.i18n ? { i18n: sprops.i18n } : {}),
  };
  const out: TNode = { ...live, props: next };
  // The app-placement mirror: keep it in step when the live node carries one.
  if ("i18n" in live) {
    if (sprops.i18n) out.i18n = sprops.i18n;
    else delete out.i18n;
  }
  return out;
}

export interface CtaPatch {
  trees: { shellTree: TNode[]; homeTree: TNode[] };
  edits: Edit[];
  /** Nothing left to change (already patched). */
  alreadyDone: boolean;
  refusals: string[];
}

function patchHero(home: readonly TNode[], seed: SeedTrees, edits: Edit[], refusals: string[]): TNode[] {
  const sb = seedHeroButtons(seed);
  if (!sb) {
    refusals.push("The code seed has no two-button Hero actions row (wrong seed build?).");
    return [...home];
  }
  let rows = 0;
  const walk = (nodes: readonly TNode[], path: string): TNode[] =>
    nodes.map((n, i) => {
      const here = `${path}[${i}]`;
      if (n.kind === "container" && rec(n.props).layerLabel === "Hero actions") {
        rows += 1;
        const kids = n.children ?? [];
        const buttons = kids.filter((c) => c.kind === "button");
        if (kids.length !== 2 || buttons.length !== 2) {
          refusals.push(`${here}: Hero actions must hold exactly 2 buttons, found ${kids.length} children.`);
          return n;
        }
        const [first, second] = kids as [TNode, TNode];
        const l1 = rec(first.props).label;
        const l2 = rec(second.props).label;
        const done =
          l1 === BOOK_LABEL &&
          rec(first.props).href === BOOK_HREF &&
          l2 === "See services" &&
          rec(second.props).href === SERVICES_HREF;
        if (done) return n;
        // Already the booking label but still on `#services` (pre-TUL-516) → retarget hrefs.
        const needsHrefOnly =
          l1 === BOOK_LABEL && l2 === "See services" && rec(first.props).href !== BOOK_HREF;
        if (!needsHrefOnly && !(l1 === "See services" && rec(first.props).tone === "primary")) {
          refusals.push(`${here}: first hero button is ${JSON.stringify(l1)}, expected the seeded "See services" primary.`);
          return n;
        }
        if (rec(second.props).tone !== "secondary") {
          refusals.push(`${here}: second hero button is not the seeded secondary (tone ${JSON.stringify(rec(second.props).tone)}).`);
          return n;
        }
        const nf = retargetButton(first, sb[0]);
        const ns = retargetButton(second, sb[1]);
        edits.push(
          { tree: "homeTree", prefix: `${here}/children[0]`, what: "hero primary", before: { label: l1, href: rec(first.props).href }, after: { label: BOOK_LABEL, href: BOOK_HREF } },
          { tree: "homeTree", prefix: `${here}/children[1]`, what: "hero secondary", before: { label: l2, href: rec(second.props).href }, after: { label: "See services", href: SERVICES_HREF } },
        );
        return { ...n, children: [nf, ns] };
      }
      return n.children ? { ...n, children: walk(n.children, `${here}/children`) } : n;
    });
  const out = walk(home, "homeTree");
  if (rows !== 1) refusals.push(`Expected exactly 1 "Hero actions" row in the home tree, found ${rows}.`);
  return out;
}

function patchHeader(shell: readonly TNode[], seed: SeedTrees, edits: Edit[], refusals: string[]): TNode[] {
  const seedCta = seedHeaderCta(seed);
  if (!seedCta) {
    refusals.push("The code seed header has no cta item (wrong seed build?).");
    return [...shell];
  }
  let headers = 0;
  const out = shell.map((n, i) => {
    const here = `shellTree[${i}]`;
    const props = rec(n.props);
    if (n.kind !== "section" || props.sectionTypeKey !== "site_header") return n;
    headers += 1;
    const sp = rec(props.sectionProps);
    const regions = rec(sp.regions);
    const right = Array.isArray(regions.right) ? (regions.right as unknown[]) : null;
    if (!right) {
      refusals.push(`${here}: header has no right region to hold the CTA.`);
      return n;
    }
    const idx = right.findIndex((it) => rec(it).type === "cta");
    const primary = rec(sp.primaryCta);
    const nextRight = [...right];
    if (idx >= 0) {
      const cur = rec(right[idx]);
      if (typeof cur.label === "string" && !OLD_HEADER_LABELS.includes(cur.label)) {
        refusals.push(`${here}: header cta says ${JSON.stringify(cur.label)} (an edited label); not overwriting it.`);
        return n;
      }
      if (cur.label === BOOK_LABEL && cur.href === BOOK_HREF && primary.label === BOOK_LABEL) return n;
      nextRight[idx] = { ...cur, label: BOOK_LABEL, href: BOOK_HREF };
    } else {
      nextRight.push({ ...seedCta });
    }
    edits.push({
      tree: "shellTree",
      prefix: `${here}/props/sectionProps`,
      what: idx >= 0 ? "header cta item + primaryCta" : "header cta item added + primaryCta",
      before: { cta: idx >= 0 ? rec(right[idx]).label : null, primaryCta: primary.label ?? null },
      after: { cta: BOOK_LABEL, primaryCta: BOOK_LABEL },
    });
    return {
      ...n,
      props: {
        ...props,
        sectionProps: { ...sp, primaryCta: { ...primary, label: BOOK_LABEL, href: BOOK_HREF }, regions: { ...regions, right: nextRight } },
      },
    };
  });
  if (headers !== 1) refusals.push(`Expected exactly 1 site_header in the shell tree, found ${headers}.`);
  return out;
}

/** Pure: the patched trees + the edits made. Never mutates its input. */
export function patchTrees(base: PayloadLike, seed: SeedTrees): CtaPatch {
  const edits: Edit[] = [];
  const refusals: string[] = [];
  const homeTree = patchHero(base.homeTree ?? [], seed, edits, refusals);
  const shellTree = patchHeader(base.shellTree ?? [], seed, edits, refusals);
  // The change must live ONLY under the nodes we edited.
  for (const [name, before, after] of [
    ["homeTree", base.homeTree ?? [], homeTree],
    ["shellTree", base.shellTree ?? [], shellTree],
  ] as const) {
    const prefixes = edits.filter((e) => e.tree === name).map((e) => e.prefix);
    for (const leaf of diffLeaves(before, after, name)) {
      // Leaf and prefix paths share one format: tree[i]/children[i]/props/...
      if (!prefixes.some((p) => leaf === p || leaf.startsWith(`${p}/`) || leaf.startsWith(`${p}[`))) {
        refusals.push(`Computed change outside the CTA nodes: ${leaf}`);
      }
    }
  }
  return { trees: { shellTree, homeTree }, edits, alreadyDone: edits.length === 0 && refusals.length === 0, refusals };
}

// ── Plan ─────────────────────────────────────────────────────────────────────
export interface CtaPlan {
  slug: string;
  releasedVersion: number | null;
  draft: { rev: number; updatedAt: string; updatedBy: string | null; baseVersion: number } | null;
  willOpenDraft: boolean;
  /** The open draft differs from the released version, and only by added i18n (modulo designKey). */
  draftDiffersByAdditiveI18nOnly: boolean;
  patch: CtaPatch;
  refusals: string[];
}

export function planCta(slug: string, released: Released | null, draft: DraftInfo | null, seed: SeedTrees): CtaPlan {
  const refusals: string[] = [];
  if (!(CTA_ALLOWED_SLUGS as readonly string[]).includes(slug)) {
    refusals.push(`"${slug}" is not on the allow-list (${CTA_ALLOWED_SLUGS.join(", ")}).`);
  }
  if (!released) refusals.push("No released version found for this design.");
  let i18nOnly = false;
  if (draft && released) {
    const d = stripDesignKey(draft.payload);
    const r = stripDesignKey(released.payload);
    if (!isDeepStrictEqual(d, r)) {
      i18nOnly = isI18nOnlyAdditive(r, d);
      // A rerun: the CTA is already saved on the draft, so it equals released + CTA patch (+ additive i18n).
      const ctaApplied = (): boolean => {
        const want = stripDesignKey({ ...released.payload, ...patchTrees(released.payload as PayloadLike, seed).trees });
        return isDeepStrictEqual(d, want) || isI18nOnlyAdditive(want, d);
      };
      if (!i18nOnly && !ctaApplied()) {
        refusals.push(
          `Open draft (rev ${draft.rev}, updated ${draft.updatedAt} by ${draft.updatedBy ?? "unknown"}, base v${draft.baseVersion}) ` +
            `differs from released v${released.version} by more than props.designKey and additive i18n. Release or discard it first.`,
        );
      }
    }
  }
  const base = (draft?.payload ?? released?.payload ?? {}) as PayloadLike;
  const patch = patchTrees(base, seed);
  refusals.push(...patch.refusals);
  return {
    slug,
    releasedVersion: released?.version ?? null,
    draft: draft ? { rev: draft.rev, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy, baseVersion: draft.baseVersion } : null,
    willOpenDraft: !draft,
    draftDiffersByAdditiveI18nOnly: i18nOnly,
    patch,
    refusals,
  };
}

export function printCtaPlan(p: CtaPlan, log: (l: string) => void): void {
  log(`\n=== ${p.slug} ===`);
  log(`released version: ${p.releasedVersion === null ? "none found" : `v${p.releasedVersion}`}`);
  log(
    p.draft
      ? `open draft: yes, rev ${p.draft.rev}, base v${p.draft.baseVersion}, last change ${p.draft.updatedAt} by ${p.draft.updatedBy ?? "unknown"}`
      : "open draft: none (apply would open one from the released version)",
  );
  log(`open draft differs from released by additive i18n only: ${p.draftDiffersByAdditiveI18nOnly ? "yes" : "no"}`);
  log(`edits (CTA nodes only): ${p.patch.edits.length}`);
  for (const e of p.patch.edits) {
    log(`  ${e.prefix} [${e.what}]\n    - ${JSON.stringify(e.before)}\n    + ${JSON.stringify(e.after)}`);
  }
  if (p.patch.alreadyDone) log("already patched: nothing to do.");
  for (const r of p.refusals) log(`REFUSED: ${r}`);
  log(
    p.refusals.length
      ? "next step: none, fix the refusal first."
      : `next step (--apply --yes --design ${p.slug}): ${p.willOpenDraft ? "open draft, " : "layer on the open draft, "}saveThemeDraftTree (changed trees), previewThemeDraftPublish, publishAndUpdateDemos (demos only).`,
  );
}

// ── Orchestration ────────────────────────────────────────────────────────────
function checkArgs(args: Args, log: (l: string) => void): number | null {
  if (args.designs.length !== 1) {
    log(`REFUSED: pass exactly one --design (${CTA_ALLOWED_SLUGS.join(", ")}).`);
    return 2;
  }
  if (!(CTA_ALLOWED_SLUGS as readonly string[]).includes(args.designs[0])) {
    log(`REFUSED: unknown design slug ${args.designs[0]}. Allowed: ${CTA_ALLOWED_SLUGS.join(", ")}.`);
    return 2;
  }
  if (args.includeOpenDraft.length > 0) {
    log("REFUSED: --include-open-draft is not supported here; the draft must equal the released version (or differ by additive i18n only).");
    return 2;
  }
  if (args.apply && !args.yes) {
    log("REFUSED: --apply needs --yes.");
    return 2;
  }
  if (args.releaseToTalents && !args.apply) {
    log("REFUSED: --release-to-talents needs --apply --yes.");
    return 2;
  }
  return null;
}

export { parseArgs };

/** Returns the process exit code. */
export async function run(args: Args, ports: CtaPorts): Promise<number> {
  const log = ports.log;
  const bad = checkArgs(args, log);
  if (bad !== null) return bad;
  const slug = args.designs[0];
  const seed = ports.seed();

  if (!args.apply) {
    const [released, draft] = await Promise.all([ports.loadReleased(slug), ports.loadDraft(slug)]);
    const plan = planCta(slug, released, draft, seed);
    printCtaPlan(plan, log);
    log("\nDRY RUN: nothing was written.");
    return plan.refusals.length ? 2 : 0;
  }

  const actor = args.actor ? { id: args.actor, label: "--actor override" } : await ports.findActor();
  if (!actor) {
    log("REFUSED: no platform admin (profiles.app_role = super_admin) found; pass --actor <uuid>.");
    return 2;
  }
  log(`actor: ${actor.id} (${actor.label})`);
  if (args.releaseToTalents) return releaseToTalents(slug, args, ports);

  const released = await ports.loadReleased(slug);
  const readDraft = await ports.loadDraft(slug);
  let plan = planCta(slug, released, readDraft, seed);
  printCtaPlan(plan, log);
  if (plan.refusals.length) return 2;
  if (plan.patch.alreadyDone) {
    log("Nothing to patch. No release created.");
    return 0;
  }

  let draft = readDraft;
  if (!draft) {
    const opened = await ports.openDraft(slug, actor.id);
    if (!opened.ok) {
      log(`ERROR opening draft: ${opened.error}`);
      return 1;
    }
    draft = opened.value;
    plan = planCta(slug, released, draft, seed);
    if (plan.refusals.length) {
      plan.refusals.forEach((r) => log(`REFUSED: ${r}`));
      log("The freshly opened draft is left open; discard it in Builder Lab if unwanted.");
      return 2;
    }
  }

  // CAS: the rev we read must still be the rev in the database right before the write.
  let rev = draft.rev;
  const check = await ports.loadDraft(slug);
  if (!check || check.rev !== rev) {
    log(`REFUSED: draft rev changed between read (${rev}) and write (${check?.rev ?? "gone"}). Nothing written.`);
    return 2;
  }
  let saved: DraftInfo = draft;
  const changed = (["shell", "home"] as const).filter((t) => plan.patch.edits.some((e) => e.tree === `${t}Tree`));
  for (const t of changed) {
    const r = await ports.saveTree({ design: slug, tree: t, nodes: plan.patch.trees[`${t}Tree`], expectedRev: rev, actorId: actor.id });
    if (!r.ok) {
      const stale = r.code === "stale_rev";
      log(`${stale ? "REFUSED" : "ERROR"}: saveThemeDraftTree(${t}) failed: ${r.error}. Publish was not attempted.`);
      return stale ? 2 : 1;
    }
    saved = r.value;
    rev = saved.rev;
  }
  const want = { shell: stripDesignKey(plan.patch.trees.shellTree), home: stripDesignKey(plan.patch.trees.homeTree) };
  const got = { shell: stripDesignKey(saved.payload.shellTree ?? []), home: stripDesignKey(saved.payload.homeTree ?? []) };
  if (!isDeepStrictEqual(want, got)) {
    log("REFUSED: the saved draft differs from the computed patch. Not publishing; the draft is left open for review.");
    return 2;
  }
  log(`draft saved, rev ${rev}.`);

  const pv = await ports.preview(slug);
  if (!pv.ok) {
    log(`ERROR previewThemeDraftPublish: ${pv.error}`);
    return 1;
  }
  log(`preview: next version v${pv.value.nextVersion}, ${pv.value.itemCount} release item(s).`);
  log(`  notes en: ${pv.value.notes.en}`);
  log(`  notes es: ${pv.value.notes.es}`);

  const pub = await ports.publishDemos({ design: slug, expectedRev: rev, actorId: actor.id });
  if (!pub.ok) {
    log(`ERROR publishAndUpdateDemos: ${pub.error}${pub.releaseId ? ` (release ${pub.releaseId}, v${pub.version ?? "?"}; fix it on its Builder Lab page)` : ""}`);
    return 1;
  }
  const v = pub.value;
  log(`PUBLISHED ${slug} v${v.version}, release id ${v.releaseId}, demos updated: ${v.demosApplied}.`);
  if (v.version !== pv.value.nextVersion) log(`note: the RPC chose v${v.version}, the preview said v${pv.value.nextVersion}.`);
  v.warnings.forEach((w) => log(`warning: ${w}`));
  log("Channel is now `demos`. Talents are NOT touched. Check a demo site at 390 and 1280, then:");
  log(`  npm run qa:release-theme-cta -- --release-to-talents --apply --yes --design ${slug} --rollout <1-100>`);
  return 0;
}

function failedDemoSites(report: unknown): number | null {
  const s = (report as { summary?: { errors?: number; demos?: { errors?: number } } } | null)?.summary;
  if (!s) return null;
  return (s.errors ?? 0) + (s.demos?.errors ?? 0);
}

async function releaseToTalents(slug: string, args: Args, ports: CtaPorts): Promise<number> {
  const log = ports.log;
  const release: ReleaseRow | null = await ports.findRelease(slug);
  if (!release) {
    log("REFUSED: no release found for this design.");
    return 2;
  }
  log(`release ${release.id}: v${release.to_version}, channel ${release.channel}, status ${release.status}, rollout ${release.rollout_pct}%`);
  if (release.channel !== "demos" || release.status !== "published") {
    log("REFUSED: the release must be published on `demos` first (run --apply without --release-to-talents).");
    return 2;
  }
  const failed = failedDemoSites(release.dry_run_report);
  if (failed === null) {
    log("REFUSED: no dry run report on the release.");
    return 2;
  }
  if (failed > 0) {
    log(`REFUSED: ${failed} site(s) failed the dry run. Fix in Builder Lab first.`);
    return 2;
  }
  if (release.rollout_pct <= 0) {
    if (args.rollout === null) {
      log("REFUSED: rollout is 0%. Pass --rollout <1-100> (Builder Lab requires it before opening to talents).");
      return 2;
    }
    const s = await ports.setRollout(release, args.rollout);
    if (!s.ok) {
      log(`ERROR setting rollout: ${s.error}`);
      return 1;
    }
    release.rollout_pct = args.rollout;
  }
  const res = await ports.openToTalents(release);
  if (!res.ok) {
    log(`REFUSED by the release manager: ${res.error}`);
    return 2;
  }
  log(`OPENED to talents (optin): updates ${res.value.updates}, bells ${res.value.bells}, demos ${res.value.demosApplied}.`);
  res.value.warnings.forEach((w) => log(`warning: ${w}`));
  log("Not done here: Make default (catalog flip). Per-site upgrade is the separate runner.");
  return 0;
}
