/**
 * TICKER WORDS FROM HER SERVICES at render time: the pure half.
 *
 * A `marquee` whose `props.source` is `"services"` shows the talent's PUBLISHED
 * offerings, titled for the visitor's language through `offeringText`, instead
 * of the literal `items` baked into the page. Edited, re-cased or retranslated
 * service names therefore follow the profile with no exact-string swap.
 *
 * Rules:
 *  - `custom` or an absent source keeps the literal `items` untouched (every
 *    ticker saved before this field), and those still go through the exact
 *    string swaps in `talent-locale-swaps.ts` exactly as before;
 *  - a `services` ticker for a talent with no published services keeps its
 *    literal `items` as the fallback, so it never runs empty;
 *  - an unknown source value fails CLOSED (reads as `custom`) with a dev-only
 *    warning naming the node;
 *  - pure and identity preserving: a tree with nothing to do comes back `===`.
 * The loader lives in `server/load-ticker-services.server.ts`.
 */
import { offeringText, type TalentOfferingRow } from "@/lib/talent/offerings-types";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

export type TickerSource = "services" | "custom";

/** At most this many service words run in the strip. */
export const TICKER_SERVICE_WORDS_MAX = 12;
const WORD_MAX = 140;

type AnyNode = BuilderNode & { children?: BuilderNode[] };
type Props = Record<string, unknown>;

const propsOf = (n: BuilderNode): Props => (n.props ?? {}) as Props;

/** The source a marquee follows. Unknown values fail closed to `custom`. */
export function tickerSourceOf(node: BuilderNode): TickerSource {
  const source = propsOf(node).source;
  if (source === undefined || source === "custom") return "custom";
  if (source === "services") return "services";
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- dev-only signal for an unknown ticker source
    console.warn(
      `[ticker-services] marquee ${node.id}: unknown source ${JSON.stringify(source)}; showing its own words.`,
    );
  }
  return "custom";
}

/** True when any marquee in the tree follows her services (decides whether to load them). */
export function treeHasServicesTicker(tree: readonly BuilderNode[]): boolean {
  return tree.some((n) => {
    if (n.kind === "marquee" && propsOf(n).source === "services") return true;
    const kids = (n as AnyNode).children;
    return Array.isArray(kids) && treeHasServicesTicker(kids);
  });
}

type WordRow = Pick<TalentOfferingRow, "title" | "title_i18n">;

/**
 * Her published offerings as ticker words in `locale`: `offeringText` walks the
 * visitor's language, the talent's fallback `chain`, then English. Blank titles
 * drop out, repeats (any casing) collapse, and the list is capped.
 */
export function buildTickerServiceWords(
  rows: ReadonlyArray<WordRow>,
  locale: string,
  chain: readonly string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const text = offeringText(
      { title: row.title, title_i18n: row.title_i18n, description: null, description_i18n: null },
      "title",
      locale,
      [...chain, "en"],
    );
    const word = (text ?? "").trim().slice(0, WORD_MAX);
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= TICKER_SERVICE_WORDS_MAX) break;
  }
  return out;
}

type Overlay = Record<string, Record<string, string>>;

/** Drop per-item translation entries (`items.N.text`): the words are replaced, so an index-keyed overlay would overwrite the wrong service. */
function withoutItemOverlay(overlay: unknown): Overlay | undefined {
  if (!overlay || typeof overlay !== "object") return undefined;
  const out: Overlay = {};
  for (const [loc, entries] of Object.entries(overlay as Overlay)) {
    const kept = Object.fromEntries(Object.entries(entries ?? {}).filter(([k]) => !k.startsWith("items.")));
    if (Object.keys(kept).length > 0) out[loc] = kept;
  }
  return out;
}

/** Fill every `services` ticker of the tree with `words`; no words = leave the literal items as the fallback. */
export function applyTalentTickerServices(
  tree: BuilderNode[],
  words: readonly string[],
): BuilderNode[] {
  if (words.length === 0) return tree;
  const visit = (node: BuilderNode): BuilderNode => {
    let next = node;
    if (node.kind === "marquee" && tickerSourceOf(node) === "services") {
      const items = words.map((text) => ({ text }));
      const props: Props = { ...propsOf(node), items };
      if (props.i18n) props.i18n = withoutItemOverlay(props.i18n);
      next = { ...node, props, ...(node.i18n ? { i18n: withoutItemOverlay(node.i18n) } : {}) } as BuilderNode;
    }
    const kids = (node as AnyNode).children;
    if (Array.isArray(kids) && kids.length > 0) {
      const mapped = kids.map(visit);
      if (mapped.some((k, i) => k !== kids[i])) {
        next = { ...next, children: mapped } as BuilderNode;
      }
    }
    return next;
  };
  const mapped = tree.map(visit);
  return mapped.some((n, i) => n !== tree[i]) ? mapped : tree;
}
