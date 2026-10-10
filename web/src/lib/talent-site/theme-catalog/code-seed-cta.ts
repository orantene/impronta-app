/**
 * Maison v2 booking CTA seed patch (TUL-88 / TUL-366).
 *
 * Pure: applies the code seed's header + hero booking buttons onto an
 * authored / released payload. Used by Builder Lab's code-seed review path
 * so the change ships draft → demos → talents with no release-theme-patch-cta script.
 *
 * Trees use a loose JSON node shape (DB / seed JSON), not the strict BuilderNode
 * discriminated union — the patch only reads/writes a few props.
 */
import { isDeepStrictEqual } from "node:util";
import type { DesignPayload } from "./types";

export const CTA_ALLOWED_SLUGS = ["maison-v2"] as const;
export type CtaAllowedSlug = (typeof CTA_ALLOWED_SLUGS)[number];
export const BOOK_LABEL = "Book an appointment";
export const BOOK_HREF = "#services";
const OLD_HEADER_LABELS: readonly string[] = ["Menu and prices", BOOK_LABEL];

type Rec = Record<string, unknown>;
/** Loose tree node from seed / authored JSON (not the strict BuilderNode union). */
export type CtaNode = {
  id?: string;
  kind?: string;
  props?: Rec;
  children?: CtaNode[];
  i18n?: unknown;
  [key: string]: unknown;
};
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});

export type SeedTrees = { shellTree: CtaNode[]; homeTree: CtaNode[] };

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

export interface CtaEdit {
  tree: "homeTree" | "shellTree";
  prefix: string;
  what: string;
  before: unknown;
  after: unknown;
}

export interface CtaPatch {
  trees: { shellTree: CtaNode[]; homeTree: CtaNode[] };
  edits: CtaEdit[];
  alreadyDone: boolean;
  refusals: string[];
}

function seedHeroButtons(seed: SeedTrees): CtaNode[] | null {
  let found: CtaNode[] | null = null;
  const walk = (nodes: CtaNode[] | undefined) => {
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
  const buttons = found as CtaNode[] | null;
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

function retargetButton(live: CtaNode, seedButton: CtaNode): CtaNode {
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
  const out: CtaNode = { ...live, props: next };
  if ("i18n" in live) {
    if (sprops.i18n) out.i18n = sprops.i18n;
    else delete out.i18n;
  }
  return out;
}

function patchHero(home: readonly CtaNode[], seed: SeedTrees, edits: CtaEdit[], refusals: string[]): CtaNode[] {
  const sb = seedHeroButtons(seed);
  if (!sb) {
    refusals.push("The code seed has no two-button Hero actions row (wrong seed build?).");
    return [...home];
  }
  let rows = 0;
  const walk = (nodes: readonly CtaNode[], path: string): CtaNode[] =>
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
        const [first, second] = kids as [CtaNode, CtaNode];
        const l1 = rec(first.props).label;
        const l2 = rec(second.props).label;
        const done = l1 === BOOK_LABEL && l2 === "See services";
        if (done) return n;
        if (!(l1 === "See services" && rec(first.props).tone === "primary")) {
          refusals.push(
            `${here}: first hero button is ${JSON.stringify(l1)}, expected the seeded "See services" primary.`,
          );
          return n;
        }
        if (rec(second.props).tone !== "secondary") {
          refusals.push(
            `${here}: second hero button is not the seeded secondary (tone ${JSON.stringify(rec(second.props).tone)}).`,
          );
          return n;
        }
        const nf = retargetButton(first, sb[0]!);
        const ns = retargetButton(second, sb[1]!);
        edits.push(
          {
            tree: "homeTree",
            prefix: `${here}/children[0]`,
            what: "hero primary",
            before: { label: l1, href: rec(first.props).href },
            after: { label: BOOK_LABEL, href: BOOK_HREF },
          },
          {
            tree: "homeTree",
            prefix: `${here}/children[1]`,
            what: "hero secondary",
            before: { label: l2, href: rec(second.props).href },
            after: { label: "See services", href: BOOK_HREF },
          },
        );
        return { ...n, children: [nf, ns] };
      }
      return n.children ? { ...n, children: walk(n.children, `${here}/children`) } : n;
    });
  const out = walk(home, "homeTree");
  if (rows !== 1) refusals.push(`Expected exactly 1 "Hero actions" row in the home tree, found ${rows}.`);
  return out;
}

function patchHeader(shell: readonly CtaNode[], seed: SeedTrees, edits: CtaEdit[], refusals: string[]): CtaNode[] {
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
        sectionProps: {
          ...sp,
          primaryCta: { ...primary, label: BOOK_LABEL, href: BOOK_HREF },
          regions: { ...regions, right: nextRight },
        },
      },
    };
  });
  if (headers !== 1) refusals.push(`Expected exactly 1 site_header in the shell tree, found ${headers}.`);
  return out;
}

/** Pure: patched trees + edits. Never mutates its input. */
export function patchMaisonCtaTrees(
  base: Pick<DesignPayload, "shellTree" | "homeTree"> | SeedTrees,
  seed: SeedTrees,
): CtaPatch {
  const edits: CtaEdit[] = [];
  const refusals: string[] = [];
  const homeIn = (base.homeTree ?? []) as CtaNode[];
  const shellIn = (base.shellTree ?? []) as CtaNode[];
  const homeTree = patchHero(homeIn, seed, edits, refusals);
  const shellTree = patchHeader(shellIn, seed, edits, refusals);
  for (const [name, before, after] of [
    ["homeTree", homeIn, homeTree],
    ["shellTree", shellIn, shellTree],
  ] as const) {
    const prefixes = edits.filter((e) => e.tree === name).map((e) => e.prefix);
    for (const leaf of diffLeaves(before, after, name)) {
      if (!prefixes.some((p) => leaf === p || leaf.startsWith(`${p}/`) || leaf.startsWith(`${p}[`))) {
        refusals.push(`Computed change outside the CTA nodes: ${leaf}`);
      }
    }
  }
  return {
    trees: { shellTree, homeTree },
    edits,
    alreadyDone: edits.length === 0 && refusals.length === 0,
    refusals,
  };
}

/** Seed-patch adapter for `planCodeSeedReviewDraft`. */
export function applyMaisonCtaSeedPatch(
  authored: DesignPayload,
  newCode: DesignPayload,
):
  | { ok: true; payload: DesignPayload; alreadyDone: boolean; summary: string; summaryEs: string }
  | { ok: false; error: string; errorEs: string } {
  const seed: SeedTrees = {
    shellTree: structuredClone(newCode.shellTree ?? []) as CtaNode[],
    homeTree: structuredClone(newCode.homeTree ?? []) as CtaNode[],
  };
  const patch = patchMaisonCtaTrees(authored, seed);
  if (patch.refusals.length > 0) {
    return {
      ok: false,
      error: patch.refusals.join(" · "),
      errorEs: "No se pudo aplicar el CTA de la semilla sobre el borrador autorado.",
    };
  }
  const payload: DesignPayload = {
    ...authored,
    shellTree: patch.trees.shellTree as DesignPayload["shellTree"],
    homeTree: patch.trees.homeTree as DesignPayload["homeTree"],
  };
  return {
    ok: true,
    payload,
    alreadyDone: patch.alreadyDone,
    summary: patch.alreadyDone
      ? "Maison booking CTA already matches the code seed."
      : `Applied Maison booking CTA (${patch.edits.length} edits). Review the draft, then publish demos.`,
    summaryEs: patch.alreadyDone
      ? "El CTA de reserva de Maison ya coincide con la semilla de código."
      : `Se aplicó el CTA de reserva de Maison (${patch.edits.length} cambios). Revisa el borrador y publica en demos.`,
  };
}

export function isCtaAllowedSlug(slug: string): slug is CtaAllowedSlug {
  return (CTA_ALLOWED_SLUGS as readonly string[]).includes(slug);
}
