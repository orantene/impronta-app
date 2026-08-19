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

import { GOLD } from "../shared";
import {
  IMAGE_SLOT,
  SANS,
  SHELL_FROSTED_STICKY,
  SHELL_HAIRLINE_RGBA,
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
    /** Column heading inside the Divisions mega panel. */
    divisionsGroupHeading: string;
    /** One line per division, shown under its name in the panel. */
    fashionModelsDesc: string;
    hostsPromotersDesc: string;
    performersDesc: string;
    musicDjsDesc: string;
    /** The panel's promo card. */
    featuredTitle: string;
    featuredDesc: string;
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
      divisionsGroupHeading: "By discipline",
      fashionModelsDesc: "Editorial, campaign and runway faces.",
      hostsPromotersDesc: "Event hosts, brand ambassadors, promo teams.",
      performersDesc: "Dancers, aerialists, live acts.",
      musicDjsDesc: "DJs and musicians for venues and private events.",
      featuredTitle: "See the full board",
      featuredDesc:
        "Every face we represent, filterable by discipline and city.",
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
      divisionsGroupHeading: "Por disciplina",
      fashionModelsDesc: "Rostros de editorial, campaña y pasarela.",
      hostsPromotersDesc: "Anfitriones, embajadores de marca y equipos promo.",
      performersDesc: "Bailarines, acróbatas y actos en vivo.",
      musicDjsDesc: "DJs y músicos para venues y eventos privados.",
      featuredTitle: "Ver el directorio completo",
      featuredDesc:
        "Todos los rostros que representamos, con filtros por disciplina y ciudad.",
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

const WIDGET_LAYER_LABELS: Record<(typeof HEADER_WIDGET_KEYS)[number], string> =
  {
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
        ? {
            style: {
              responsive: { mobile: { visibility: "hidden" as const } },
            },
          }
        : {}),
    },
  };
  return embed;
}

/** Hide a node at the mobile tier only (desktop + tablet untouched). */
function hideOnMobile(node: BuilderNode): BuilderNode {
  const props = node.props as { style?: Record<string, unknown> };
  const style = (props.style ?? {}) as Record<string, unknown>;
  const responsive = (style.responsive ?? {}) as Record<string, unknown>;
  const mobile = (responsive.mobile ?? {}) as Record<string, unknown>;
  return {
    ...node,
    props: {
      ...node.props,
      style: {
        ...style,
        responsive: {
          ...responsive,
          mobile: { ...mobile, visibility: "hidden" as const },
        },
      },
    },
  } as BuilderNode;
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
      // Both locales have the division landings now, so the panel is built
      // unconditionally. The locale gate that stood here (DIVISION_PAGES_EXIST_IN)
      // is gone; the seeder's dead-link preflight is what keeps it honest.
      children: [
        {
          id: id("divisions-group"),
          label: copy.divisionsGroupHeading,
          href: "/directory",
          children: [
            {
              id: id("fashion-models"),
              label: copy.fashionModels,
              href: "/p/fashion-models",
              icon: "camera" as const,
              description: copy.fashionModelsDesc,
            },
            {
              id: id("hosts-promoters"),
              label: copy.hostsPromoters,
              href: "/p/hosts-promoters",
              icon: "mic" as const,
              description: copy.hostsPromotersDesc,
            },
            {
              id: id("performers"),
              label: copy.performers,
              href: "/p/performers",
              icon: "sparkle" as const,
              description: copy.performersDesc,
            },
            {
              id: id("music-djs"),
              label: copy.musicDjs,
              href: "/p/music-djs",
              icon: "headphones" as const,
              description: copy.musicDjsDesc,
            },
          ],
        },
      ],
      featured: {
        title: copy.featuredTitle,
        description: copy.featuredDesc,
        href: "/directory",
        imageSrc: IMAGE_SLOT("shell-mega-featured"),
      },
    },
    {
      id: id("for-clients"),
      label: copy.forClients,
      href: "/p/for-clients",
    },
    {
      id: id("about"),
      label: copy.about,
      href: "/p/about",
    },
    {
      id: id("contact"),
      label: copy.contact,
      href: "/p/contact",
    },
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
        // Containers default to a centred 1120px content column. A HEADER must
        // be full-bleed: without this the bar renders as a floating island with
        // ~600px of dead space each side on a wide screen.
        maxWidthFree: "none",
        justifyContent: "space-between",
        gap: "16px",
        paddingTop: "8px",
        paddingBottom: "8px",
        paddingLeft: "max(20px,3vw)",
        paddingRight: "max(20px,3vw)",
        backgroundColor: SHELL_UTILITY_BG,
        boxShadow: shellHairline("bottom"),
        responsive: { mobile: { visibility: "hidden" } },
      },
    },
    children: [
      shellUtilityText(id("utility-copy"), copy.announcement, "Announcement"),
      shellTextLink(
        id("utility-whatsapp"),
        SHELL_WHATSAPP_DISPLAY,
        SHELL_WHATSAPP_HREF,
        {
          fontSize: "11px",
          letterSpacing: "0.12em",
          whiteSpace: "nowrap",
        },
      ),
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
        responsive: { mobile: { height: "26px" } },
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
      collapseAt: "mobile",
      mobileMenuVariant: "drawer-right",
      menuLabel: copy.menuLabel,
      ariaLabel: copy.navAriaLabel,
      // The open drawer is a full-screen surface on phones. Left to the
      // platform default it is a WHITE card, which on this noir site is the
      // most jarring thing a visitor meets. Noir ground + warm ivory text.
      menuBackground: "#0d0b09",
      menuTextColor: SHELL_NAV_TEXT,
      menuBorderColor: SHELL_HAIRLINE_RGBA,
      submenuVariant: "mega",
      megaColumns: 2,
      megaWidth: "anchored",
      accentColor: GOLD,
      // The phone menu was a bare list. It now closes on the burger (which
      // becomes an X), carries the booking CTA where a thumb reaches it, and
      // ends with the social + language rows the curated drawer always had.
      menu: {
        ctaLabel: copy.ctaLabel,
        ctaHref: "/p/contact",
        showSocial: true,
        showLanguageToggle: true,
        density: "comfortable",
      },
      style: {
        fontFamily: SANS,
        fontSize: "13px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textColor: SHELL_NAV_TEXT,
        // "For Clients" was breaking onto two lines and knocking the bar's
        // baseline out of alignment.
        whiteSpace: "nowrap",
        // The nav node ships its own full-width bar CSS (max-width 1120 +
        // space-between) because it is normally THE header. Nested here it must
        // size to its links instead, or it eats the whole row and the actions
        // cluster wraps onto a second line.
        width: "auto",
        maxWidthFree: "none",
        flexGrow: 0,
        flexShrink: 1,
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
      // Containers fall back to a COLUMN at the mobile tier -- sensible for page
      // sections, ruinous for a header bar: the three surviving widgets stacked
      // vertically and made the phone header 141px of three ragged rows. The
      // props-level responsive block (NOT style.responsive) is what picks the
      // mobile layout.
      responsive: { mobile: { layout: "row", align: "center" } },
      style: {
        gap: "10px",
        width: "auto",
        flexGrow: 0,
        flexShrink: 0,
        // Six items in the space the logo and nav leave over: with the default
        // `wrap` they stacked into six rows and made the bar 390px tall.
        flexWrap: "nowrap",
        whiteSpace: "nowrap",
        responsive: { mobile: { order: 2, gap: "8px" } },
      },
    },
    children: [
      ...HEADER_WIDGET_KEYS.map((key) => headerWidgetEmbed(locale, key)),
      hideOnMobile(shellGoldCta(id("cta"), copy.ctaLabel, "/p/contact")),
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
        maxWidthFree: "none",
        justifyContent: "space-between",
        // The bar must NOT wrap: the `nav` node ships its own full-width bar
        // CSS (max-width 1120 + space-between), so as a flex child it claims
        // the whole row and pushes the cluster onto a second line. nowrap +
        // content-sized children keeps logo | nav | actions on one line.
        flexWrap: "nowrap",
        gap: "28px",
        paddingTop: "14px",
        paddingBottom: "14px",
        paddingLeft: "max(20px,3vw)",
        paddingRight: "max(20px,3vw)",
        boxShadow: shellHairline("bottom"),
        responsive: {
          mobile: {
            // NOT cosmetic. `backdrop-filter` makes this bar the containing
            // block for `position: fixed` descendants, which re-anchors the
            // nav's off-canvas drawer to the ~64px bar instead of the screen --
            // the hamburger opened a clipped stub. Frosted glass stays on
            // desktop, where the drawer never opens. See mobile-health.ts
            // ("trapped_drawer") and the caveat in render.tsx.
            backdropFilter: "none",
            gap: "8px",
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
