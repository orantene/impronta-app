/**
 * Shared pieces of the theme collection Designs (ids, standard shell, the
 * services band, contact + FAQ, hero heading tuning). Split out of
 * `designs.ts` so each Design can live in its own module.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { SERVICES_CATALOG_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/services-catalog-defaults";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { buildKitStandardShell, faqBlock, stampKitSection, type KitIdFactory } from "../section-kit";

export function seqIds(prefix: string): KitIdFactory {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

function deferYear(node: BuilderNode): BuilderNode {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const isCopyright = props.layerLabel === "Copyright" && typeof props.text === "string";
  return {
    ...node,
    props: isCopyright
      ? { ...props, text: (props.text as string).replace(/©\s*\d{4}\b/, "© {{year}}") }
      : props,
    ...(children ? { children: children.map(deferYear) } : {}),
  } as BuilderNode;
}

/**
 * Every Design wears the standard talent header (`site_header`): logo when
 * the site has one, nav, ES/EN switch and the primary CTA, with the platform's
 * own mobile menu. The bare kit header dropped all of these.
 */
export function shell(
  makeId: KitIdFactory,
  opts: {
    navChrome?: import("@/lib/site-admin/nav-chrome").NavChromeStyle;
    navLinks?: ReadonlyArray<{ label: string; href: string }>;
  } = {},
) {
  return buildKitStandardShell(makeId, {
    displayName: "{{displayName}}",
    year: "{{year}}",
    ...(opts.navChrome ? { navChrome: opts.navChrome } : {}),
    ...(opts.navLinks ? { navLinks: opts.navLinks } : {}),
  }).map(deferYear);
}

export type CatalogOpts = {
  label: string;
  eyebrow: string;
  title: string;
  layout: "rows" | "cards" | "grid" | "compact_list" | "rate_card" | "editorial" | "featured";
  categoryNav: "pills" | "tabs" | "rail" | "jump_strip" | "sections" | "accordion" | "none";
  stylePreset: "clean" | "editorial" | "compact" | "image_led";
  photoRadius: "square" | "soft" | "round";
  density: "comfortable" | "compact";
  rowCtaVariant: "outline" | "solid";
  showPhoto: boolean;
  showDescription?: boolean;
  showDelivery?: boolean;
  columns?: 1 | 2 | 3;
  search?: boolean;
  band?: boolean;
  subtitle?: string;
};

export function servicesSection(makeId: KitIdFactory, o: CatalogOpts): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("services", {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: o.label,
      style: {
        maxWidth: "wide",
        paddingY: "l",
        paddingX: "m",
        ...(o.band ? { backgroundColor: styleTokenRef("color.surface-raised") } : {}),
      },
      responsive: { mobile: { layout: "stack" } },
    }),
    children: [
      {
        id: makeId(),
        kind: "services_catalog",
        props: {
          ...SERVICES_CATALOG_DEFAULT_PROPS,
          layout: o.layout,
          categoryNav: o.categoryNav,
          eyebrow: o.eyebrow,
          title: o.title,
          ...(o.subtitle ? { subtitle: o.subtitle } : {}),
          stylePreset: o.stylePreset,
          photoRadius: o.photoRadius,
          density: o.density,
          rowCtaVariant: o.rowCtaVariant,
          showPrice: true,
          showDuration: true,
          showPhoto: o.showPhoto,
          showStats: false,
          ...(o.showDescription !== undefined ? { showDescription: o.showDescription } : {}),
          ...(o.showDelivery !== undefined ? { showDelivery: o.showDelivery } : {}),
          ...(o.columns ? { columns: o.columns } : {}),
          ...(o.search ? { enableCatalogSearch: true } : {}),
          mobileBar: "float",
          useWebsiteTheme: true,
          showAskLink: true,
          emptyMessage: "No services are published yet.",
        },
      } as BuilderNode,
    ],
  } as BuilderNode;
}

/** Contact + FAQ bound to `talent_faq_items`, like Maison, with per-design copy. */
export function contactSection(
  makeId: KitIdFactory,
  o: { heading: string; faqHeading: string; center?: boolean; band?: boolean },
): BuilderNode {
  // Shared FAQ preset stamps contact; keep a short lead heading for Designs
  // that still want an Ask + FAQ band in one slot.
  const base = faqBlock(makeId, {
    heading: o.faqHeading,
    center: o.center,
    band: o.band,
    ask: true,
  });
  const kids = "children" in base && Array.isArray(base.children) ? base.children : [];
  return {
    ...base,
    props: {
      ...(base.props as Record<string, unknown>),
      layerLabel: "Contact & FAQ",
    },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: o.heading,
          level: 2,
          style: { size: "xl", ...(o.center ? { align: "center" } : {}) },
        },
      },
      ...kids,
    ],
  } as BuilderNode;
}

/** Retune the kit hero's name heading (size / spacing / case) without a new node kind. */
export function tuneHeading(node: BuilderNode, style: Record<string, unknown>): BuilderNode {
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const props = (node.props ?? {}) as Record<string, unknown>;
  const text = typeof props.text === "string" ? props.text : "";
  const isName =
    node.kind === "heading" &&
    (text === "{{displayName}}" || text.includes("{{displayName}}"));
  return {
    ...node,
    props: isName ? { ...props, style: { ...((props.style as object) ?? {}), ...style } } : props,
    ...(children ? { children: children.map((c) => tuneHeading(c, style)) } : {}),
  } as BuilderNode;
}
