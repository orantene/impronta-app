/**
 * LIVE BIO (TUL-230): the About paragraph follows the visitor's language.
 *
 * The bio used to be baked into the page as text when a design was applied
 * (English, from `token-projection.ts`) and swapped by exact match afterwards.
 * A paragraph with `liveText: "bio"` now shows `bio_i18n` for the visitor's
 * locale at render time, like the hero headline and tagline do.
 *
 * Fallback chain: visitor locale, then her fallback chain, then her primary
 * locale, then English, then the base short bio. When the shown text is a
 * DIFFERENT language than the visitor's, a small muted line follows it
 * ("(Text in Spanish)", from `bio-language-hint.ts`).
 *
 * Pure: the loader seam is `server/load-live-text.server.ts`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { bioLanguageHint } from "./bio-language-hint";
import type { LocalizedMapLike } from "./talent-locale-swaps";

export interface LiveBioInput {
  /** `bio_i18n` merged with the drawer's saved `bios` (`effectiveBioI18n`). */
  bioI18n: LocalizedMapLike;
  /** The base short bio of her main language (`short_bio`), the last resort. */
  shortBio?: string | null;
  /** The visitor's locale. */
  locale: string | null | undefined;
  /** Her fallback chain for `locale` ([visitor, primary, ...]). */
  chain?: readonly string[];
  /** Her main language. */
  primary?: string | null;
}

export interface LiveBio {
  /** The bio to show, "" when she has none. */
  text: string;
  /** The "(Text in Spanish)" line, "" when the visitor reads her own language. */
  hint: string;
}

const key = (locale: string | null | undefined): string => (locale ?? "").trim().toLowerCase().slice(0, 2);

export function resolveLiveBio(i: LiveBioInput): LiveBio {
  const visitor = key(i.locale) || "en";
  const chain = [...(i.chain ?? []), ...(i.primary ? [i.primary] : [])];
  for (const code of [visitor, ...chain, "en"]) {
    const text = i.bioI18n?.[key(code)]?.trim() ?? "";
    if (text) return { text, hint: bioLanguageHint(i.bioI18n, visitor, chain) ?? "" };
  }
  return { text: i.shortBio?.trim() ?? "", hint: "" };
}

type Props = Record<string, unknown>;

const isBio = (n: BuilderNode): boolean => n.kind === "paragraph" && (n.props as Props | undefined)?.liveText === "bio";
const hintId = (n: BuilderNode): string => `${n.id}-lang-hint`;

/**
 * Put the language hint under every live bio paragraph of one sibling list.
 * Identity preserving (`===` input) when there is nothing to add; idempotent.
 */
export function withBioHints(nodes: BuilderNode[], hint: string | undefined): BuilderNode[] {
  if (!hint || !nodes.some(isBio)) return nodes;
  const out: BuilderNode[] = [];
  nodes.forEach((n, at) => {
    out.push(n);
    if (!isBio(n) || nodes[at + 1]?.id === hintId(n)) return;
    const style = ((n.props as Props).style ?? {}) as Props;
    out.push({
      id: hintId(n),
      kind: "paragraph",
      props: {
        text: hint,
        layerLabel: "Bio language hint",
        style: { size: "sm", tone: "muted", ...(style.align ? { align: style.align } : {}) },
      },
    } as unknown as BuilderNode);
  });
  return out.length === nodes.length ? nodes : out;
}
