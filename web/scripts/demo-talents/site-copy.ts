/**
 * A demo's page copy, set on the applied design the way a talent edits it in
 * the builder (text, ticker words, photos, facts). Pure: takes the draft
 * trees, returns new ones. Unknown shapes are left untouched.
 */
import type { DemoSiteCopy } from "./demos";

type Node = { id: string; kind: string; props?: Record<string, unknown>; children?: Node[] };

function map(nodes: Node[], fn: (n: Node, ctx: { inHero: boolean; inAbout: boolean }) => Node, ctx = { inHero: false, inAbout: false }): Node[] {
  return nodes.map((n) => {
    const anchor = n.props?.anchorId;
    const next = { inHero: ctx.inHero || anchor === "hero", inAbout: ctx.inAbout || anchor === "about" };
    const self = fn(n, next);
    return self.children ? { ...self, children: map(self.children, fn, next) } : self;
  });
}

const withProps = (n: Node, patch: Record<string, unknown>): Node => ({ ...n, props: { ...(n.props ?? {}), ...patch } });

export function applyDemoSiteCopy(
  shell: Node[],
  home: Node[],
  copy: DemoSiteCopy,
  photoUrl: (key: string) => string | null,
  newId: () => string,
): { shell: Node[]; home: Node[] } {
  let eyebrowDone = false;
  const homeOut = map(home, (n, ctx) => {
    const p = n.props ?? {};
    if (ctx.inHero && n.kind === "heading" && p.level === 1 && copy.heroHeading) {
      return withProps(n, { text: copy.heroHeading });
    }
    if (
      ctx.inHero &&
      !eyebrowDone &&
      n.kind === "paragraph" &&
      (p.style as { textTransform?: string } | undefined)?.textTransform === "uppercase" &&
      copy.heroEyebrow
    ) {
      eyebrowDone = true;
      return withProps(n, { text: copy.heroEyebrow });
    }
    if (ctx.inHero && n.kind === "paragraph" && p.layerLabel === "Hero proof") {
      return copy.heroProof ? withProps(n, { text: copy.heroProof }) : n;
    }
    if (
      ctx.inHero &&
      n.kind === "paragraph" &&
      (p.style as { textTransform?: string } | undefined)?.textTransform !== "uppercase" &&
      copy.heroLede
    ) {
      return withProps(n, { text: copy.heroLede });
    }
    if (ctx.inHero && n.kind === "image" && p.layerLabel === "Hero inset" && copy.heroInset) {
      const url = photoUrl(copy.heroInset);
      return url ? withProps(n, { src: url }) : n;
    }
    if (ctx.inAbout && n.kind === "image" && copy.aboutPhoto) {
      const url = photoUrl(copy.aboutPhoto);
      return url ? withProps(n, { src: url }) : n;
    }
    if (n.kind === "marquee" && copy.ticker?.length) {
      return withProps(n, { items: copy.ticker.map((text) => ({ text })) });
    }
    if (n.kind === "services_catalog" && copy.menuSubtitle) {
      return withProps(n, { subtitle: copy.menuSubtitle });
    }
    if (n.kind === "visit" && copy.visitExtraFacts?.length) {
      return withProps(n, { extraFacts: copy.visitExtraFacts });
    }
    return n;
  });

  const shellOut = shell.map((root) => {
    const p = root.props ?? {};
    if (root.kind === "section" && p.sectionTypeKey === "site_header" && copy.brandTagline) {
      const sp = (p.sectionProps ?? {}) as Record<string, unknown>;
      const brand = (sp.brand ?? {}) as Record<string, unknown>;
      return withProps(root, { sectionProps: { ...sp, brand: { ...brand, tagline: copy.brandTagline } } });
    }
    if (p.anchorId === "site-footer" && copy.footerLine && Array.isArray(root.children)) {
      const kids = [...root.children];
      const at = kids.findIndex((k) => k.props?.layerLabel === "Footer line");
      kids.splice(at + 1, 0, {
        id: newId(),
        kind: "paragraph",
        // `.foot p`: 10px under the line (the pill keeps its own 18px).
        props: {
          text: copy.footerLine,
          layerLabel: "Footer place",
          style: { lineHeight: "1.5", marginTopFree: "10px" },
        },
      });
      return { ...root, children: kids };
    }
    return root;
  });
  return { shell: shellOut, home: homeOut };
}
