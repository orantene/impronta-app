/**
 * LIVE TEXT at render time (Maison v2 release 2.7): the pure half.
 *
 * A heading or paragraph with `props.liveText` shows a value computed from the
 * talent's profile in the visitor's locale, instead of the text that was baked
 * into her page when the design was applied. That is how the hero eyebrow
 * ("Nail Artist · Mérida"), the proof line ("9 años de oficio · ★ 4.9 ..."),
 * the headline, the tagline and the footer columns stay true to her profile
 * without a re-apply, on sites applied before the release too.
 *
 * Rules (each one a product decision, see `live-text-keys.ts`):
 *  - a live value replaces the stored text; an empty value keeps the stored text
 *    for the keys that have a sensible fallback (headline, eyebrow, tagline) and
 *    HIDES the node for the rest (proof line, footer lines), so nothing shows a
 *    placeholder and "missing rows and columns simply disappear";
 *  - a footer column whose data is all missing disappears whole;
 *  - SITES APPLIED BEFORE 2.7 carry no `liveText`: the four hero nodes of a
 *    Maison v2 tree are recognised by their design origin key and bound only
 *    while their text is still an untouched seed (`seeds`), so a line she
 *    rewrote is never overruled;
 *  - pure and identity preserving: a tree with nothing to do comes back `===`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  LIVE_TEXT_KEEPS_FALLBACK,
  isLiveTextKey,
  type LiveTextKey,
} from "@/lib/site-admin/builder-node/live-text-keys";

import { readOrigin } from "./theme-releases/origin";

export interface TalentLiveText {
  /** The value per key, already in the visitor's locale. "" / absent = no data. */
  values: Partial<Record<LiveTextKey, string>>;
  /** Stored texts that still mean "the seed" per key (legacy binding only). */
  seeds?: Partial<Record<LiveTextKey, ReadonlyArray<string>>>;
  /** The menu intro line ("Prices in MXN."), a default for a Maison v2 menu that never had one. */
  menuSubtitle?: string;
}

/** Design origin of a Maison v2 node, else null. */
const maisonKey = (node: BuilderNode): string | null => {
  const origin = readOrigin(node);
  return origin?.design === "maison-v2" ? origin.key : null;
};

/**
 * The proof line of a hero whose page never got one: it was left out at apply time while she
 * had no years, languages or reviews (an empty line is dropped then), so nothing was there to
 * fill in the day she added them. Same look as the payload's line.
 */
function proofParagraph(heroId: string): BuilderNode {
  return {
    id: `live-proof-${heroId}`,
    kind: "paragraph",
    props: {
      text: "\u200b",
      liveText: "hero_proof",
      layerLabel: "Hero proof",
      style: { size: "sm", tone: "muted", lineHeight: "1.5", marginTopFree: "16px" },
    },
  } as unknown as BuilderNode;
}

/**
 * Hero lines of a Maison v2 home tree (by design origin key, stable since 2.1) that follow the
 * profile even on a site applied before 2.7: the eyebrow and the proof line, which baked her
 * trade and city (or a location sentence) into the page. The headline and tagline are her
 * copy and only follow her profile once the release puts `liveText` on them (draft, preview,
 * publish): a published hero never changes its big line behind her back.
 */
const LEGACY_HERO_KEYS: Readonly<Record<string, LiveTextKey>> = {
  "hero/container/paragraph": "hero_eyebrow",
  "hero/container/paragraph#3": "hero_proof",
};

/** Columns that disappear whole when none of their live lines has data. */
const HIDE_WHEN_EMPTY_SLOTS: ReadonlySet<string> = new Set(["footer_where"]);

type AnyNode = BuilderNode & { children?: BuilderNode[] };
type Props = Record<string, unknown>;

const propsOf = (n: BuilderNode): Props => (n.props ?? {}) as Props;

/** The stored text of a hero node is an untouched seed (or empty). */
function isSeedText(text: unknown, seeds: ReadonlyArray<string> | undefined): boolean {
  if (typeof text !== "string") return false;
  const t = text.trim();
  return t === "" || t === "​" || (seeds?.some((s) => s.trim() === t) ?? false);
}

/** The live key a node follows, explicit first, else the legacy hero binding. */
export function liveKeyOf(node: BuilderNode, live: TalentLiveText): LiveTextKey | null {
  if (node.kind !== "heading" && node.kind !== "paragraph") return null;
  const props = propsOf(node);
  if (isLiveTextKey(props.liveText)) return props.liveText;
  const origin = readOrigin(node);
  if (!origin || origin.design !== "maison-v2") return null;
  const key = LEGACY_HERO_KEYS[origin.key];
  if (!key) return null;
  // A stamped hero node that is not the expected kind (a talent swapped it) is left alone.
  if (node.kind !== "paragraph") return null;
  return isSeedText(props.text, live.seeds?.[key]) ? key : null;
}

function applyOne(node: BuilderNode, live: TalentLiveText): BuilderNode {
  const value = live.values.hero_proof?.trim() ?? "";
  return { ...node, props: { ...propsOf(node), text: value } } as BuilderNode;
}

/** Resolve every live node of a tree (see the rules above). */
export function applyTalentLiveText(tree: BuilderNode[], live: TalentLiveText): BuilderNode[] {
  const visit = (node: BuilderNode): BuilderNode | null => {
    const key = liveKeyOf(node, live);
    if (key) {
      const value = live.values[key]?.trim() ?? "";
      if (value) {
        const props = propsOf(node);
        if (props.text === value) return node;
        return { ...node, props: { ...props, text: value } } as BuilderNode;
      }
      return LIVE_TEXT_KEEPS_FALLBACK.has(key) ? node : null;
    }
    // A Maison v2 menu with no intro line gets the currency sentence (once she writes one, it is hers).
    if (node.kind === "services_catalog" && live.menuSubtitle && maisonKey(node)?.startsWith("services")) {
      const props = propsOf(node);
      if (typeof props.subtitle !== "string" || props.subtitle.trim() === "") {
        return { ...node, props: { ...props, subtitle: live.menuSubtitle } } as BuilderNode;
      }
    }
    const kids = (node as AnyNode).children;
    if (!Array.isArray(kids) || kids.length === 0) return node;
    const hadFooterLine = kids.some((k) => {
      const k2 = propsOf(k).liveText;
      return typeof k2 === "string" && k2.startsWith("footer_");
    });
    let next = kids.map(visit).filter((k): k is BuilderNode => k !== null);
    // The hero without a proof line: put one under the buttons when she has facts to show.
    if (maisonKey(node) === "hero/container" && live.values.hero_proof?.trim()) {
      const hasProof = next.some((k) => propsOf(k).liveText === "hero_proof");
      const at = next.findIndex((k) => maisonKey(k) === "hero/container/container");
      if (!hasProof && at >= 0) {
        next = [...next.slice(0, at + 1), applyOne(proofParagraph(node.id), live), ...next.slice(at + 1)];
      }
    }
    const unchanged = next.length === kids.length && next.every((k, i) => k === kids[i]);
    if (hadFooterLine) {
      const slot = propsOf(node).slotKey;
      const anyLineLeft = next.some((k) => {
        const k2 = propsOf(k).liveText;
        return typeof k2 === "string" && k2.startsWith("footer_");
      });
      if (!anyLineLeft && typeof slot === "string" && HIDE_WHEN_EMPTY_SLOTS.has(slot)) return null;
    }
    // A wrapper whose columns all went away goes too (an empty row of nothing).
    if (next.length === 0) return null;
    return unchanged ? node : ({ ...node, children: next } as BuilderNode);
  };
  const out = tree.map(visit).filter((n): n is BuilderNode => n !== null);
  const same = out.length === tree.length && out.every((n, i) => n === tree[i]);
  return same ? tree : out;
}

/**
 * True when a tree has a node that MAY follow the profile (explicit `liveText`,
 * or a stamped Maison v2 hero node), so the caller can skip the profile reads
 * for every other design. Ignores seeds: a candidate is enough to load.
 */
export function treeHasLiveCandidates(tree: readonly BuilderNode[]): boolean {
  return tree.some((n) => {
    if (n.kind === "services_catalog" && maisonKey(n)?.startsWith("services")) return true;
    if (maisonKey(n) === "hero/container") return true;
    if (n.kind === "heading" || n.kind === "paragraph") {
      if (isLiveTextKey(propsOf(n).liveText)) return true;
      const origin = readOrigin(n);
      if (origin?.design === "maison-v2" && origin.key in LEGACY_HERO_KEYS) return true;
    }
    const kids = (n as AnyNode).children;
    return Array.isArray(kids) && treeHasLiveCandidates(kids);
  });
}
