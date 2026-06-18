/**
 * Talent Max SITE — starter-template GALLERY registry.
 *
 * Five freeform starters a Max talent can pick when setting up their site. Each
 * varies the LAYOUT + EMPHASIS while staying fully data-driven (every home tree
 * is `{{token}}`-hydrated from the talent's profile by the caller — name, photo,
 * bio, services, gallery, inquiry CTA). The shell + home builders are composed
 * from the shared section builders (`./sections`) and, for `default`, from the
 * EXISTING platform-default builders so the gallery + provisioning share one
 * source of truth.
 *
 * Pure (injectable id factory) → unit-testable and importable by the apply-
 * template server action and the provisioning helper.
 *
 * | key       | hero            | gallery  | shell           | emphasis            |
 * |-----------|-----------------|----------|-----------------|---------------------|
 * | default   | split + chips   | masonry  | left brand+nav  | premium all-rounder |
 * | editorial | split 40-60     | masonry  | centered serif  | magazine, image-led |
 * | minimal   | centered, no img| grid 2up | minimal left    | type-forward, clean  |
 * | portfolio | split 60-40     | grid 3up | left brand+nav  | work-grid forward   |
 * | bold      | full-bleed cover| grid 3up | dark header     | dramatic, cover-led |
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "../default-max-site-trees";
import { buildDefaultTalentProfileTree } from "../default-talent-tree";
import {
  aboutBlock,
  buildShell,
  contactBlock,
  defaultIdFactory,
  galleryBlock,
  heroCentered,
  heroCover,
  heroSplit,
  servicesBlock,
} from "./sections";
import type {
  MaxSiteTemplateContext,
  MaxSiteTemplateDef,
  MaxSiteTemplateIdFactory,
  MaxSiteTemplateKey,
} from "./types";

const EDITORIAL_ACCENT = "#8a6d3b";
const BOLD_ACCENT = "#f4d58d";

/**
 * DEFAULT — the platform's premium all-rounder. Reuses the EXACT builders the
 * provisioning helper seeds (`buildDefaultShellTree` + `buildDefaultTalentProfileTree`)
 * so picking "default" reproduces a freshly-provisioned site. The home tree
 * already carries the full `{{token}}` set (incl. the Max VIP badge container).
 */
const DEFAULT_TEMPLATE: MaxSiteTemplateDef = {
  key: "default",
  label: "Tulala Default",
  description:
    "Our premium all-rounder: a split hero with your photo, discipline chips, about, services and a gallery.",
  emphasis: "Split hero · masonry gallery",
  thumbnailUrl: "/marketing/photos/talent-services-hero.jpg",
  buildShellTree: (ctx, makeId = defaultIdFactory) =>
    buildDefaultShellTree(
      { displayName: ctx.displayName, logoUrl: ctx.logoUrl, homeHref: ctx.homeHref },
      makeId,
    ),
  // The platform default tree builds its own stable ids; the home tree does not
  // take an id factory (its ids are content-prefixed + deterministic by design).
  buildHomeTree: () => buildDefaultTalentProfileTree(),
};

/**
 * EDITORIAL — magazine emphasis: an image-led 40-60 split hero, serif-leaning
 * centered shell, a centered About, and a masonry gallery. A warm accent ties
 * the eyebrow + chips together.
 */
const EDITORIAL_TEMPLATE: MaxSiteTemplateDef = {
  key: "editorial",
  label: "Editorial",
  description:
    "Magazine-style: an image-led split hero, a centered intro, and a staggered gallery. Warm and refined.",
  emphasis: "Image-led 40-60 hero · centered chrome",
  thumbnailUrl: "/marketing/photos/independent-singer-booking.jpg",
  buildShellTree: (ctx, makeId = defaultIdFactory) =>
    buildShell(makeId, {
      displayName: ctx.displayName,
      logoUrl: ctx.logoUrl,
      homeHref: ctx.homeHref,
      headerAlign: "center",
      headerStyle: { paddingY: "m", borderColor: EDITORIAL_ACCENT, borderWidth: "0 0 1px 0", borderStyle: "solid" },
    }),
  buildHomeTree: (_ctx, makeId = defaultIdFactory) => [
    heroSplit(makeId, { ratio: "40-60", chips: true, accent: EDITORIAL_ACCENT, minHeight: "78vh" }),
    aboutBlock(makeId, { align: "center", accent: EDITORIAL_ACCENT }),
    servicesBlock(makeId, { columns: 3 }),
    galleryBlock(makeId, { mode: "masonry", columns: 3, heading: "Portfolio" }),
    contactBlock(makeId),
  ],
};

/**
 * MINIMAL — type-forward + clean: a centered hero with NO headshot, a tight
 * 2-up services grid, and a 2-column gallery. The most restrained layout — lets
 * the name + words carry the page.
 */
const MINIMAL_TEMPLATE: MaxSiteTemplateDef = {
  key: "minimal",
  label: "Minimal",
  description:
    "Type-forward and clean: a centered name-first hero (no photo), a compact services grid, and a simple gallery.",
  emphasis: "Centered type hero · no headshot",
  thumbnailUrl: "/marketing/photos/service-pros-lifestyle.jpg",
  buildShellTree: (ctx, makeId = defaultIdFactory) =>
    buildShell(makeId, {
      displayName: ctx.displayName,
      logoUrl: ctx.logoUrl,
      homeHref: ctx.homeHref,
      headerAlign: "space-between",
      headerStyle: { paddingY: "s" },
    }),
  buildHomeTree: (_ctx, makeId = defaultIdFactory) => [
    heroCentered(makeId, { chips: true }),
    aboutBlock(makeId, { align: "center" }),
    servicesBlock(makeId, { columns: 2, heading: "What I do" }),
    galleryBlock(makeId, { mode: "grid", columns: 2, heading: "Work" }),
    contactBlock(makeId, { heading: "Get in touch" }),
  ],
};

/**
 * PORTFOLIO — work-grid forward: a 60-40 split hero (copy-weighted) then a
 * prominent 3-up gallery placed BEFORE services so the work leads, with services
 * + contact closing. For talents whose images are the pitch.
 */
const PORTFOLIO_TEMPLATE: MaxSiteTemplateDef = {
  key: "portfolio",
  label: "Portfolio",
  description:
    "Work leads: a copy-weighted hero, then a prominent 3-column gallery up top, with services and contact below.",
  emphasis: "Gallery-first · 60-40 hero",
  thumbnailUrl: "/marketing/photos/mk-models-runway.jpg",
  buildShellTree: (ctx, makeId = defaultIdFactory) =>
    buildShell(makeId, {
      displayName: ctx.displayName,
      logoUrl: ctx.logoUrl,
      homeHref: ctx.homeHref,
      headerAlign: "space-between",
    }),
  buildHomeTree: (_ctx, makeId = defaultIdFactory) => [
    heroSplit(makeId, { ratio: "60-40", chips: true, minHeight: "64vh" }),
    galleryBlock(makeId, { mode: "grid", columns: 3, heading: "Selected work" }),
    aboutBlock(makeId, { align: "start" }),
    servicesBlock(makeId, { columns: 3 }),
    contactBlock(makeId),
  ],
};

/**
 * BOLD — dramatic + cover-led: a full-bleed cover hero painting the headshot as
 * a scrimmed background with overlaid name + CTA, a dark header, then about,
 * services, and a 3-up gallery. The headshot must read well as a wide cover.
 */
const BOLD_TEMPLATE: MaxSiteTemplateDef = {
  key: "bold",
  label: "Bold",
  description:
    "Dramatic: a full-bleed cover hero with your photo behind the title, a dark header, then about, services and gallery.",
  emphasis: "Full-bleed cover hero · dark chrome",
  thumbnailUrl: "/marketing/photos/mk-hero-perform.jpg",
  buildShellTree: (ctx, makeId = defaultIdFactory) =>
    buildShell(makeId, {
      displayName: ctx.displayName,
      logoUrl: ctx.logoUrl,
      homeHref: ctx.homeHref,
      headerAlign: "space-between",
      headerStyle: { paddingX: "l", paddingY: "m", backgroundColor: "#111111", textColor: "#ffffff" },
      footerStyle: { paddingY: "l", backgroundColor: "#111111" },
      footerTone: "muted",
    }),
  buildHomeTree: (_ctx, makeId = defaultIdFactory) => [
    heroCover(makeId, { accent: BOLD_ACCENT }),
    aboutBlock(makeId, { align: "start", accent: BOLD_ACCENT }),
    servicesBlock(makeId, { columns: 3 }),
    galleryBlock(makeId, { mode: "grid", columns: 3, heading: "Selected work" }),
    contactBlock(makeId),
  ],
};

export const MAX_SITE_TEMPLATES: Record<MaxSiteTemplateKey, MaxSiteTemplateDef> = {
  default: DEFAULT_TEMPLATE,
  editorial: EDITORIAL_TEMPLATE,
  minimal: MINIMAL_TEMPLATE,
  portfolio: PORTFOLIO_TEMPLATE,
  bold: BOLD_TEMPLATE,
};

/** Ordered list for the gallery UI (default first). */
export const MAX_SITE_TEMPLATE_ORDER: MaxSiteTemplateKey[] = [
  "default",
  "editorial",
  "minimal",
  "portfolio",
  "bold",
];

/** Public-safe descriptor for the dashboard gallery cards (no builder fns). */
export interface MaxSiteTemplateSummary {
  key: MaxSiteTemplateKey;
  label: string;
  description: string;
  emphasis: string;
  /**
   * Root-relative URL for a template thumbnail image (mirrors MaxSiteTemplateDef).
   * Absent = the CSS-wireframe fallback renders in the picker.
   */
  thumbnailUrl?: string;
}

export function listMaxSiteTemplateSummaries(): MaxSiteTemplateSummary[] {
  return MAX_SITE_TEMPLATE_ORDER.map((key) => {
    const def = MAX_SITE_TEMPLATES[key];
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      emphasis: def.emphasis,
      thumbnailUrl: def.thumbnailUrl,
    };
  });
}

/** True when `key` is a known starter-template key. */
export function isMaxSiteTemplateKey(key: unknown): key is MaxSiteTemplateKey {
  return typeof key === "string" && key in MAX_SITE_TEMPLATES;
}

/** Look up a template def by key (or undefined). */
export function getMaxSiteTemplate(
  key: MaxSiteTemplateKey,
): MaxSiteTemplateDef | undefined {
  return MAX_SITE_TEMPLATES[key];
}

/**
 * Build BOTH trees for a template in one call. The home tree is returned
 * UN-hydrated (carries `{{token}}` placeholders) — the caller runs
 * `hydrateTalentTree(homeTree, talentProfileTokens(...))` to fill the talent's
 * data. The fallback `buildStarterHomePageTree` is referenced here only as a
 * defensive last resort signature (templates always return a non-empty home).
 */
export function buildMaxSiteTemplateTrees(
  key: MaxSiteTemplateKey,
  ctx: MaxSiteTemplateContext,
  makeId: MaxSiteTemplateIdFactory = defaultIdFactory,
): { shellTree: BuilderNode[]; homeTree: BuilderNode[] } {
  const def = MAX_SITE_TEMPLATES[key];
  if (!def) {
    // Unknown key → minimal valid trees (never throws into the action path).
    return {
      shellTree: buildDefaultShellTree({ displayName: ctx.displayName }, makeId),
      homeTree: buildStarterHomePageTree({ displayName: ctx.displayName }, makeId),
    };
  }
  return {
    shellTree: def.buildShellTree(ctx, makeId),
    homeTree: def.buildHomeTree(ctx, makeId),
  };
}
