/**
 * Maison Design payload (PR 2 / W9–W16) — real builder `shellTree` + `homeTree`.
 *
 * Ports the profile-template composition into catalog Design nodes so Free
 * talents edit one page in the page builder. Profile template at `/t/<code>`
 * stays untouched. Visual pixel match vs prototype is gated on owner PDF /
 * prototype uploads (see evidence/maison-website/pr2).
 *
 * Kit slots only (validateDesign): hero · about · services · gallery · contact.
 * FAQ accordion lives inside contact and binds to `talent_faq_items` at render.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { SERVICES_CATALOG_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/services-catalog-defaults";
import { CONTACT_LAYER, TALENT_ASK_HREF } from "@/lib/talent-site/contact-channels";
import type { DesignPayload } from "../types";
import {
  aboutBlock,
  buildKitShell,
  defaultIdFactory,
  galleryBlock,
  heroSplit,
  stampKitSection,
  type KitIdFactory,
} from "../section-kit";
import { MAISON_SEED } from "./seed";

function makeSeqIdFactory(prefix: string): KitIdFactory {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

function deferCopyrightYear(node: BuilderNode): BuilderNode {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const isCopyright = props.layerLabel === "Copyright" && typeof props.text === "string";
  return {
    ...node,
    props: isCopyright
      ? { ...props, text: (props.text as string).replace(/©\s*\d{4}\b/, "© {{year}}") }
      : props,
    ...(children ? { children: children.map(deferCopyrightYear) } : {}),
  } as BuilderNode;
}

/** Services band: real `services_catalog` with prices shown (owner ruling #5). */
function maisonServicesBlock(makeId: KitIdFactory): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("services", {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Menu",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
      // Phone-first: stack padding already; catalog owns its own 390 layout.
      responsive: { mobile: { layout: "stack" } },
    }),
    children: [
      {
        id: makeId(),
        kind: "services_catalog",
        props: {
          ...SERVICES_CATALOG_DEFAULT_PROPS,
          layout: "rows",
          categoryNav: "tabs",
          eyebrow: "The menu",
          title: "Services {i}and prices{/i}",
          showPrice: true,
          showDuration: true,
          showPhoto: true,
          showStats: true,
          mobileBar: "float",
          useWebsiteTheme: true,
          showAskLink: true,
          emptyMessage: "No services are published yet.",
        },
      } as BuilderNode,
    ],
  } as BuilderNode;
}

/**
 * Contact band: how-to-book copy + FAQ accordion bound to `talent_faq_items`
 * + inquire CTA. Phone stacks via responsive.
 */
function maisonContactBlock(makeId: KitIdFactory): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("contact", {
      layout: "stack",
      gap: "l",
      align: "stretch",
      layerLabel: "Visit & FAQ",
      style: {
        maxWidth: "wide",
        paddingY: "l",
        paddingX: "m",
        marginTop: "m",
        marginBottom: "l",
      },
      responsive: { mobile: { layout: "stack" } },
    }),
    children: [
      {
        id: makeId(),
        kind: "reveal",
        props: { effect: "rise", once: true, layerLabel: "How to book" },
        children: [
          {
            id: makeId(),
            kind: "heading",
            props: {
              text: "How booking works",
              level: 2,
              style: { size: "lg" },
            },
          },
          {
            id: makeId(),
            kind: "paragraph",
            props: {
              text: "{{contactCopy}}",
              style: { tone: "muted", size: "md" },
            },
          },
        ],
      } as BuilderNode,
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: "Questions",
          level: 2,
          style: { size: "lg" },
          layerLabel: "FAQ heading",
        },
      },
      {
        id: makeId(),
        kind: "accordion",
        props: {
          allowMultiple: true,
          layerLabel: "FAQ",
          // Bound at render from published `talent_faq_items` (A6 / W16).
          bindSource: "talent_faq_items",
        },
        children: [],
      } as BuilderNode,
      {
        id: makeId(),
        kind: "button",
        props: {
          label: CONTACT_LAYER.ask,
          href: TALENT_ASK_HREF,
          tone: "primary",
          layerLabel: CONTACT_LAYER.ask,
          style: { marginTop: "m" },
        },
      } as BuilderNode,
    ],
  } as BuilderNode;
}

function maisonAboutBlock(makeId: KitIdFactory): BuilderNode {
  const base = aboutBlock(makeId, { align: "start", accent: true });
  // Wrap copy in reveal for scroll presence (W11 architecture; visual sign-off separate).
  const children = "children" in base && Array.isArray(base.children) ? base.children : [];
  return {
    ...base,
    children: [
      {
        id: makeId(),
        kind: "reveal",
        props: { effect: "fade", once: true, layerLabel: "About reveal" },
        children,
      } as BuilderNode,
    ],
  } as BuilderNode;
}

/**
 * Deterministic Maison Design payload. Calling twice returns byte-identical
 * trees so `syncBuiltinTalentThemes` hashing stays stable.
 */
export function buildMaisonDesignPayload(): DesignPayload {
  const makeId = makeSeqIdFactory("maison-design");
  const shellTree = buildKitShell(makeId, {
    displayName: "{{displayName}}",
    year: "{{year}}",
    headerAlign: "space-between",
    headerPaddingY: "m",
    headerRule: true,
  }).map(deferCopyrightYear);

  const homeTree: BuilderNode[] = [
    heroSplit(makeId, {
      ratio: "40-60",
      chips: true,
      accent: true,
      eyebrow: true,
      minHeight: "72vh",
    }),
    maisonAboutBlock(makeId),
    maisonServicesBlock(makeId),
    galleryBlock(makeId, {
      mode: "grid",
      columns: 3,
      heading: "Recent work",
    }),
    maisonContactBlock(makeId),
  ];

  return { shellTree, homeTree };
}

/** Section order claimed by the seed — mapped onto kit slots. */
export const MAISON_DESIGN_SECTION_ORDER = [
  ...MAISON_SEED.theme.sections_default_order,
] as const;
