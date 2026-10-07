/**
 * A demo's page copy, set on the applied design the way a talent edits it in
 * the builder (text, ticker words, photos, facts). Pure: takes the draft
 * trees, returns new ones. Unknown shapes are left untouched.
 */
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";

/** Page copy a demo sets in the builder after the design is applied. */
export type DemoSiteCopy = {
  heroHeading?: string;
  heroEyebrow?: string;
  heroLede?: string;
  /** Proof line under the hero CTAs; `{b}...{/b}` for the bold lead. */
  heroProof?: string;
  ticker?: string[];
  heroInset?: string;
  aboutPhoto?: string;
  menuSubtitle?: string;
  visitExtraFacts?: { label: string; value: string; note?: string }[];
  footerLine?: string;
  brandTagline?: string;
  /** Gridline: node text the design ships empty (spec cells, tasks, spec rows, top bar). */
  gridline?: GridlineSiteCopy;
  /** Folio: wording the design ships neutral (chapter titles, credits, cover line, rates note, closing lines). */
  folio?: FolioSiteCopy;
};

/** Folio page copy: design-owned neutral defaults the demo fills the way a talent would in the builder. */
export type FolioSiteCopy = {
  chapters: Array<{ heading: string; creditLine: string; tocCredit: string }>;
  coverStatement: string;
  ratesSubtitle: string;
  footerCredit: string;
  footerContact: string;
  shoeLabel: { en: string; es: string };
};

/** Gridline page copy: design-owned editable defaults the demo fills the way a talent would in the builder. */
export type GridlineSiteCopy = {
  topBar?: { subtitle?: string; statusOn?: string; statusOff?: string; callLabel?: string };
  alert?: { title: string; safetyLead: string; safety: string; ctaLabel?: string };
  hero?: {
    kicker?: string;
    headline?: string;
    facts?: Array<{ label: string; value: string }>;
    badges?: string[];
    ctas?: [string, string];
  };
  tasks?: {
    title?: string;
    items: Array<{ id: string; label: string; labelEs: string; icon: string; offeringId: string; hint: string; hintEs: string }>;
    defaultOfferingId: string;
    defaultKicker: string;
    defaultKickerEs: string;
    defaultHint: string;
    defaultHintEs: string;
  };
  specTable?: { eyebrow?: string; title?: string; rows: Array<{ label: string; value: string }> };
  services?: { title?: string; subtitle?: string };
};

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

/** One mono badge under the who-card bio (the same card the hero spec kit stamps). */
function badgeNode(text: string, id: string, textId: string): Node {
  return {
    id,
    kind: "card",
    props: {
      variant: "outline",
      style: { radius: "sm", paddingX: "s", paddingY: "s", backgroundColor: styleTokenRef("color.surface-raised") },
    },
    children: [{ id: textId, kind: "paragraph", props: { text, style: { fontSize: "11px", letterSpacing: ".02em", tone: "muted" } } }],
  };
}

/**
 * Gridline: fill the text the design ships empty. Each rule finds its node by
 * kind and the kit's own layer label, so a talent who rearranged the page still
 * gets the copy, and anything it cannot find is left alone.
 */
function gridlineNode(n: Node, ctx: { inHero: boolean }, g: GridlineSiteCopy, newId: () => string): Node {
  const p = n.props ?? {};
  switch (n.kind) {
    case "utility_bar": {
      const t = g.topBar;
      if (!t) return n;
      return withProps(n, {
        ...(t.subtitle ? { subtitle: t.subtitle } : {}),
        ...(t.statusOn ? { statusOnLabel: t.statusOn } : {}),
        ...(t.statusOff ? { statusOffLabel: t.statusOff } : {}),
        ...(t.callLabel ? { callLabel: t.callLabel } : {}),
      });
    }
    case "alert_band": {
      const a = g.alert;
      if (!a) return n;
      return withProps(n, {
        title: a.title,
        safetyLabel: a.safetyLead,
        safetyNote: a.safety,
        ...(a.ctaLabel ? { ctaLabel: a.ctaLabel } : {}),
      });
    }
    case "task_picker": {
      const t = g.tasks;
      if (!t) return n;
      return withProps(n, {
        ...(t.title ? { title: t.title } : {}),
        tasks: t.items.map((x) => ({ ...x })),
        defaultOfferingId: t.defaultOfferingId,
        defaultKicker: t.defaultKicker,
        defaultKickerEs: t.defaultKickerEs,
        defaultHint: t.defaultHint,
        defaultHintEs: t.defaultHintEs,
      });
    }
    case "spec_table": {
      const s = g.specTable;
      if (!s) return n;
      return withProps(n, { ...(s.eyebrow ? { eyebrow: s.eyebrow } : {}), ...(s.title ? { title: s.title } : {}), rows: s.rows.map((r) => ({ ...r })) });
    }
    case "services_catalog": {
      const s = g.services;
      if (!s) return n;
      return withProps(n, { ...(s.title ? { title: s.title } : {}), ...(s.subtitle ? { subtitle: s.subtitle } : {}) });
    }
    case "stats": {
      if (!ctx.inHero || p.variant !== "spec" || !g.hero?.facts) return n;
      return withProps(n, { items: g.hero.facts.map((f) => ({ ...f })) });
    }
    case "heading": {
      if (!ctx.inHero || p.level !== 1 || !g.hero?.headline) return n;
      return withProps(n, { text: g.hero.headline });
    }
    case "container": {
      const label = p.layerLabel;
      const kids = n.children ?? [];
      if (label === "Kicker" && g.hero?.kicker) {
        return { ...n, children: kids.map((k) => (k.kind === "paragraph" ? withProps(k, { text: g.hero!.kicker }) : k)) };
      }
      if (label === "Hero actions" && g.hero?.ctas) {
        const [primary, secondary] = g.hero.ctas;
        const buttons = kids.filter((k) => k.kind === "button");
        return {
          ...n,
          children: kids.map((k) =>
            k === buttons[0]
              ? withProps(k, { label: primary, layerLabel: primary })
              : k === buttons[1]
                ? withProps(k, { label: secondary })
                : k,
          ),
        };
      }
      if (label === "Who text" && g.hero?.badges?.length && !kids.some((k) => k.props?.layerLabel === "Badges")) {
        return {
          ...n,
          children: [
            ...kids,
            {
              id: newId(),
              kind: "container",
              props: { layout: "row", gap: "s", align: "start", layerLabel: "Badges", style: { flexWrap: "wrap" } },
              children: g.hero.badges.map((b) => badgeNode(b, newId(), newId())),
            },
          ],
        };
      }
      return n;
    }
    default:
      return n;
  }
}

/** Folio: put the demo wording back on the nodes the design ships neutral. Matched by anchor / chapter number / kind. */
function folioNode(n: Node, f: FolioSiteCopy): Node {
  const p = n.props ?? {};
  const chapterAt = (anchor: unknown) => {
    const m = typeof anchor === "string" ? /^chapter-(\d+)$/.exec(anchor) : null;
    return m ? f.chapters[Number(m[1]) - 1] : undefined;
  };
  const withChapter = (it: Record<string, unknown>, credit: boolean) => {
    const c = chapterAt(it.anchor ?? (typeof it.href === "string" ? it.href.replace(/^#/, "") : undefined));
    return c ? { ...it, label: c.heading, ...(credit ? { credit: c.tocCredit } : {}) } : it;
  };
  switch (n.kind) {
    case "section": {
      const sp = (p.sectionProps ?? {}) as Record<string, unknown>;
      if (p.sectionTypeKey !== "site_header" || !Array.isArray(sp.navItems)) return n;
      return withProps(n, { sectionProps: { ...sp, navItems: sp.navItems.map((it: Record<string, unknown>) => withChapter(it, false)) } });
    }
    case "masthead":
      return withProps(n, {
        coverStatement: f.coverStatement,
        ...(Array.isArray(p.contents) ? { contents: p.contents.map((it: Record<string, unknown>) => withChapter(it, true)) } : {}),
      });
    case "contents":
      return Array.isArray(p.items) ? withProps(n, { items: p.items.map((it: Record<string, unknown>) => withChapter(it, true)) }) : n;
    case "portfolio": {
      const c = f.chapters[Number(p.chapterNumber) - 1];
      return p.layout === "chapter" && c ? withProps(n, { title: c.heading, creditLine: c.creditLine }) : n;
    }
    case "comp_card":
      return Array.isArray(p.measures)
        ? withProps(n, {
            measures: p.measures.map((m: Record<string, unknown>) =>
              m.fieldKey === "physical.shoe_size_eu" ? { ...m, labelEn: f.shoeLabel.en, labelEs: f.shoeLabel.es } : m,
            ),
          })
        : n;
    case "services_catalog":
      return withProps(n, { subtitle: f.ratesSubtitle });
    case "statement_footer":
      return withProps(n, { creditLine: f.footerCredit, contactLine: f.footerContact });
    default:
      return n;
  }
}

export function applyDemoSiteCopy(
  shell: Node[],
  home: Node[],
  copy: DemoSiteCopy,
  photoUrl: (key: string) => string | null,
  newId: () => string,
): { shell: Node[]; home: Node[] } {
  let eyebrowDone = false;
  const g = copy.gridline;
  const fo = copy.folio;
  const homeOut = map(home, (n, ctx) => {
    if (fo) return folioNode(n, fo);
    if (g) return gridlineNode(n, ctx, g, newId);
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
      // A demo's ticker is its own copy, not the (fictional) talent's services.
      return withProps(n, { items: copy.ticker.map((text) => ({ text })), source: "custom" });
    }
    if (n.kind === "services_catalog" && copy.menuSubtitle) {
      return withProps(n, { subtitle: copy.menuSubtitle });
    }
    if (n.kind === "visit" && copy.visitExtraFacts?.length) {
      return withProps(n, { extraFacts: copy.visitExtraFacts });
    }
    return n;
  });

  const shellBase = fo ? map(shell, (n) => folioNode(n, fo)) : g ? map(shell, (n, ctx) => gridlineNode(n, ctx, g, newId)) : shell;
  const shellOut = shellBase.map((root) => {
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
