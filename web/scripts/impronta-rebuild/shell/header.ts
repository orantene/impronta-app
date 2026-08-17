/**
 * Impronta freeform SHELL — the site HEADER as BuilderNode children trees
 * (EN + ES), Noir & Or, matching the 13 rebuilt pages.
 *
 * EXPORT CONTRACT: children trees only. The seeder wraps each tree in the
 * `site_header` landmark; nothing here writes to a DB or builds landmarks.
 *
 * Structure (top to bottom):
 *   1. Slim utility row — announcement line + WhatsApp link, hairline bottom
 *      edge. Hidden on mobile (it would crowd a phone bar).
 *   2. Main bar — STICKY frosted glass (translucent noir + blur(18px), the
 *      saas.ts pattern): logo image (IMAGE_SLOT), ONE nav node (the four
 *      divisions grouped under a Divisions dropdown so the top row stays
 *      readable), then the right cluster of live header widgets
 *      (search / favorites / inquiry / account / language) and a gold CTA.
 *
 * Mobile (owner-critical): favorites / inquiry / account widgets are hidden
 * via `style.responsive.mobile.visibility:"hidden"` (there is no `display`
 * style key); search, the language toggle, the CTA and the nav hamburger stay.
 * `responsive.mobile.order` floats the hamburger to the far right on phones.
 *
 * Both trees are built by ONE parameterized builder, so EN and ES are
 * structurally identical by construction (same node count, same kind shape).
 */
import type {
  BuilderNavLink,
  BuilderNode,
  BuilderSectionEmbedNode,
} from "@/lib/site-admin/builder-node/types";
import { createBuilderSectionEmbed } from "@/lib/site-admin/builder-node/section-embed-presets";

import {
  IMAGE_SLOT,
  SANS,
  SHELL_FROSTED_STICKY,
  SHELL_NAV_TEXT,
  SHELL_UTILITY_BG,
  SHELL_WHATSAPP_DISPLAY,
  SHELL_WHATSAPP_HREF,
  shellGoldCta,
  shellHairline,
  shellTextLink,
  shellUtilityText,
} from "./shared-shell";

type ShellLocale = "en" | "es";

// ── locale copy ──────────────────────────────────────────────────────────────

interface HeaderCopy {
  announcement: string;
  logoAlt: string;
  navAriaLabel: string;
  menuLabel: string;
  ctaLabel: string;
  links: {
    home: string;
    divisions: string;
    fashionModels: string;
    hostsPromoters: string;
    performers: string;
    musicDjs: string;
    forClients: string;
    about: string;
    contact: string;
  };
}

const COPY: Record<ShellLocale, HeaderCopy> = {
  en: {
    announcement: "Casting across the Riviera Maya",
    logoAlt: "Impronta Model Management",
    navAriaLabel: "Primary",
    menuLabel: "Menu",
    ctaLabel: "Book Talent",
    links: {
      home: "Home",
      divisions: "Divisions",
      fashionModels: "Fashion Models",
      hostsPromoters: "Hosts & Promoters",
      performers: "Performers",
      musicDjs: "Music & DJs",
      forClients: "For Clients",
      about: "About",
      contact: "Contact",
    },
  },
  es: {
    announcement: "Casting en toda la Riviera Maya",
    logoAlt: "Impronta Model Management",
    navAriaLabel: "Principal",
    menuLabel: "Menú",
    ctaLabel: "Reservar Talento",
    links: {
      home: "Inicio",
      divisions: "Divisiones",
      fashionModels: "Modelos de Moda",
      hostsPromoters: "Anfitriones y Promotores",
      performers: "Performers",
      musicDjs: "Música y DJs",
      forClients: "Para Clientes",
      about: "Nosotros",
      contact: "Contacto",
    },
  },
};

// ── header widget cluster ────────────────────────────────────────────────────

/** The five live header widgets, in bar order. */
const HEADER_WIDGET_KEYS = [
  "header_search",
  "header_favorites",
  "header_inquiry",
  "header_account",
  "header_language",
] as const;

/**
 * Widgets that would crowd a phone bar. Hidden ONLY at the mobile tier —
 * desktop and tablet keep the full cluster.
 */
const MOBILE_HIDDEN_WIDGET_KEYS: ReadonlySet<string> = new Set([
  "header_favorites",
  "header_inquiry",
  "header_account",
]);

const WIDGET_LAYER_LABELS: Record<(typeof HEADER_WIDGET_KEYS)[number], string> = {
  header_search: "Search widget",
  header_favorites: "Favorites widget",
  header_inquiry: "Inquiry widget",
  header_account: "Account widget",
  header_language: "Language toggle",
};

/**
 * A header-widget embed with a DETERMINISTIC id (the factory mints a random
 * one; the shell tree must be byte-stable) and the mobile visibility applied.
 */
function headerWidgetEmbed(
  locale: ShellLocale,
  key: (typeof HEADER_WIDGET_KEYS)[number],
): BuilderNode {
  const node = createBuilderSectionEmbed(key) as BuilderSectionEmbedNode;
  const hiddenOnMobile = MOBILE_HIDDEN_WIDGET_KEYS.has(key);
  const embed: BuilderSectionEmbedNode = {
    ...node,
    id: `shellhdr-${locale}-widget-${key.replace(/_/g, "-")}`,
    props: {
      ...node.props,
      layerLabel: WIDGET_LAYER_LABELS[key],
      ...(hiddenOnMobile
        ? { style: { responsive: { mobile: { visibility: "hidden" as const } } } }
        : {}),
    },
  };
  return embed;
}

// ── tree builder ─────────────────────────────────────────────────────────────

function navLinks(locale: ShellLocale): BuilderNavLink[] {
  const copy = COPY[locale].links;
  const id = (slug: string): string => `shellhdr-${locale}-nav-${slug}`;
  return [
    { id: id("home"), label: copy.home, href: "/" },
    {
      id: id("divisions"),
      label: copy.divisions,
      href: "/directory",
      children: [
        { id: id("fashion-models"), label: copy.fashionModels, href: "/p/fashion-models" },
        { id: id("hosts-promoters"), label: copy.hostsPromoters, href: "/p/hosts-promoters" },
        { id: id("performers"), label: copy.performers, href: "/p/performers" },
        { id: id("music-djs"), label: copy.musicDjs, href: "/p/music-djs" },
      ],
    },
    { id: id("for-clients"), label: copy.forClients, href: "/p/for-clients" },
    { id: id("about"), label: copy.about, href: "/p/about" },
    { id: id("contact"), label: copy.contact, href: "/p/contact" },
  ];
}

function buildHeaderTree(locale: ShellLocale): BuilderNode[] {
  const copy = COPY[locale];
  const id = (suffix: string): string => `shellhdr-${locale}-${suffix}`;

  // 1 — slim announcement / utility row (hidden on mobile).
  const utilityRow: BuilderNode = {
    id: id("utility-row"),
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      layerLabel: "Announcement row",
      style: {
        width: "100%",
        justifyContent: "space-between",
        gap: "16px",
        paddingTop: "8px",
        paddingBottom: "8px",
        paddingLeft: "24px",
        paddingRight: "24px",
        backgroundColor: SHELL_UTILITY_BG,
        boxShadow: shellHairline("bottom"),
        responsive: { mobile: { visibility: "hidden" } },
      },
    },
    children: [
      shellUtilityText(id("utility-copy"), copy.announcement, "Announcement"),
      shellTextLink(id("utility-whatsapp"), SHELL_WHATSAPP_DISPLAY, SHELL_WHATSAPP_HREF, {
        fontSize: "11px",
        letterSpacing: "0.12em",
        whiteSpace: "nowrap",
      }),
    ],
  };

  // 2 — logo (image slot; the seeder resolves slot:// to the uploaded asset).
  const logo: BuilderNode = {
    id: id("logo"),
    kind: "image",
    props: {
      src: IMAGE_SLOT("shell-logo"),
      alt: copy.logoAlt,
      priority: true,
      layerLabel: "Logo",
      style: {
        height: "40px",
        width: "auto",
        objectFit: "contain",
        flexShrink: 0,
        responsive: { mobile: { height: "32px" } },
      },
    },
  };

  // 3 — the ONE nav node. Divisions grouped as a one-level dropdown so the top
  // row stays readable next to the widget cluster.
  const nav: BuilderNode = {
    id: id("nav"),
    kind: "nav",
    props: {
      links: navLinks(locale),
      submenuVariant: "dropdown",
      collapseAt: "mobile",
      mobileMenuVariant: "drawer-right",
      menuLabel: copy.menuLabel,
      ariaLabel: copy.navAriaLabel,
      style: {
        fontFamily: SANS,
        fontSize: "13px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textColor: SHELL_NAV_TEXT,
        // Phones: the hamburger reads best at the far edge, after the widgets.
        responsive: { mobile: { order: 3 } },
      },
    },
  };

  // 4 — right cluster: five live header widgets, then the gold CTA.
  const rightCluster: BuilderNode = {
    id: id("actions"),
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      layerLabel: "Header actions",
      style: {
        gap: "10px",
        flexShrink: 0,
        responsive: { mobile: { order: 2, gap: "8px" } },
      },
    },
    children: [
      ...HEADER_WIDGET_KEYS.map((key) => headerWidgetEmbed(locale, key)),
      shellGoldCta(id("cta"), copy.ctaLabel, "/p/contact"),
    ],
  };

  // 5 — main bar: sticky frosted glass (the saas.ts glassmorphism pattern).
  const mainBar: BuilderNode = {
    id: id("main-bar"),
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      layerLabel: "Header bar",
      responsive: { mobile: { layout: "row", align: "center" } },
      style: {
        ...SHELL_FROSTED_STICKY,
        width: "100%",
        justifyContent: "space-between",
        gap: "28px",
        paddingTop: "14px",
        paddingBottom: "14px",
        paddingLeft: "24px",
        paddingRight: "24px",
        boxShadow: shellHairline("bottom"),
        responsive: {
          mobile: {
            gap: "12px",
            paddingLeft: "16px",
            paddingRight: "16px",
            paddingTop: "10px",
            paddingBottom: "10px",
          },
        },
      },
    },
    children: [logo, nav, rightCluster],
  };

  return [utilityRow, mainBar];
}

// ── export ───────────────────────────────────────────────────────────────────

export const improntaHeaderTree: { en: BuilderNode[]; es: BuilderNode[] } = {
  en: buildHeaderTree("en"),
  es: buildHeaderTree("es"),
};
