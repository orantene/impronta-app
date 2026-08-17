/**
 * Impronta freeform shell — FOOTER helpers (workstream: shell footer).
 *
 * Scope note: this module belongs to the footer lane ONLY. The header lane
 * owns `shared-shell.ts` / `header.ts`; nothing here may be moved there (and
 * nothing here imports from there) so the two lanes cannot collide.
 *
 * Design language is Noir & Or, identical to the 13 live pages: every colour
 * and font is a `token:` sentinel from `../shared.ts` (INK / GOLD / SERIF...)
 * which the renderer resolves to a CSS var WITH the token's literal fallback.
 * Authoring rule carried over from the shipped shell variants
 * (`shell-variant-trees.ts`): EVERY LINK IS ITS OWN NODE, so an operator can
 * select and edit a single footer link on canvas instead of one opaque nav.
 */
import type {
  BuilderNode,
  BuilderNodeStyle,
  BuilderSocialPlatform,
} from "@/lib/site-admin/builder-node/types";
import type { BuilderIconName } from "@/lib/site-admin/builder-node/icon-registry";

import {
  GOLD,
  GOLD_BRIGHT,
  HAIRLINE,
  IMAGE_SLOT,
  INK,
  MUTED,
  SANS,
  SERIF,
  TEXT,
} from "../shared";

// ── shared footer contact facts (owner-supplied; never invent others) ────────

export const FOOTER_WHATSAPP_HREF = "https://wa.me/529843170816";
export const FOOTER_WHATSAPP_DISPLAY = "+52 984 317 0816";
export const FOOTER_EMAIL = "impronta.talento@gmail.com";
export const FOOTER_EMAIL_HREF = `mailto:${FOOTER_EMAIL}`;
export const FOOTER_INSTAGRAM_HREF = "https://www.instagram.com/impronta_models";
export const FOOTER_TIKTOK_HREF = "https://www.tiktok.com/@impronta12";

export const FOOTER_LOGO_SLOT = "shell-footer-logo";

// ── locale-parameterised copy model ──────────────────────────────────────────

export interface FooterLinkCopy {
  label: string;
  href: string;
}

export interface FooterCopy {
  /** Locale tag used only for node-id prefixes ("en" / "es"). */
  locale: string;
  logoAlt: string;
  tagline: string;
  exploreHeading: string;
  explore: ReadonlyArray<FooterLinkCopy>;
  divisionsHeading: string;
  divisions: ReadonlyArray<FooterLinkCopy>;
  forTalentHeading: string;
  forTalent: ReadonlyArray<FooterLinkCopy>;
  socialAriaLabel: string;
  copyright: string;
  legal: ReadonlyArray<FooterLinkCopy>;
}

// ── node builders ────────────────────────────────────────────────────────────

/** Uppercase gold column heading (mirrors the pages' eyebrow treatment). */
export function footerColumnHeading(id: string, text: string): BuilderNode {
  return {
    id,
    kind: "paragraph",
    props: {
      text,
      layerLabel: "Column heading",
      style: {
        fontFamily: SERIF,
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        textColor: GOLD,
        align: "left",
        marginTopFree: "0px",
        marginBottomFree: "4px",
      },
    },
  };
}

/**
 * A plain-text footer link: a `button` node with the chip stripped away, so it
 * stays a first-class, individually selectable node on canvas.
 */
export function footerLink(
  id: string,
  label: string,
  href: string,
  extra: BuilderNodeStyle = {},
): BuilderNode {
  return {
    id,
    kind: "button",
    props: {
      label,
      href,
      tone: "secondary",
      layerLabel: label,
      style: {
        backgroundColor: "rgba(0,0,0,0)",
        borderWidth: "0px",
        borderRadius: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px",
        paddingRight: "0px",
        fontFamily: SANS,
        fontSize: "14px",
        fontWeight: 400,
        lineHeight: "1.4",
        textColor: MUTED,
        align: "left",
        transitionProperty: "color",
        transitionDuration: "200ms",
        transitionTimingFunction: "ease",
        hover: { color: GOLD_BRIGHT },
        ...extra,
      },
    },
  };
}

/** A stacked link column: heading over individual link nodes. */
export function footerLinkColumn(
  idPrefix: string,
  heading: string,
  links: ReadonlyArray<FooterLinkCopy>,
): BuilderNode {
  return {
    id: `${idPrefix}-col`,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: `${heading} column`,
      style: { gap: "14px", minWidth: "0px" },
    },
    children: [
      footerColumnHeading(`${idPrefix}-heading`, heading),
      ...links.map((link, index) =>
        footerLink(`${idPrefix}-link-${index + 1}`, link.label, link.href),
      ),
    ],
  };
}

/** Icon + link contact row (WhatsApp / email) for the brand column. */
export function footerContactRow(
  idPrefix: string,
  icon: BuilderIconName,
  label: string,
  href: string,
): BuilderNode {
  return {
    id: `${idPrefix}-row`,
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      layerLabel: `Contact, ${label}`,
      style: { gap: "10px", alignItems: "center" },
    },
    children: [
      {
        id: `${idPrefix}-icon`,
        kind: "icon",
        props: {
          icon,
          decorative: true,
          size: "sm",
          layerLabel: "Contact icon",
          style: { textColor: GOLD },
        },
      },
      footerLink(`${idPrefix}-link`, label, href, { textColor: TEXT }),
    ],
  };
}

/**
 * Social icon row. Bound to `workspace_social_links` so the tenant's REAL
 * Instagram / TikTok / WhatsApp / email (agency_business_identity) resolve at
 * render time; the static links below are the never-blank fallback.
 */
export function footerSocialRow(id: string, ariaLabel: string): BuilderNode {
  const links: ReadonlyArray<{ platform: BuilderSocialPlatform; href: string }> = [
    { platform: "instagram", href: FOOTER_INSTAGRAM_HREF },
    { platform: "tiktok", href: FOOTER_TIKTOK_HREF },
    { platform: "whatsapp", href: FOOTER_WHATSAPP_HREF },
    { platform: "email", href: FOOTER_EMAIL_HREF },
  ];
  return {
    id,
    kind: "social_links",
    props: {
      ariaLabel,
      size: "sm",
      shape: "circle",
      layerLabel: "Social links",
      dataBinding: { sourceKey: "workspace_social_links" },
      links: links.map((link, index) => ({
        id: `${id}-s${index + 1}`,
        platform: link.platform,
        href: link.href,
      })),
      style: { justifyContent: "flex-start" },
    },
  };
}

// ── the footer tree ──────────────────────────────────────────────────────────

/**
 * Build one locale's footer children tree. The seeder wraps this in the
 * `site_footer` landmark; nothing here writes to any DB.
 */
export function buildFooterTree(copy: FooterCopy): BuilderNode[] {
  const p = `impronta-footer-${copy.locale}`;

  const brandColumn: BuilderNode = {
    id: `${p}-brand-col`,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: "Brand column",
      style: { gap: "18px", minWidth: "0px" },
    },
    children: [
      {
        id: `${p}-brand-logo`,
        kind: "image",
        props: {
          src: IMAGE_SLOT(FOOTER_LOGO_SLOT),
          alt: copy.logoAlt,
          layerLabel: "Footer logo",
          style: { width: "156px", maxWidthFree: "156px", objectFit: "contain" },
        },
      },
      {
        id: `${p}-brand-tagline`,
        kind: "paragraph",
        props: {
          text: copy.tagline,
          layerLabel: "Tagline",
          style: {
            fontFamily: SANS,
            fontSize: "14px",
            lineHeight: "1.6",
            textColor: MUTED,
            align: "left",
            maxWidthFree: "34ch",
            marginTopFree: "0px",
            marginBottomFree: "0px",
          },
        },
      },
      {
        id: `${p}-brand-contact`,
        kind: "container",
        props: {
          layout: "stack",
          align: "start",
          layerLabel: "Contact",
          style: { gap: "10px", marginTopFree: "4px" },
        },
        children: [
          footerContactRow(
            `${p}-contact-whatsapp`,
            "phone",
            FOOTER_WHATSAPP_DISPLAY,
            FOOTER_WHATSAPP_HREF,
          ),
          footerContactRow(`${p}-contact-email`, "mail", FOOTER_EMAIL, FOOTER_EMAIL_HREF),
        ],
      },
    ],
  };

  const topGrid: BuilderNode = {
    id: `${p}-columns`,
    kind: "container",
    props: {
      layout: "grid",
      columns: 4,
      gap: "l",
      align: "start",
      layerLabel: "Footer columns",
      responsive: {
        tablet: { layout: "grid", columns: 2 },
        mobile: { layout: "stack", columns: 1 },
      },
      style: {
        width: "100%",
        gap: "44px",
        gridTemplateColumns: "1.35fr 1fr 1fr 1fr",
        responsive: { mobile: { gap: "36px" } },
      },
    },
    children: [
      brandColumn,
      footerLinkColumn(`${p}-explore`, copy.exploreHeading, copy.explore),
      footerLinkColumn(`${p}-divisions`, copy.divisionsHeading, copy.divisions),
      footerLinkColumn(`${p}-talent`, copy.forTalentHeading, copy.forTalent),
    ],
  };

  const legalRow: BuilderNode = {
    id: `${p}-legal`,
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      layerLabel: "Legal row",
      responsive: { mobile: { layout: "stack", align: "start" } },
      style: {
        width: "100%",
        gap: "20px",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "24px",
        borderColor: HAIRLINE,
        borderWidth: "1px 0px 0px 0px",
        borderStyle: "solid",
      },
    },
    children: [
      {
        id: `${p}-legal-copyright`,
        kind: "paragraph",
        props: {
          text: copy.copyright,
          layerLabel: "Copyright",
          style: {
            fontFamily: SANS,
            fontSize: "13px",
            textColor: MUTED,
            align: "left",
            marginTopFree: "0px",
            marginBottomFree: "0px",
          },
        },
      },
      {
        id: `${p}-legal-links`,
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          layerLabel: "Legal links",
          style: { gap: "22px", justifyContent: "flex-end" },
        },
        children: copy.legal.map((link, index) =>
          footerLink(`${p}-legal-link-${index + 1}`, link.label, link.href, {
            fontSize: "13px",
          }),
        ),
      },
    ],
  };

  return [
    {
      id: `${p}-root`,
      kind: "container",
      props: {
        layout: "stack",
        align: "center",
        layerLabel: "Footer",
        style: {
          width: "100%",
          maxWidthFree: "100%",
          backgroundColor: INK,
          textColor: TEXT,
          borderColor: HAIRLINE,
          borderWidth: "1px 0px 0px 0px",
          borderStyle: "solid",
          paddingTop: "72px",
          paddingBottom: "36px",
          paddingLeft: "32px",
          paddingRight: "32px",
          responsive: {
            mobile: {
              paddingTop: "52px",
              paddingBottom: "28px",
              paddingLeft: "20px",
              paddingRight: "20px",
            },
          },
        },
      },
      children: [
        {
          id: `${p}-wrap`,
          kind: "container",
          props: {
            layout: "stack",
            align: "stretch",
            layerLabel: "Footer content",
            style: { width: "100%", maxWidthFree: "1220px", gap: "40px" },
          },
          children: [topGrid, footerSocialRow(`${p}-social`, copy.socialAriaLabel), legalRow],
        },
      ],
    },
  ];
}
