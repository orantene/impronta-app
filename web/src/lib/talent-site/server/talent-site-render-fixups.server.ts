import "server-only";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { withHeaderLogo } from "@/lib/talent-site/header-logo";
import { withShellBrandName } from "../header-brand-name";
import { loadTalentDisplayName } from "./load-header-brand-name.server";
import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import { localiseSeededDesignLabels, type SiteCtaMode } from "../design-cta-mode";
import { placeMaisonTradeApps, tradesFromTypeLabels } from "../demos/app-placement";
import { applyTalentLiveMedia, treeHasLiveMediaCandidates } from "../live-media";
import { applyTalentLiveText, treeHasLiveCandidates } from "../live-text";
import { loadTalentLiveMedia } from "./load-live-media.server";
import { loadTalentLiveText } from "./load-live-text.server";
import { loadTalentTickerWords } from "./load-ticker-services.server";
import { applyTalentTickerServices, treeHasServicesTicker } from "../ticker-services";
import { loadTalentLocaleSwaps } from "./talent-locale-swaps.server";
import { loadTalentTypeLabels } from "./load-talent-trades.server";

/**
 * Render-time fixups for talent Max sites built from catalog Designs. All are
 * read-only projections of the saved trees, so live sites are fixed without a
 * reapply and anything the talent edited is left alone:
 *  - seeded labels + profile copy (bio, trade, city) in the site locale;
 *  - live text (hero headline, eyebrow, tagline, proof line, footer columns)
 *    read from the profile at render time (`live-text.ts`), also on sites
 *    applied before the release;
 *  - live media (hero photo, inset, about portrait) from current public media
 *    so a wrong apply-time headshot pick heals for every talent;
 *  - Maison v2 trade apps (Nail Designer) after Menu when the talent's types
 *    match (demos already place these; real talents get the same band);
 *  - the site logo in `site_header` (overrides the theme default; replaces a regions wordmark).
 */
export async function prepareTalentSiteTrees(input: {
  talentProfileId: string;
  locale: string;
  logoUrl: string | null | undefined;
  shellTree: BuilderNode[];
  body: BuilderNode[];
  ctaMode?: SiteCtaMode | null;
  /** The talent's fallback chain for `locale` ([visitor, primary, ...]). */
  chain?: readonly string[];
  /** When known, gates trade-app placement; otherwise origin-stamped trees detect Maison v2. */
  designSlug?: string | null;
  /** Last-resort header name when the profile has none. */
  siteSlug?: string | null;
  /** Profile code for guess-map fallback warnings (TUL-369 split). */
  profileCode?: string | null;
}): Promise<{ shellTree: BuilderNode[]; body: BuilderNode[] }> {
  const combined = [...input.shellTree, ...input.body];
  const wantsLive = treeHasLiveCandidates(combined);
  const wantsMedia = treeHasLiveMediaCandidates(combined);
  const wantsTicker = treeHasServicesTicker(combined);
  const [swaps, live, media, typeLabels, tickerWords] = await Promise.all([
    loadTalentLocaleSwaps(input.talentProfileId, input.locale, input.chain ?? []),
    wantsLive
      ? loadTalentLiveText(input.talentProfileId, input.locale, input.chain ?? [])
      : Promise.resolve(null),
    wantsMedia ? loadTalentLiveMedia(input.talentProfileId) : Promise.resolve(null),
    loadTalentTypeLabels(input.talentProfileId),
    wantsTicker
      ? loadTalentTickerWords(input.talentProfileId, input.locale, input.chain ?? [])
      : Promise.resolve([] as string[]),
  ]);
  const withLive = (tree: BuilderNode[]) => {
    let next = live ? applyTalentLiveText(tree, live) : tree;
    if (media) next = applyTalentLiveMedia(next, media);
    // A ticker that follows her services (the default): her published service
    // names in the visitor's language; the literal items are the fallback.
    return applyTalentTickerServices(next, tickerWords);
  };
  const brandName = input.logoUrl ? "" : await loadTalentDisplayName(input.talentProfileId);
  const trades = tradesFromTypeLabels(typeLabels);
  const bodyWithApps = placeMaisonTradeApps(input.body, trades, {
    designSlug: input.designSlug,
  }).tree;
  const localiseCtx = { profileCode: input.profileCode ?? null };
  const shell = withLive(
    localiseSeededDesignLabels(input.shellTree, input.locale, input.ctaMode ?? null, swaps, localiseCtx),
  );
  return {
    shellTree: input.logoUrl
      ? shell.map((n) => withHeaderLogo(n, input.logoUrl!))
      : withShellBrandName(shell, [brandName, input.siteSlug]),
    body: withLive(
      localiseSeededDesignLabels(bodyWithApps, input.locale, input.ctaMode ?? null, swaps, localiseCtx),
    ),
  };
}

const AA = 4.5;

/**
 * Button labels default to white on the Look's accent (theme preset). On a
 * pale accent (Rosé pink) that fails AA, so pick the ink instead. Only the
 * untouched preset pairing is rewritten.
 */
export function readableButtonDefaults<T extends Record<string, unknown> | undefined>(
  componentStyles: T,
  tokens: Readonly<Record<string, string>>,
): T {
  const button = (componentStyles as Record<string, Record<string, unknown>> | undefined)?.button;
  const accent = tokens["color.accent"];
  if (!button || !accent || button.backgroundColor !== "token:color.accent") return componentStyles;
  const fg = typeof button.textColor === "string" ? button.textColor : "#ffffff";
  if (!/^#fff(fff)?$/i.test(fg)) return componentStyles;
  const white = contrastRatio("#ffffff", accent);
  if (white === null || white >= AA) return componentStyles;
  const ink = tokens["color.ink"] ?? "#111111";
  const inkRatio = contrastRatio(ink, accent);
  const textColor = inkRatio !== null && inkRatio >= AA ? ink : "#111111";
  return { ...componentStyles, button: { ...button, textColor } } as T;
}
