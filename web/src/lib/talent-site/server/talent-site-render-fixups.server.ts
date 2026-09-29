import "server-only";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import { localiseSeededDesignLabels, type SiteCtaMode } from "../design-label-locale";
import { loadTalentLocaleSwaps } from "./talent-locale-swaps.server";

/**
 * Render-time fixups for talent Max sites built from catalog Designs. All are
 * read-only projections of the saved trees, so live sites are fixed without a
 * reapply and anything the talent edited is left alone:
 *  - seeded labels + profile copy (bio, trade, city) in the site locale;
 *  - the site logo in a `site_header` that has none (it was dropped by apply).
 */
export async function prepareTalentSiteTrees(input: {
  talentProfileId: string;
  locale: string;
  logoUrl: string | null | undefined;
  shellTree: BuilderNode[];
  body: BuilderNode[];
  ctaMode?: SiteCtaMode | null;
}): Promise<{ shellTree: BuilderNode[]; body: BuilderNode[] }> {
  const swaps = await loadTalentLocaleSwaps(input.talentProfileId, input.locale);
  const shell = localiseSeededDesignLabels(input.shellTree, input.locale, input.ctaMode ?? null, swaps);
  return {
    shellTree: input.logoUrl ? shell.map((n) => withHeaderLogo(n, input.logoUrl!)) : shell,
    body: localiseSeededDesignLabels(input.body, input.locale, input.ctaMode ?? null, swaps),
  };
}

function withHeaderLogo(node: BuilderNode, logoUrl: string): BuilderNode {
  const props = node.props as Record<string, unknown>;
  if (node.kind !== "section" || props.sectionTypeKey !== "site_header") return node;
  const sp = (props.sectionProps ?? {}) as Record<string, unknown>;
  const brand = (sp.brand ?? {}) as Record<string, unknown>;
  if (typeof brand.logoUrl === "string" && brand.logoUrl.trim()) return node;
  return {
    ...node,
    props: {
      ...props,
      sectionProps: {
        ...sp,
        brand: { ...brand, logoUrl },
        brandDisplay: sp.brandDisplay === "text" || !sp.brandDisplay ? "image-and-text" : sp.brandDisplay,
      },
    },
  } as unknown as BuilderNode;
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
