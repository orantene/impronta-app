/**
 * Maison v2 demo style transforms (pure): the demo's distinct look built from
 * editable settings only (palette, fonts, section variants, order). Used by the
 * demo pipeline (`server/demo-pipeline.server.ts`) and the theme-release
 * "Publish to demos" merge. Moved out of scripts/demo-talents/apply-theme-demos.mts.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { cssFamilyForGoogleFont, getGoogleFontMeta } from "@/lib/site-admin/builder-node/fonts-catalog";
import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import { galleryPaletteLookTokens } from "./gallery-meta";
import {
  MAISON_V2_SECTION_LABELS,
  type MaisonV2DemoStyle,
  type ThemeDemoMediaRef,
} from "./theme-demos";

// ── Style transforms (pure; builder nodes only, every value editable) ────────

type Props = Record<string, unknown>;
const propsOf = (n: BuilderNode) => (n.props ?? {}) as Props;
const kidsOf = (n: BuilderNode): BuilderNode[] =>
  "children" in n && Array.isArray(n.children) ? (n.children as BuilderNode[]) : [];
const styleOf = (n: BuilderNode) => (propsOf(n).style as Props | undefined) ?? {};
const withProps = (n: BuilderNode, patch: Props, kids?: BuilderNode[]): BuilderNode =>
  ({ ...n, props: { ...propsOf(n), ...patch }, ...(kids ? { children: kids } : {}) }) as BuilderNode;
const mapTree = (n: BuilderNode, f: (n: BuilderNode) => BuilderNode): BuilderNode => {
  const kids = kidsOf(n);
  const next = kids.length ? withProps(n, {}, kids.map((k) => mapTree(k, f))) : n;
  return f(next);
};
const label = (n: BuilderNode) => propsOf(n).layerLabel as string | undefined;

export type MediaUrls = { card: string | null; hero: string | null; gallery: string[] };

function mediaUrl(media: MediaUrls, ref: ThemeDemoMediaRef, code: string): string {
  const u = ref.kind === "card" ? media.card : media.gallery[ref.index];
  if (!u) throw new Error(`${code}: no ${ref.kind === "card" ? "card" : `gallery #${ref.index}`} photo`);
  return u;
}

function styleHero(hero: BuilderNode, style: MaisonV2DemoStyle, media: MediaUrls, code: string): BuilderNode {
  const [a, b] = style.hero.columns.split(/\s+/);
  const left = style.hero.media === "left";
  const photo = style.hero.photo ? mediaUrl(media, style.hero.photo, code) : null;
  const inset = style.hero.inset ? mediaUrl(media, style.hero.inset, code) : null;
  const inner = mapTree(hero, (n) => {
    if (n.kind === "image" && label(n) === "Hero photo" && photo) return withProps(n, { src: photo });
    if (n.kind === "image" && label(n) === "Hero inset") {
      const { right: _r, left: _l, ...rest } = styleOf(n);
      void _r;
      void _l;
      return withProps(n, {
        ...(inset ? { src: inset, alt: "" } : {}),
        style: { ...rest, ...(left ? { left: "-26px" } : { right: "-26px" }) },
      });
    }
    return n;
  });
  const kids = kidsOf(inner);
  const media0 = kids.findIndex((k) => label(k) === "Hero media");
  const copy = kids.filter((_, i) => i !== media0);
  const ordered = media0 < 0 ? kids : left ? [kids[media0]!, ...copy] : [...copy, kids[media0]!];
  return withProps(
    inner,
    { style: { ...styleOf(inner), gridTemplateColumns: left ? `${b} ${a}` : `${a} ${b}` } },
    ordered,
  );
}

function styleWork(work: BuilderNode, style: MaisonV2DemoStyle): BuilderNode {
  const kids = kidsOf(work)
    .filter((k) => style.ticker || k.kind !== "marquee")
    .map((k) =>
      k.kind === "portfolio"
        ? withProps(k, {
            layout: style.portfolio.layout,
            columns: style.portfolio.columns,
            limit: style.portfolio.columns === 4 ? 8 : 6,
          })
        : k,
    );
  return withProps(work, {}, kids);
}

function styleMenu(menu: BuilderNode, style: MaisonV2DemoStyle): BuilderNode {
  return mapTree(menu, (n) =>
    n.kind === "services_catalog"
      ? withProps(n, {
          showPhoto: style.menu.thumbnails,
          stylePreset: style.menu.thumbnails ? "image_led" : "clean",
          categoryNav: style.menu.categoryNav,
          columns: style.menu.columns,
        })
      : n,
  );
}

function styleAbout(about: BuilderNode, media: MediaUrls): BuilderNode {
  // The about portrait shows the talent at work in her space (her hero shot).
  if (!media.hero) return about;
  return mapTree(about, (n) => (n.kind === "image" && label(n) === "About portrait" ? withProps(n, { src: media.hero }) : n));
}

function styleFooter(node: BuilderNode, style: MaisonV2DemoStyle): BuilderNode {
  if (propsOf(node).slotKey !== "footer" || node.kind !== "container") return node;
  const tone =
    style.footer === "ink"
      ? { backgroundColor: "token:color.ink", textColor: "token:color.background" }
      : { backgroundColor: "token:color.surface-raised", textColor: "token:color.ink" };
  return withProps(node, { style: { ...styleOf(node), ...tone } });
}

export function styleTrees(
  built: { shellTree: BuilderNode[]; homeTree: BuilderNode[] },
  style: MaisonV2DemoStyle,
  media: MediaUrls,
  code: string,
): { shellTree: BuilderNode[]; homeTree: BuilderNode[] } {
  const byLabel = new Map(built.homeTree.map((n) => [label(n) ?? "", n]));
  const hero = byLabel.get("Hero");
  if (!hero) throw new Error(`${code}: design tree has no Hero`);
  const wanted = new Set(Object.values(MAISON_V2_SECTION_LABELS));
  const ordered = style.order.map((key) => {
    const n = byLabel.get(MAISON_V2_SECTION_LABELS[key]);
    if (!n) throw new Error(`${code}: design tree has no ${MAISON_V2_SECTION_LABELS[key]}`);
    if (key === "work") return styleWork(n, style);
    if (key === "menu") return styleMenu(n, style);
    if (key === "about" && style.hero.photo) return styleAbout(n, media);
    return n;
  });
  if (new Set(style.order).size !== wanted.size) throw new Error(`${code}: order must list all six sections once`);
  const rest = built.homeTree.filter((n) => n !== hero && !wanted.has(label(n) ?? ""));
  return {
    shellTree: built.shellTree.map((n) => styleFooter(n, style)),
    homeTree: [styleHero(hero, style, media, code), ...ordered, ...rest],
  };
}

function fontFamily(name: string): string {
  const meta = getGoogleFontMeta(name);
  if (!meta) throw new Error(`font ${name} is not in the Google Fonts catalogue`);
  return cssFamilyForGoogleFont(meta);
}

/** Look tokens (colours + fonts) and the custom_palette row value. */
export function styleLook(style: MaisonV2DemoStyle, paletteKey: string, code: string) {
  const c = style.customPalette;
  const colours: Record<string, string> = c
    ? {
        "color.background": c.page,
        "color.surface-raised": c.section,
        "color.line": c.line,
        "color.ink": c.text,
        "color.muted": c.muted,
        "color.primary": c.accent,
        "color.primary-on": c.onAccent,
        "color.accent": c.accent,
        "color.blush": c.tint,
      }
    : (galleryPaletteLookTokens("maison-v2", paletteKey) ?? {});
  if (!colours["color.background"]) throw new Error(`${code}: no palette ${paletteKey}`);
  // Custom palettes only: the built-in gallery palettes are the design's own.
  for (const [fg, bg, min] of !c ? [] : [
    ["color.ink", "color.background", 4.5],
    ["color.primary-on", "color.primary", 4.5],
    ["color.muted", "color.background", 4.5],
  ] as const) {
    const r = contrastRatio(colours[fg]!, colours[bg]!);
    if (r === null || r < min) throw new Error(`${code}: ${fg} on ${bg} contrast ${r?.toFixed(2)} < ${min}`);
  }
  const look = {
    ...colours,
    "typography.heading-font-family": fontFamily(style.fonts.heading),
    "typography.body-font-family": fontFamily(style.fonts.body),
  };
  const customPalette = c
    ? {
        name: c.name,
        fields: { page: c.page, text: c.text, accent: c.accent, section: c.section },
        derived: { rule: c.line, on_accent: c.onAccent },
      }
    : null;
  return { look, customPalette, lookSlug: c ? null : paletteKey };
}
