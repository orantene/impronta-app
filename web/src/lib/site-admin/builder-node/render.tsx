import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Fragment, cloneElement, isValidElement, memo } from "react";

import { nodeScopedCss } from "@/lib/site-admin/sections/shared/scoped-custom-css";
import {
  SOCIAL_POST_EMBED_SCRIPTS,
  parseSocialPostUrl,
} from "@/lib/social-embed/social-post-url";

import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { hcaptchaLocale, turnstileLocale } from "@/lib/i18n/vendor-locale";
import { FeaturedTalentCard } from "@/lib/site-admin/sections/featured_talent/FeaturedTalentCard";
import type { FeaturedTalentCardDTO } from "@/lib/site-admin/sections/featured_talent/fetch";
import {
  isSafeRichTextHref,
  renderInlineRich,
} from "@/lib/site-admin/sections/shared/rich-text";

import {
  BACKGROUND_MEDIA_CSS,
  renderBackgroundMediaLayer,
} from "./background-media-layer";
import { hasRenderableBackgroundMedia } from "./background-media";
import { BuilderNodeCarouselTrack } from "./carousel";
import { carouselSlideVars } from "./carousel-slides-per-view";
import { SocialFeedWidget } from "./social-feed";
import { BuilderNodeCodeFrame } from "./code-frame";
import { BuilderNodeLayoutMotion } from "./layout-motion";
import type { BuilderSectionEmbedRenderer } from "./section-embed-renderer";
import { resolveBuilderNodeRole } from "./role-bindings";
import {
  resolveInstanceChildren,
  type ComponentDefinitions,
} from "./component-instances";
import {
  buildScopedRendererCss,
  collectPresentNodeKinds,
} from "./renderer-css-scope";
import {
  buildGoogleFontsHrefForFamilies,
  collectBuilderNodeFontFamilies,
} from "./fonts-registry";
import { getBuilderIconDefinition } from "./icon-registry";
import { resolveStyleTokenRef } from "./style-token-bindings";
import {
  GAP_BY_SIZE,
  ICON_SIZE,
  NODE_MAX_WIDTH,
  NODE_RADIUS,
  NODE_SPACING,
  SPACER_BY_SIZE,
  TEXT_SIZE_CLAMP,
  TEXT_SIZE_CLAMP_PARAGRAPH,
} from "./style-scales";
import {
  applyComponentStyleDefaults,
  type ComponentStyleDefaults,
} from "./component-style-defaults";
import {
  resolveNodeStyleWithClass,
  type BuilderStyleClassRegistry,
} from "./style-classes";
import {
  getBuilderNodeDataBinding,
  isBuilderDataBindingRepeater,
  isSafeBuilderBoundImageSrc,
  resolveBuilderDataBindingCollection,
  resolveBuilderFieldBindingValue,
  type BuilderDataSourceRecord,
  type BuilderRepeatItem,
  type BuilderFieldBindingProp,
} from "./data-bindings";
import {
  evaluateBuilderNodeVisibility,
  type BuilderVisibilityContext,
} from "./visibility";
import {
  experimentConversionTrigger,
  resolveNodeExperiment,
  type ResolvedNodeExperiment,
} from "./experiment";
import { resolveLocalized } from "@/lib/i18n/resolve-localized";
import { isLocalizableProp } from "@/lib/i18n/builder-i18n-props";
import type {
  BuilderNavLink,
  BuilderNode,
  BuilderNodeKind,
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "./types";
import type { BuilderImageMediaAsset } from "@/lib/site-admin/media/types";
import { isRenderableEmptySection } from "./render-prune";

export interface BuilderNodeRenderDataSources {
  collections?: Readonly<Record<string, ReadonlyArray<BuilderDataSourceRecord>>>;
  featuredTalentProfiles?: ReadonlyArray<FeaturedTalentCardDTO>;
  talentLocations?: ReadonlyArray<{
    id: string;
    citySlug: string;
    displayName: string;
    talentCount: number;
  }>;
  directoryShortcuts?: ReadonlyArray<{
    id: string;
    slug: string;
    name: string;
    // Optional per-category image (a curated global promo image, else this
    // tenant's representative roster photo from home-data.ts). A bound division
    // tile reads it via the {{imageUrl}} token; absent ⇒ text-only card.
    imageUrl?: string | null;
  }>;
  // A4 — tenant social/contact links (the `workspace_social_links` source).
  // Injected by the SHELL/server caller from `resolveShellSocialContact`
  // (agency_business_identity). A bound `social_links` node renders these
  // instead of its static authored `links[]`. Absent ⇒ the node falls back to
  // its own links (never blanks out).
  socialLinks?: ReadonlyArray<{
    platform: string;
    href: string;
    label?: string;
  }>;
  mediaAssets?: ReadonlyArray<BuilderImageMediaAsset>;
  /**
   * Phase 3 — cached Instagram/TikTok media for THIS tenant, keyed by provider.
   * Injected by the server caller from `readCachedFeedItems`; a `social_feed`
   * node with `source: "connected"` renders these instead of its authored
   * `items`. Absent (or empty) ⇒ the node falls back to its authored items and
   * never blanks out — same contract as `socialLinks` above.
   *
   * The render path NEVER fetches: a vendor outage or rate limit must not be
   * able to slow or break a public tenant page.
   */
  socialFeeds?: Readonly<
    Record<
      string,
      ReadonlyArray<{
        id: string;
        mediaUrl: string;
        mediaType: "image" | "video";
        posterUrl?: string;
        permalink?: string;
        caption?: string;
      }>
    >
  >;
}

export interface BuilderNodeRenderOptions {
  publicPathPrefix?: string;
  mode?: "all" | "freeform";
  dataSources?: BuilderNodeRenderDataSources;
  includeRendererStyles?: boolean;
  includeFontLinks?: boolean;
  // Phase 3 — saved component definitions (componentId → master subtree root).
  // When provided, linked instances (containers tagged props.instanceOf) render
  // the master subtree LIVE with per-instance overrides. When absent or the
  // component is missing, instances fall back to their own stored children.
  components?: ComponentDefinitions;
  // Wave 3 · 3B — page-scoped LINKED STYLE CLASSES (classId → { id, name,
  // style }). When provided, a node whose `style.classRef` names a class in
  // this registry renders with the class style merged BENEATH its own props.
  // Absent / unknown ref → the node falls through to its own style (a linked
  // block can never blank out). See style-classes.ts.
  styleClasses?: BuilderStyleClassRegistry;
  // Wave 5B · #38 — CONDITIONAL VISIBILITY context. When provided, a node whose
  // `visibilityCondition` does not match these signals (locale / auth / named
  // variant) is OMITTED at the single `shouldRenderNode` choke point. Absent or
  // a signal left undefined → that rule passes (a node never hides on a missing
  // signal). No node carries a condition in the flagship → byte-identical.
  visibilityContext?: BuilderVisibilityContext;
  // `section_embed` (Tulala component) renderer — INJECTED by the server caller
  // (homepage-cms-sections / PublishedShell) so this module never statically
  // imports the section registry (which would pull every section Component +
  // its server deps into the client edit-chrome bundle that imports this file).
  // Given a section_embed node, it returns the live curated section (with
  // tenant-scoped data) or a labeled placeholder. Absent in lighter render
  // contexts (tests, tenant-less previews) → the case renders nothing.
  renderSectionEmbed?: BuilderSectionEmbedRenderer | null;
  // Server-resolved captcha for this tenant (`resolveTenantCaptcha`). The
  // `form` node MUST render the widget whenever the tenant has an active
  // provider, because /api/cms/forms/submit enforces captcha at TENANT level:
  // it looks up the submitted section's tenant, not the form's own props. So
  // the instant an operator configures captcha, a form node that renders no
  // widget sends no token and EVERY submission is rejected — which is exactly
  // what happened to improntamodels.com on 2026-08-16. Keying render and
  // enforcement off the same tenant signal makes them impossible to diverge.
  captcha?: {
    provider: "hcaptcha" | "turnstile" | "none";
    siteKey: string | null;
  } | null;
  // The locale THIS PAGE was rendered for, used to set the captcha widget's
  // language. Both hCaptcha and Turnstile default to the visitor's BROWSER
  // language, so a Spanish storefront served an English-browser visitor an
  // English challenge on top of Spanish copy. Absent (tests, tenant-less
  // previews, single-language callers that pass no locale) → no language
  // attribute is emitted and each provider keeps its own default, which is
  // byte-identical to the markup before this option existed.
  visitorLocale?: string;
  // W3-T1 — EDITOR-ONLY insert/delete/reorder motion. When true, the rendered
  // node list is wrapped in a `display: contents` FLIP primitive
  // (`BuilderNodeLayoutMotion`) so inserts fade+rise, deletes fade out, and
  // siblings settle. OPT-IN and default OFF → the server / published paths emit
  // byte-identical markup (no wrapper). Honors `prefers-reduced-motion`. Only
  // `ClientBuilderCanvas` passes it true.
  animateLayout?: boolean;
  // GAP B — per-component-type DEFAULT styles (the cascade middle layer). When
  // provided, every node's own style is merged OVER `componentStyleDefaults[
  // node.kind]` at the single dispatch (`renderBuilderNode`), so e.g. all
  // headings start from the theme's heading default and any one heading can
  // still override. Absent / empty → every node resolves to its own style by
  // identity (byte-identical). The SSR renderer and the editor canvas both pass
  // this, so the cascade is computed in ONE place for both. See
  // `component-style-defaults.ts`.
  componentStyleDefaults?: ComponentStyleDefaults;
  // WS5 — per-element translation. When provided, every localizable string prop
  // (`text`/`label`/`alt`/`title`/`brand`, per builder-i18n-props) resolves
  // through the node's `i18n` overlay via `resolveLocalized(map, locale, chain)`:
  // the base prop is the default-locale value, the overlay supplies the rest.
  // Absent → the base prop renders verbatim (byte-identical single-language).
  //   - PUBLISHED render: pass `{ locale, defaultLocale, chain }` (visitor's
  //     resolved locale + tenant fallback chain). NEVER set `editorPreview`, so
  //     fallbacks render at full opacity exactly like today.
  //   - EDITOR canvas: ALSO pass `editorPreview: true`. A node whose active-locale
  //     value is a FALLBACK then renders at 40% opacity + a dotted "untranslated"
  //     outline — the editor-only "needs translation" cue. Never reaches the
  //     published site.
  contentLocale?: BuilderNodeContentLocaleOptions;
  // ABTEST-1 — minimal A/B variant engine. When `experimentSeed` is a stable
  // per-visitor string (a cookie value the SSR caller supplies), an eligible
  // CTA / form node carrying a live 2-arm `experiment` is bucketed
  // deterministically into a variant, its `propOverrides` are merged, and the
  // rendered element is tagged `data-experiment`/`data-variant` so the injected
  // runtime fires impression + conversion through /api/analytics/events.
  // Absent seed → control ("a") always renders, no tracking (e.g. the editor
  // canvas / tests), so output is byte-identical for trees with no experiment.
  experimentSeed?: string | null;
  // tenant + surface tags merged into the experiment analytics payload so
  // per-tenant reporting matches (tenant_id is promoted to the column by
  // track-client). Optional/advisory — absent → unscoped payload.
  experimentTenantId?: string | null;
  experimentSurface?: string | null;
}

export interface BuilderNodeContentLocaleOptions {
  /** The locale to resolve localizable props for. */
  locale: string;
  /** Tenant default ("primary") locale = the node's base-prop language. */
  defaultLocale: string;
  /** Ordered fallback walk for `resolveLocalized(map, locale, chain)`. */
  chain: readonly string[];
  /**
   * Editor-only. When true, a node whose active-locale value falls back to
   * another locale renders at 40% opacity + a dotted outline (the "needs
   * translation" cue). The published render path leaves this unset.
   */
  editorPreview?: boolean;
}

type NormalizedBuilderNodeRenderOptions = Required<
  Omit<
    BuilderNodeRenderOptions,
    | "renderSectionEmbed"
    | "styleClasses"
    | "visibilityContext"
    | "contentLocale"
    | "visitorLocale"
    | "experimentSeed"
    | "experimentTenantId"
    | "experimentSurface"
  >
> & {
  renderSectionEmbed: BuilderSectionEmbedRenderer | null;
  // ABTEST-1 — undefined/null seed → control always renders, no tracking.
  experimentSeed: string | null | undefined;
  experimentTenantId: string | null | undefined;
  experimentSurface: string | null | undefined;
  // Always present after normalize (defaults to {} so the per-node resolver can
  // index it unconditionally). An empty registry → every node resolves to its
  // own style by identity (byte-identical).
  styleClasses: BuilderStyleClassRegistry;
  // Wave 5B · #38 — undefined when the caller supplies no signals; the
  // visibility evaluator treats undefined as "always shown".
  visibilityContext: BuilderVisibilityContext | undefined;
  // WS5 — undefined when the caller supplies no locale (single-language tenants
  // / tests): every localizable prop renders its base value verbatim.
  contentLocale: BuilderNodeContentLocaleOptions | undefined;
  // Undefined when neither `visitorLocale` nor `contentLocale` was supplied →
  // captcha widgets emit no language attribute (provider default).
  visitorLocale: string | undefined;
  repeatItem: BuilderRepeatItem | null;
  repeatDepth: number;
};

const MAX_REPEAT_RENDER_DEPTH = 1;

// The preset scales (GAP_BY_SIZE, SPACER_BY_SIZE, ICON_SIZE, NODE_SPACING,
// NODE_MAX_WIDTH, NODE_RADIUS, TEXT_SIZE_CLAMP*) live in `./style-scales` so
// the inspector's preset chips import the SAME values this renderer emits
// (Inspector Reset P2 — replaces the field kit's text-parsed mirror).

const NODE_ASPECT_RATIO = {
  auto: undefined,
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
  "21:9": "21 / 9",
} as const;

const CONTAINER_QUERY_STYLE_RULES: ReadonlyArray<{
  attr: string;
  css: (prefix: string) => string;
}> = [
  { attr: "align", css: (p) => `text-align:var(--bn-${p}-align)!important` },
  { attr: "tone", css: (p) => `color:var(--bn-${p}-color)!important` },
  { attr: "width", css: (p) => `max-width:var(--bn-${p}-max-width)!important` },
  { attr: "margin-top", css: (p) => `margin-top:var(--bn-${p}-margin-top)!important` },
  { attr: "margin-bottom", css: (p) => `margin-bottom:var(--bn-${p}-margin-bottom)!important` },
  { attr: "padding-x", css: (p) => `padding-left:var(--bn-${p}-padding-x)!important;padding-right:var(--bn-${p}-padding-x)!important` },
  { attr: "padding-y", css: (p) => `padding-top:var(--bn-${p}-padding-y)!important;padding-bottom:var(--bn-${p}-padding-y)!important` },
  { attr: "background", css: (p) => `background:var(--bn-${p}-background)!important` },
  { attr: "radius", css: (p) => `border-radius:var(--bn-${p}-radius)!important` },
  { attr: "fit", css: (p) => `object-fit:var(--bn-${p}-fit)!important` },
  { attr: "object-position", css: (p) => `object-position:var(--bn-${p}-object-position)!important` },
  { attr: "ratio", css: (p) => `aspect-ratio:var(--bn-${p}-ratio)!important` },
  { attr: "aspect-free", css: (p) => `aspect-ratio:var(--bn-${p}-aspect-free)!important` },
  { attr: "hidden", css: () => "display:none!important" },
  { attr: "font-family", css: (p) => `font-family:var(--bn-${p}-font-family)!important` },
  { attr: "font-size", css: (p) => `font-size:var(--bn-${p}-font-size)!important` },
  { attr: "font-weight", css: (p) => `font-weight:var(--bn-${p}-font-weight)!important` },
  { attr: "line-height", css: (p) => `line-height:var(--bn-${p}-line-height)!important` },
  { attr: "letter-spacing", css: (p) => `letter-spacing:var(--bn-${p}-letter-spacing)!important` },
  { attr: "text-transform", css: (p) => `text-transform:var(--bn-${p}-text-transform)!important` },
  { attr: "font-style", css: (p) => `font-style:var(--bn-${p}-font-style)!important` },
  { attr: "text-decoration", css: (p) => `text-decoration:var(--bn-${p}-text-decoration)!important` },
  { attr: "text-color", css: (p) => `color:var(--bn-${p}-text-color)!important` },
  { attr: "bg-color", css: (p) => `background-color:var(--bn-${p}-bg-color)!important` },
  { attr: "border-color", css: (p) => `border-color:var(--bn-${p}-border-color)!important` },
  { attr: "border-width", css: (p) => `border-width:var(--bn-${p}-border-width)!important` },
  { attr: "border-style", css: (p) => `border-style:var(--bn-${p}-border-style)!important` },
  { attr: "free-width", css: (p) => `width:var(--bn-${p}-free-width)!important` },
  { attr: "height", css: (p) => `height:var(--bn-${p}-height)!important` },
  { attr: "min-height", css: (p) => `min-height:var(--bn-${p}-min-height)!important` },
  { attr: "min-width", css: (p) => `min-width:var(--bn-${p}-min-width)!important` },
  { attr: "max-width-free", css: (p) => `max-width:var(--bn-${p}-max-width-free)!important` },
  { attr: "max-height", css: (p) => `max-height:var(--bn-${p}-max-height)!important` },
  { attr: "padding-top", css: (p) => `padding-top:var(--bn-${p}-padding-top)!important` },
  { attr: "padding-right", css: (p) => `padding-right:var(--bn-${p}-padding-right)!important` },
  { attr: "padding-bottom", css: (p) => `padding-bottom:var(--bn-${p}-padding-bottom)!important` },
  { attr: "padding-left", css: (p) => `padding-left:var(--bn-${p}-padding-left)!important` },
  { attr: "margin-top-free", css: (p) => `margin-top:var(--bn-${p}-margin-top-free)!important` },
  { attr: "margin-right-free", css: (p) => `margin-right:var(--bn-${p}-margin-right-free)!important` },
  { attr: "margin-bottom-free", css: (p) => `margin-bottom:var(--bn-${p}-margin-bottom-free)!important` },
  { attr: "margin-left-free", css: (p) => `margin-left:var(--bn-${p}-margin-left-free)!important` },
  { attr: "shadow", css: (p) => `box-shadow:var(--bn-${p}-shadow)!important` },
  { attr: "text-shadow", css: (p) => `text-shadow:var(--bn-${p}-text-shadow)!important` },
  { attr: "bg-image", css: (p) => `background-image:var(--bn-${p}-bg-image)!important` },
  { attr: "opacity", css: (p) => `opacity:var(--bn-${p}-opacity)!important` },
  { attr: "radius-free", css: (p) => `border-radius:var(--bn-${p}-radius-free)!important` },
  { attr: "gap-free", css: (p) => `--bn-gap:var(--bn-${p}-gap-free)!important` },
  { attr: "container-type", css: (p) => `container-type:var(--bn-${p}-container-type)!important` },
  { attr: "container-name", css: (p) => `container-name:var(--bn-${p}-container-name)!important` },
  { attr: "position", css: (p) => `position:var(--bn-${p}-position)!important` },
  { attr: "inset-top", css: (p) => `top:var(--bn-${p}-inset-top)!important` },
  { attr: "inset-right", css: (p) => `right:var(--bn-${p}-inset-right)!important` },
  { attr: "inset-bottom", css: (p) => `bottom:var(--bn-${p}-inset-bottom)!important` },
  { attr: "inset-left", css: (p) => `left:var(--bn-${p}-inset-left)!important` },
  { attr: "z-index", css: (p) => `z-index:var(--bn-${p}-z-index)!important` },
  { attr: "overflow", css: (p) => `overflow:var(--bn-${p}-overflow)!important` },
  { attr: "rotate", css: (p) => `rotate:var(--bn-${p}-rotate)!important` },
  { attr: "scale", css: (p) => `scale:var(--bn-${p}-scale)!important` },
  { attr: "translate", css: (p) => `translate:var(--bn-${p}-translate)!important` },
  { attr: "transform-origin", css: (p) => `transform-origin:var(--bn-${p}-transform-origin)!important` },
  { attr: "transition", css: (p) => `transition-property:var(--bn-${p}-transition-property,var(--bn-transition-property,all))!important;transition-duration:var(--bn-${p}-transition-duration,var(--bn-transition-duration,.2s))!important;transition-timing-function:var(--bn-${p}-transition-timing-function,var(--bn-transition-timing-function,ease))!important;transition-delay:var(--bn-${p}-transition-delay,var(--bn-transition-delay,0s))!important` },
  { attr: "align-self", css: (p) => `align-self:var(--bn-${p}-align-self)!important` },
  { attr: "flex-grow", css: (p) => `flex-grow:var(--bn-${p}-flex-grow)!important` },
  { attr: "flex-shrink", css: (p) => `flex-shrink:var(--bn-${p}-flex-shrink)!important` },
  { attr: "flex-basis", css: (p) => `flex-basis:var(--bn-${p}-flex-basis)!important` },
  { attr: "grid-column", css: (p) => `grid-column:var(--bn-${p}-grid-column)!important` },
  { attr: "grid-row", css: (p) => `grid-row:var(--bn-${p}-grid-row)!important` },
  { attr: "order", css: (p) => `order:var(--bn-${p}-order)!important` },
  { attr: "filter", css: (p) => `filter:var(--bn-${p}-filter)!important` },
  { attr: "backdrop-filter", css: (p) => `backdrop-filter:var(--bn-${p}-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-${p}-backdrop-filter)!important` },
  { attr: "mix-blend-mode", css: (p) => `mix-blend-mode:var(--bn-${p}-mix-blend-mode)!important` },
  { attr: "justify-content", css: (p) => `justify-content:var(--bn-${p}-justify-content)!important` },
  { attr: "align-items", css: (p) => `align-items:var(--bn-${p}-align-items)!important` },
  { attr: "flex-wrap", css: (p) => `flex-wrap:var(--bn-${p}-flex-wrap)!important` },
  { attr: "grid-template-columns", css: (p) => `grid-template-columns:var(--bn-${p}-grid-template-columns)!important` },
  { attr: "grid-template-rows", css: (p) => `grid-template-rows:var(--bn-${p}-grid-template-rows)!important` },
  { attr: "grid-auto-flow", css: (p) => `grid-auto-flow:var(--bn-${p}-grid-auto-flow)!important` },
  { attr: "clip-path", css: (p) => `clip-path:var(--bn-${p}-clip-path)!important;-webkit-clip-path:var(--bn-${p}-clip-path)!important` },
  { attr: "mask-image", css: (p) => `mask-image:var(--bn-${p}-mask-image)!important;-webkit-mask-image:var(--bn-${p}-mask-image)!important` },
  { attr: "text-stroke", css: (p) => `-webkit-text-stroke:var(--bn-${p}-text-stroke)!important` },
  { attr: "cursor", css: (p) => `cursor:var(--bn-${p}-cursor)!important` },
  { attr: "user-select", css: (p) => `user-select:var(--bn-${p}-user-select)!important;-webkit-user-select:var(--bn-${p}-user-select)!important` },
  { attr: "pointer-events", css: (p) => `pointer-events:var(--bn-${p}-pointer-events)!important` },
  { attr: "scroll-snap-type", css: (p) => `scroll-snap-type:var(--bn-${p}-scroll-snap-type)!important` },
  { attr: "scroll-snap-align", css: (p) => `scroll-snap-align:var(--bn-${p}-scroll-snap-align)!important` },
  { attr: "outline", css: (p) => `outline:var(--bn-${p}-outline)!important` },
  { attr: "outline-offset", css: (p) => `outline-offset:var(--bn-${p}-outline-offset)!important` },
  { attr: "accent-color", css: (p) => `accent-color:var(--bn-${p}-accent-color)!important` },
  { attr: "caret-color", css: (p) => `caret-color:var(--bn-${p}-caret-color)!important` },
];

function builderNodeContainerQueryCss(breakpoint: "tablet" | "mobile", maxWidth: string) {
  const prefix = `cq-${breakpoint}`;
  const attr = `data-builder-style-${prefix}`;
  const rules = CONTAINER_QUERY_STYLE_RULES.map(
    (rule) => `  .site-builder-node[${attr}-${rule.attr}]{${rule.css(prefix)}}`,
  ).join("\n");
  return `@container (max-width:${maxWidth}){\n${[
    `  .site-builder-node[${attr}-size="sm"]{font-size:clamp(0.9rem,1vw,1rem)!important}`,
    `  .site-builder-node[${attr}-size="md"]{font-size:clamp(1rem,1.3vw,1.25rem)!important}`,
    `  .site-builder-node[${attr}-size="lg"]{font-size:clamp(1.35rem,2vw,2.25rem)!important}`,
    `  .site-builder-node[${attr}-size="xl"]{font-size:clamp(2rem,4vw,4.5rem)!important}`,
    `  .site-builder-node[${attr}-size="display"]{font-size:clamp(3.5rem,6vw,6rem)!important}`,
    `  .site-builder-node--paragraph[${attr}-size="lg"]{font-size:clamp(1.1rem,1.45vw,1.45rem)!important}`,
    `  .site-builder-node--paragraph[${attr}-size="xl"]{font-size:clamp(1.25rem,1.8vw,1.8rem)!important}`,
    `  .site-builder-node--paragraph[${attr}-size="display"]{font-size:clamp(2rem,4vw,4.5rem)!important}`,
    rules,
  ].join("\n")}\n}`;
}

const BUILDER_NODE_CONTAINER_QUERY_CSS = `${builderNodeContainerQueryCss(
  "tablet",
  "900px",
)}
${builderNodeContainerQueryCss("mobile", "640px")}`;

// Nav primitive — inline link row on desktop, CSS-only hamburger→menu
// disclosure on mobile. The inline <ul.nav-links> and the <details.nav-disclosure>
// are mutually exclusive by breakpoint (driven by data-bn-collapse), so exactly
// one set of links is in the layout + a11y tree at any width. No client JS:
// the native <details>/<summary> manages open/closed and announces its state.
// Menu colours fall back to an opaque card (readable over any themed band) but
// are overridable via the --bn-nav-menu-* custom properties.
const BUILDER_NODE_NAV_CSS = `
.site-builder-node--nav{position:relative;width:100%;max-width:1120px;margin:0 auto;display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:1.25rem}
.site-builder-node--nav-brand{font-weight:700;text-decoration:none;color:inherit}
.site-builder-node--nav-links{display:flex;flex-direction:row;align-items:center;gap:1.5rem;margin:0;padding:0;list-style:none}
.site-builder-node--nav-links>li{margin:0;padding:0}
.site-builder-node--nav-links a{text-decoration:none;color:inherit}
.site-builder-node--nav-disclosure{display:none;position:static}
.site-builder-node--nav-toggle{display:inline-flex;align-items:center;justify-content:center;width:2.75rem;height:2.5rem;cursor:pointer;list-style:none;border:1px solid currentColor;border-radius:8px;color:inherit;-webkit-tap-highlight-color:transparent}
.site-builder-node--nav-toggle::-webkit-details-marker{display:none}
.site-builder-node--nav-toggle::marker{content:""}
.site-builder-node--nav-toggle:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.site-builder-node--nav-burger{position:relative;display:block;width:18px;height:2px;background:currentColor;border-radius:2px}
.site-builder-node--nav-burger::before,.site-builder-node--nav-burger::after{content:"";position:absolute;left:0;width:18px;height:2px;background:currentColor;border-radius:2px}
.site-builder-node--nav-burger::before{top:-6px}
.site-builder-node--nav-burger::after{top:6px}
.site-builder-node--nav-menu{list-style:none;margin:0;padding:0.5rem;display:flex;flex-direction:column;gap:0.25rem;position:absolute;top:calc(100% + 8px);left:0;right:0;z-index:30;background:var(--bn-nav-menu-bg,#ffffff);color:var(--bn-nav-menu-color,#111111);border:1px solid var(--bn-nav-menu-border,rgba(17,17,17,0.12));border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,0.16)}
.site-builder-node--nav-menu>li{margin:0;padding:0}
.site-builder-node--nav-menu a{display:block;padding:0.6rem 0.75rem;border-radius:8px;text-decoration:none;color:inherit;font-size:0.95rem}
/* A3 — submenu disclosure. Desktop: the parent <li> is position:relative and
   the .nav-submenu panel is absolutely positioned, hidden by default and
   revealed on hover OR keyboard focus-within (CSS-only, no JS). The caret
   toggle is tabIndex=-1 (the link is the real focus target); :focus-within on
   the <li> opens the panel so a keyboard user reaches the children by tabbing.
   "mega" widens the panel into auto-fill columns. On mobile (inside .nav-menu)
   the panel is static + always laid out (children nest inline, indented). */
.site-builder-node--nav-links .site-builder-node--nav-has-sub{position:relative;display:flex;align-items:center;gap:0.35rem}
.site-builder-node--nav-sub-toggle{display:inline-flex;align-items:center;justify-content:center;width:1.25rem;height:1.25rem;padding:0;margin:0;background:none;border:0;color:inherit;cursor:pointer}
.site-builder-node--nav-caret{display:block;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;opacity:0.7}
.site-builder-node--nav-links .site-builder-node--nav-submenu{list-style:none;margin:0;padding:0.5rem;display:flex;flex-direction:column;gap:0.15rem;position:absolute;top:calc(100% + 10px);left:0;z-index:40;min-width:200px;background:var(--bn-nav-menu-bg,#ffffff);color:var(--bn-nav-menu-color,#111111);border:1px solid var(--bn-nav-menu-border,rgba(17,17,17,0.12));border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,0.16);opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity 120ms ease,transform 120ms ease,visibility 0s linear 120ms}
.site-builder-node--nav-links .site-builder-node--nav-has-sub:hover .site-builder-node--nav-submenu,.site-builder-node--nav-links .site-builder-node--nav-has-sub:focus-within .site-builder-node--nav-submenu{opacity:1;visibility:visible;transform:translateY(0);transition-delay:0s}
.site-builder-node--nav-links .site-builder-node--nav-submenu[data-bn-submenu="mega"]{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.15rem 1.25rem;min-width:min(620px,80vw)}
.site-builder-node--nav-links .site-builder-node--nav-submenu>li{margin:0;padding:0}
.site-builder-node--nav-links .site-builder-node--nav-submenu a{display:block;padding:0.5rem 0.65rem;border-radius:8px;text-decoration:none;color:inherit;font-size:0.92rem;white-space:nowrap}
.site-builder-node--nav-menu .site-builder-node--nav-has-sub{display:block}
.site-builder-node--nav-menu .site-builder-node--nav-sub-toggle{display:none}
.site-builder-node--nav-menu .site-builder-node--nav-submenu{list-style:none;margin:0.1rem 0 0.3rem;padding:0 0 0 0.85rem;display:flex;flex-direction:column;gap:0.1rem;border-left:1px solid var(--bn-nav-menu-border,rgba(17,17,17,0.12))}
.site-builder-node--nav-menu .site-builder-node--nav-submenu>li{margin:0;padding:0}
.site-builder-node--nav-menu .site-builder-node--nav-submenu a{display:block;padding:0.45rem 0.6rem;border-radius:8px;text-decoration:none;color:inherit;font-size:0.9rem;opacity:0.92}
@media (prefers-reduced-motion:reduce){
  .site-builder-node--nav-links .site-builder-node--nav-submenu{transition:none}
}
@media (max-width:900px){
  .site-builder-node--nav[data-bn-collapse="tablet"] .site-builder-node--nav-links{display:none}
  .site-builder-node--nav[data-bn-collapse="tablet"] .site-builder-node--nav-disclosure{display:block}
}
@media (max-width:640px){
  .site-builder-node--nav[data-bn-collapse="mobile"] .site-builder-node--nav-links{display:none}
  .site-builder-node--nav[data-bn-collapse="mobile"] .site-builder-node--nav-disclosure{display:block}
}
/* A6 — collapsed mobile-menu VARIANTS. Mirrors PublicHeaderMobileMenu's
   drawer-right / sheet-bottom / full-screen-fade shapes, driven purely by the
   native details open state (no JS). "dropdown" (default / absent) keeps the
   pre-A6 panel below, so existing nav trees are byte-identical. The panel is
   position:fixed for the off-canvas variants so it escapes the header's
   stacking/overflow; the open details animates it in.

   CAVEAT, learned the hard way: position:fixed does NOT always escape. Any
   ancestor with backdrop-filter, filter, perspective, contain:paint or
   will-change:transform becomes the CONTAINING BLOCK for fixed descendants --
   and a frosted-glass sticky header (our own shell variants ship
   backdrop-filter: blur(18px)) is exactly that. The drawer then resolves
   top:0;bottom:0 against the ~64px header instead of the viewport and opens
   as a clipped stub. There is no CSS escape from a containing block, so the
   off-canvas geometry is expressed in VIEWPORT UNITS (dvh/vw) rather than
   opposing offsets: the panel is then full-screen-sized whether or not it got
   trapped. mobile-health.ts additionally warns the operator at authoring
   time. Do not "simplify" these back to bottom:0 / inset:0. Variants apply ONLY
   when the disclosure is visible (i.e. at/under the collapse breakpoint), so a
   desktop render is untouched. */
.site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{animation:bn-nav-menu-in 200ms ease both}
@keyframes bn-nav-menu-in{from{opacity:0}to{opacity:1}}
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu,
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu,
.site-builder-node--nav[data-bn-mobile-menu="full-screen-fade"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{position:fixed;z-index:2;max-height:none;overflow:auto}
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{top:0;right:0;left:auto;height:100dvh;width:88vw;max-width:400px;border-radius:0;box-shadow:-18px 0 40px rgba(0,0,0,0.2);animation:bn-nav-drawer-right 240ms ease both}
@keyframes bn-nav-drawer-right{from{transform:translateX(100%)}to{transform:translateX(0)}}
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{left:0;width:100vw;bottom:0;top:auto;max-height:80dvh;border-radius:18px 18px 0 0;box-shadow:0 -18px 40px rgba(0,0,0,0.2);animation:bn-nav-sheet-bottom 240ms ease both}
@keyframes bn-nav-sheet-bottom{from{transform:translateY(100%)}to{transform:translateY(0)}}
.site-builder-node--nav[data-bn-mobile-menu="full-screen-fade"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{top:0;left:0;height:100dvh;width:100vw;border-radius:0;padding:1.25rem;gap:0.35rem;justify-content:center;animation:bn-nav-menu-in 240ms ease both}
/* An open off-canvas menu gets a tap-anywhere-to-close scrim and keeps its own
   toggle ON TOP of the panel. Without both, the drawer covered the hamburger
   and there was NO way to close the menu -- the panel simply ate the screen.
   The scrim is the summary's own ::before, so closing stays CSS-only: a tap
   anywhere on it is a tap on the summary, which toggles the details shut.
   Sized in viewport units for the containing-block caveat above. */
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>summary,
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>summary,
/* The three open-menu layers, ordered WITHIN the header's stacking context:
   scrim (1) < panel (2) < burger (3). Absolute page-level numbers are useless
   here -- a sticky header with a z-index is itself a stacking context, so no
   value on a descendant can out-stack a body-level element. An earlier attempt
   at 96/97 (to beat a body-level chat launcher at 95) could never have worked
   for that reason, and it put the summary ABOVE the panel, where its
   full-screen scrim swallowed every tap meant for a nav link. The panel must
   sit above the scrim, and only the burger above the panel. */
.site-builder-node--nav[data-bn-mobile-menu="full-screen-fade"] .site-builder-node--nav-disclosure[open]>summary{position:relative;z-index:auto}
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>summary>.site-builder-node--nav-burger,
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>summary>.site-builder-node--nav-burger,
.site-builder-node--nav[data-bn-mobile-menu="full-screen-fade"] .site-builder-node--nav-disclosure[open]>summary>.site-builder-node--nav-burger{position:relative;z-index:3}
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>summary::before,
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>summary::before{content:"";position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:1;background:var(--bn-nav-scrim,rgba(8,8,8,0.55));animation:bn-nav-menu-in 200ms ease both}
@media (prefers-reduced-motion:reduce){
  .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{animation:none}
  .site-builder-node--nav-disclosure[open]>summary::before{animation:none}
}`;

// A4 — social/contact icon row. The list lays out as an inline-flex row of
// circular/square/bare icon chips; the SVG glyph paints in currentColor so the
// active theme token colours them. Size + shape are driven by data attributes
// on the wrapper so all variants share one stylesheet (no per-node inline CSS).
const BUILDER_NODE_SOCIAL_CSS = `
.site-builder-node--social{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:0.5rem;list-style:none;margin:0;padding:0}
.site-builder-node--social>li{margin:0;padding:0}
.site-builder-node--social-link{display:inline-flex;align-items:center;justify-content:center;color:inherit;text-decoration:none;transition:opacity 120ms ease,background-color 120ms ease}
.site-builder-node--social-link:hover{opacity:0.72}
.site-builder-node--social-link:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.site-builder-node--social-icon{display:block;width:100%;height:100%}
.site-builder-node--social[data-bn-size="sm"] .site-builder-node--social-link{width:1.75rem;height:1.75rem}
.site-builder-node--social[data-bn-size="md"] .site-builder-node--social-link{width:2.25rem;height:2.25rem}
.site-builder-node--social[data-bn-size="lg"] .site-builder-node--social-link{width:2.75rem;height:2.75rem}
.site-builder-node--social[data-bn-size="sm"] .site-builder-node--social-icon{width:1.05rem;height:1.05rem}
.site-builder-node--social[data-bn-size="md"] .site-builder-node--social-icon{width:1.25rem;height:1.25rem}
.site-builder-node--social[data-bn-size="lg"] .site-builder-node--social-icon{width:1.5rem;height:1.5rem}
.site-builder-node--social[data-bn-shape="circle"] .site-builder-node--social-link{border-radius:999px;background:var(--bn-social-chip-bg,rgba(127,127,127,0.12))}
.site-builder-node--social[data-bn-shape="square"] .site-builder-node--social-link{border-radius:10px;background:var(--bn-social-chip-bg,rgba(127,127,127,0.12))}
.site-builder-node--social[data-bn-shape="bare"] .site-builder-node--social-link{background:none}
@media (prefers-reduced-motion:reduce){
  .site-builder-node--social-link{transition:none}
}`;

// A4 — the `workspace_social_links` source aliases (mirrors the
// `normalizeDataSourceKey` aliases in data-bindings.ts). A bound node may store
// the canonical key directly; this keeps the case resilient to alias drift.
function normalizeSocialSourceKey(sourceKey: string): string {
  return sourceKey === "social_links" || sourceKey === "workspace_social"
    ? "workspace_social_links"
    : sourceKey;
}

const SOCIAL_PLATFORM_LABELS: Readonly<Record<string, string>> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  whatsapp: "WhatsApp",
  email: "Email",
};

function socialPlatformLabel(platform: string): string {
  return SOCIAL_PLATFORM_LABELS[platform] ?? "Link";
}

// Social hrefs are already full destinations (https / mailto: / tel: / wa.me).
// They must NOT pass through `prefixPublicHref` (that would corrupt absolute
// URLs). A bare email/phone value (no scheme) is upgraded to mailto:/tel:.
function socialLinkHref(platform: string, href: string): string {
  const raw = href.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return raw;
  if (platform === "email") return `mailto:${raw}`;
  if (platform === "whatsapp") return `https://wa.me/${raw.replace(/\D/g, "")}`;
  return `https://${raw}`;
}

/**
 * A4 — brand-neutral social/contact glyphs, painted in `currentColor` so the
 * active theme token colours them (no external icon dependency, no tenant
 * hardcoding). The paths are the SAME markup as the header cluster's
 * `ClusterIcon` (site_header/Component.tsx) so the two surfaces stay visually
 * consistent. An unknown platform falls back to a generic link glyph.
 */
function SocialGlyph({ platform }: { platform: string }) {
  const cls = "site-builder-node--social-icon";
  const stroke = {
    className: cls,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  };
  const solid = {
    className: cls,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
    focusable: "false" as const,
  };
  switch (platform) {
    case "instagram":
      return (
        <svg {...stroke}>
          <rect x="2" y="2" width="20" height="20" rx="5.5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...solid}>
          <path d="M16.5 1.5h-3v14.2a3.1 3.1 0 11-2.3-3v-3.1a6.2 6.2 0 105.3 6.1V8.4a7.3 7.3 0 004.3 1.4V6.7a4.3 4.3 0 01-4.3-4.3v-.9z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...solid}>
          <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...solid}>
          <path d="M22.5 7.1a2.7 2.7 0 0 0-1.9-1.9C18.9 4.7 12 4.7 12 4.7s-6.9 0-8.6.5A2.7 2.7 0 0 0 1.5 7.1 28 28 0 0 0 1 12a28 28 0 0 0 .5 4.9 2.7 2.7 0 0 0 1.9 1.9c1.7.5 8.6.5 8.6.5s6.9 0 8.6-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 23 12a28 28 0 0 0-.5-4.9zM9.8 15.3V8.7l5.7 3.3z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...solid}>
          <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4z" />
        </svg>
      );
    case "x":
      return (
        <svg {...solid}>
          <path d="M18.9 2h3.3l-7.2 8.3L23 22h-6.6l-5.2-6.8L5.3 22H2l7.7-8.8L1.5 2h6.8l4.7 6.2zm-1.2 18h1.8L7.1 3.9H5.2z" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...solid}>
          <path d="M.06 24l1.69-6.16a11.87 11.87 0 01-1.59-5.95C.16 5.34 5.5 0 12.06 0a11.82 11.82 0 018.41 3.49 11.82 11.82 0 013.48 8.41c0 6.56-5.34 11.9-11.9 11.9a11.9 11.9 0 01-5.69-1.45L.06 24zM6.6 20.13c1.68 1 3.28 1.6 5.45 1.6 5.45 0 9.89-4.43 9.89-9.88a9.83 9.83 0 00-2.9-7 9.78 9.78 0 00-6.98-2.9c-5.46 0-9.9 4.44-9.9 9.89a9.82 9.82 0 001.51 5.26l-.99 3.6 3.92-1.02zm11.39-5.7c-.07-.12-.27-.2-.56-.34-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.66.15-.2.29-.76.96-.94 1.16-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.34.44-.52.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.9-2.19-.24-.57-.48-.5-.66-.5l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.47s1.07 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41z" />
        </svg>
      );
    case "email":
      return (
        <svg {...stroke}>
          <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
          <path d="m3 6 9 6.5L21 6" />
        </svg>
      );
    default:
      return (
        <svg {...stroke}>
          <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m-2 9a5 5 0 0 1-7 0 5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 0" />
        </svg>
      );
  }
}

const CONTAINER_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "1120px",
  marginTop: 0,
  marginRight: "auto",
  marginBottom: 0,
  marginLeft: "auto",
};


// Social-feed widget CSS (grid / masonry / slider / stories). Theme-aware via
// --token-color-*; hover states are gated on (hover:hover) so touch devices
// never get sticky overlays; reduced-motion drops the zoom.
const BUILDER_NODE_SOCIAL_FEED_CSS = `
.sf-root{display:block;width:100%;min-width:0}
.sf-header{display:flex;align-items:center;gap:8px;margin:0 0 14px;color:var(--token-color-heading,inherit)}
.sf-header-mark{display:inline-flex;opacity:0.85}
.sf-header-handle{font-size:14px;letter-spacing:0.08em;text-transform:uppercase}
.sf-grid{display:grid;grid-template-columns:repeat(var(--sf-cols,3),minmax(0,1fr));gap:var(--sf-gap,6px)}
.sf-masonry{columns:var(--sf-cols,3);column-gap:var(--sf-gap,6px)}
.sf-masonry .sf-tile{margin:0 0 var(--sf-gap,6px);break-inside:avoid}
.sf-tile{position:relative;display:block;width:100%;padding:0;border:0;background:none;cursor:pointer;overflow:hidden;border-radius:10px}
.sf-tile .sf-media{transition:transform 600ms cubic-bezier(0.16,1,0.3,1)}
@media (hover:hover){
.sf-hover-zoom .sf-tile:hover .sf-media,.sf-hover-zoom-caption .sf-tile:hover .sf-media{transform:scale(1.045)}
.sf-tile-overlay{opacity:0;transition:opacity 300ms ease}
.sf-tile:hover .sf-tile-overlay{opacity:1}
}
@media (hover:none){.sf-tile-overlay{opacity:1}}
@media (prefers-reduced-motion:reduce){.sf-tile .sf-media{transition:none}.sf-hover-zoom .sf-tile:hover .sf-media,.sf-hover-zoom-caption .sf-tile:hover .sf-media{transform:none}}
.sf-tile-overlay{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;padding:10px;background:linear-gradient(180deg,rgba(0,0,0,0.28) 0%,rgba(0,0,0,0) 34%,rgba(0,0,0,0) 55%,rgba(0,0,0,0.55) 100%);color:#fff;pointer-events:none}
.sf-tile-provider{display:inline-flex;align-self:flex-end;opacity:0.9}
.sf-tile-caption{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:1.4;text-align:left}
.sf-rail-wrap{position:relative}
.sf-rail{display:flex;gap:var(--sf-gap,6px);overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:4px}
.sf-rail::-webkit-scrollbar{display:none}
.sf-rail-cell{flex:0 0 auto;width:calc((100% - (var(--sf-cols,3) - 1)*var(--sf-gap,6px))/var(--sf-cols,3));min-width:180px;scroll-snap-align:start}
.sf-layout-stories .sf-rail-cell{min-width:150px}
.sf-arrow{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:999px;border:0;background:rgba(255,255,255,0.92);color:#111;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.22);display:none;align-items:center;justify-content:center}
@media (hover:hover){.sf-arrow{display:inline-flex}}
.sf-arrow-prev{left:8px}
.sf-arrow-next{right:8px}
.sf-more-row{display:flex;justify-content:center;margin-top:18px}
.sf-more{border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;padding:9px 26px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer}
.sf-lightbox{position:fixed;inset:0;z-index:2147483000;background:rgba(8,8,10,0.92);display:flex;align-items:center;justify-content:center;padding:4vh 4vw}
.sf-lightbox-figure{margin:0;max-width:min(92vw,960px);max-height:92vh;display:flex;flex-direction:column;gap:10px}
.sf-lightbox-media{max-width:100%;max-height:78vh;object-fit:contain;border-radius:8px}
.sf-lightbox-caption{color:rgba(255,255,255,0.85);font-size:13px;line-height:1.5;display:flex;gap:14px;justify-content:space-between;align-items:baseline}
.sf-lightbox-caption a{color:#fff;text-decoration:underline;white-space:nowrap}
.sf-lightbox-close{position:absolute;top:16px;right:18px;width:40px;height:40px;border:0;border-radius:999px;background:rgba(255,255,255,0.14);color:#fff;font-size:24px;cursor:pointer}
.sf-lightbox-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:999px;background:rgba(255,255,255,0.14);color:#fff;font-size:26px;cursor:pointer}
.sf-lightbox-prev{left:14px}
.sf-lightbox-next{right:14px}
`;

// Hero-variant carousel CSS (a full-bleed image slider with crossfade / Ken
// Burns / scrim / grain). Fully theme-tokenized: colors come from --token-color-*
// so the same hero renders Noir & Or / Espresso / Atelier Blanc by swapping the
// palette. Ported 1:1 from the Noir & Or reference (impronta-mockup-3).
const BUILDER_NODE_CAROUSEL_HERO_CSS = `
/* isolation:isolate — the hero stacks SIX internal layers (slides 1/4, slide
   scrim 1, slide content 2, page scrim 2, grain 3, shared copy 5, meta+arrows
   6). Without a stacking context of its own (position:relative alone is not
   one, z-index stays auto) every one of those numbers competed in the ROOT
   stacking context against whatever else the page put there, so the hero's
   arrows could paint over a neighbouring block and the editor's selection
   chrome had no deterministic relationship to the slides. Isolating costs
   nothing visually — overflow:hidden already clips these layers to the hero —
   and it makes "what paints over what inside a slider" answerable. */
.site-builder-node--carousel[data-builder-carousel-variant="hero"]{position:relative;isolation:isolate;display:block;width:100%;max-width:none;min-width:0;margin:0;padding:0;gap:0;overflow:hidden;min-height:var(--bn-hero-min-h,100svh);background:var(--token-color-background,#100e13);--bn-ease:cubic-bezier(0.16,1,0.3,1)}
.site-builder-node--carousel[data-builder-carousel-variant="hero"][data-bn-height-mode="large"]{min-height:var(--bn-hero-min-h,78svh)}
.site-builder-node--carousel[data-builder-carousel-variant="hero"][data-bn-height-mode="medium"]{min-height:var(--bn-hero-min-h,60svh)}
.site-builder-node--carousel[data-builder-carousel-variant="hero"][data-bn-height-mode="fixed"]{min-height:var(--bn-hero-min-h,620px)}
.site-bn-hero__slides{position:absolute;inset:0;z-index:1}
.site-bn-hero__slide{position:absolute;inset:0;opacity:0;transition:opacity var(--bn-transition-ms,1600ms) var(--bn-ease)}
.site-bn-hero__slide[data-active]{opacity:1}
.site-builder-node--carousel[data-builder-carousel-variant="hero"][data-bn-transition="slide"] .site-bn-hero__slide{transform:translateX(4%);transition:opacity calc(var(--bn-transition-ms,1600ms)*0.55) var(--bn-ease),transform var(--bn-transition-ms,1600ms) var(--bn-ease)}
.site-builder-node--carousel[data-builder-carousel-variant="hero"][data-bn-transition="slide"] .site-bn-hero__slide[data-active]{transform:translateX(0)}
.site-bn-hero__slide>*{margin:0;max-width:none}
/* Per-slide BACKGROUND LAYER (image / colour). Ken Burns scales THIS layer, so a
   slide's freeform content (columns, headings, buttons) on top stays put — the old
   model scaled the whole slide incl. its text. The bg is either an image child
   (image-only slide) or the slide container's background-image/colour, lifted here. */
.site-bn-hero__slide-bg{position:absolute;inset:0;z-index:0;overflow:hidden;background-size:cover;background-repeat:no-repeat;background-position:var(--bn-hero-focal,center 28%)}
.site-bn-hero__slide-bg>*,.site-bn-hero__slide-bg .site-builder-node--image,.site-bn-hero__slide-bg img{width:100%;height:100%;object-fit:cover;object-position:var(--bn-hero-focal,center 28%)}
.site-bn-hero__slide-bg img{filter:brightness(0.82) saturate(1.05)}
/* Per-slide scrim (over bg, under content) — keeps per-slide freeform copy legible. */
.site-bn-hero__slide-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(8,7,10,0.5) 0%,rgba(8,7,10,0.15) 30%,rgba(8,7,10,0.2) 52%,rgba(8,7,10,0.82) 100%)}
.site-bn-hero__slide-scrim[data-tone="light"]{background:linear-gradient(180deg,rgba(248,246,242,0.12) 0%,rgba(248,246,242,0.04) 40%,rgba(248,246,242,0.58) 100%)}
.site-bn-hero__slide-scrim[data-tone="none"]{display:none}
.site-bn-hero__slide-scrim[data-vignette="true"]{background:linear-gradient(180deg,rgba(8,7,10,0.5) 0%,rgba(8,7,10,0.15) 30%,rgba(8,7,10,0.2) 52%,rgba(8,7,10,0.82) 100%),radial-gradient(120% 90% at 50% 28%,rgba(8,7,10,0) 38%,rgba(8,7,10,0.55) 100%)}
/* Per-slide freeform CONTENT layer (static, above bg + scrim). The slide's freeform
   container fills it and lays out its own children (split columns, text, buttons). */
.site-bn-hero__slide-content{position:absolute;inset:0;z-index:2}
.site-bn-hero__slide-content>*{width:100%;height:100%;margin:0;max-width:none}
.site-builder-node--carousel[data-builder-carousel-variant="hero"][data-bn-content-mode="per-slide"] .site-bn-hero__slides{z-index:4}
.site-builder-node--carousel[data-builder-carousel-variant="hero"][data-bn-kenburns="true"] .site-bn-hero__slide-bg{transform:scale(1.04)}
.site-builder-node--carousel[data-builder-carousel-variant="hero"][data-bn-kenburns="true"] .site-bn-hero__slide[data-active] .site-bn-hero__slide-bg{animation:bn-kenburns var(--bn-kenburns-ms,9000ms) var(--bn-ease) forwards}
@keyframes bn-kenburns{from{transform:scale(1.04)}to{transform:scale(calc(1.04 + var(--bn-kenburns-amount,0.1)))}}
.site-bn-hero__scrim{position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(180deg,rgba(8,7,10,0.5) 0%,rgba(8,7,10,0.15) 30%,rgba(8,7,10,0.2) 52%,rgba(8,7,10,0.82) 100%)}
.site-bn-hero__scrim[data-vignette="true"]{background:linear-gradient(180deg,rgba(8,7,10,0.5) 0%,rgba(8,7,10,0.15) 30%,rgba(8,7,10,0.2) 52%,rgba(8,7,10,0.82) 100%),radial-gradient(120% 90% at 50% 28%,rgba(8,7,10,0) 38%,rgba(8,7,10,0.55) 100%)}
.site-bn-hero__scrim[data-tone="light"]{background:linear-gradient(180deg,rgba(248,246,242,0.12) 0%,rgba(248,246,242,0.04) 40%,rgba(248,246,242,0.58) 100%)}
.site-bn-hero__grain{position:absolute;inset:0;z-index:3;opacity:var(--bn-grain-opacity,0.45);mix-blend-mode:overlay;pointer-events:none}
.site-bn-hero__grain svg{position:absolute;inset:0;width:100%;height:100%}
.site-bn-hero__inner{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;padding:clamp(20px,5vw,88px);padding-bottom:clamp(74px,11vh,134px);color:#fff;pointer-events:none}
.site-bn-hero__inner>*{pointer-events:auto;max-width:min(100%,920px)}
.site-bn-hero__inner[data-align^="t"]{justify-content:flex-start}
.site-bn-hero__inner[data-align^="c"]{justify-content:center}
.site-bn-hero__inner[data-align^="b"]{justify-content:flex-end}
.site-bn-hero__inner[data-align$="l"]{align-items:flex-start;text-align:left}
.site-bn-hero__inner[data-align$="c"]{align-items:center;text-align:center}
.site-bn-hero__inner[data-align$="r"]{align-items:flex-end;text-align:right}
.site-bn-hero__eyebrow{display:inline-flex;align-items:center;gap:0.75em;color:var(--token-color-primary,#e0c074);text-transform:uppercase;letter-spacing:0.26em;font-size:0.78rem;font-weight:500;margin-bottom:26px}
.site-bn-hero__eyebrow::before{content:"";width:34px;height:1px;background:var(--token-color-primary,#c6a14e)}
.site-bn-hero__heading{font-family:var(--site-heading-font,"Cormorant Garamond",Georgia,serif);font-weight:600;font-size:clamp(3.2rem,9.6vw,9rem);line-height:0.96;letter-spacing:0;max-width:16ch;text-shadow:0 2px 50px rgba(0,0,0,0.5);color:#fff}
.site-bn-hero__heading .site-bn-hero__accent,.site-bn-hero__heading em{font-style:italic;color:var(--token-color-primary,#e0c074)}
.site-bn-hero__sub{margin-top:26px;font-size:clamp(1rem,1.4vw,1.2rem);max-width:46ch;color:rgba(255,255,255,0.84);font-weight:300;line-height:1.55}
.site-bn-hero__cta{margin-top:40px;display:flex;gap:14px;flex-wrap:wrap}
.site-bn-hero__btn{display:inline-flex;align-items:center;justify-content:center;padding:0.95rem 1.8rem;border-radius:2px;font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;font-weight:500;text-decoration:none;transition:transform .4s var(--bn-ease),filter .4s var(--bn-ease)}
.site-bn-hero__btn--primary{background:linear-gradient(135deg,color-mix(in srgb,var(--token-color-primary,#c6a14e) 80%,#fff),var(--token-color-primary,#c6a14e) 55%,color-mix(in srgb,var(--token-color-primary,#c6a14e) 72%,#000));color:#1a1408}
.site-bn-hero__btn--secondary{border:1px solid color-mix(in srgb,var(--token-color-primary,#c6a14e) 60%,transparent);color:#fff}
.site-bn-hero__btn:hover{transform:translateY(-2px);filter:brightness(1.08)}
.site-bn-hero__meta{position:absolute;z-index:6;right:clamp(20px,5vw,88px);bottom:clamp(74px,11vh,134px);display:flex;flex-direction:column;gap:14px;align-items:flex-end}
.site-bn-hero__count{color:rgba(255,255,255,0.6);font-size:11px;letter-spacing:0.2em;font-family:var(--site-heading-font,"Cormorant Garamond",serif)}
.site-bn-hero__progress{width:120px;height:2px;background:rgba(255,255,255,0.2);overflow:hidden}
.site-bn-hero__progress-bar{display:block;height:100%;width:0;background:var(--token-color-primary,#c6a14e);transition:width .35s linear}
.site-bn-hero__dots{display:flex;gap:10px}
.site-bn-hero__dot{width:34px;height:2px;border:0;padding:0;cursor:pointer;background:rgba(255,255,255,0.3);transition:background .4s}
.site-bn-hero__dot[data-on]{background:var(--token-color-primary,#c6a14e)}
.site-bn-hero__dot:focus-visible{outline:2px solid var(--token-color-primary,#c6a14e);outline-offset:6px}
.site-bn-hero__arrow{position:absolute;z-index:6;top:50%;transform:translateY(-50%);height:48px;width:48px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.35);border-radius:999px;background:rgba(8,7,10,0.25);color:#fff;font-size:1rem;cursor:pointer;backdrop-filter:blur(4px);transition:background .3s,border-color .3s}
.site-bn-hero__arrow:hover{background:rgba(8,7,10,0.5);border-color:var(--token-color-primary,#c6a14e)}
.site-bn-hero__arrow:focus-visible{outline:2px solid var(--token-color-primary,#c6a14e);outline-offset:3px}
.site-bn-hero__arrow--prev{left:clamp(12px,2vw,28px)}
.site-bn-hero__arrow--next{right:clamp(12px,2vw,28px)}
.site-bn-hero__cue{position:absolute;z-index:5;left:50%;bottom:30px;transform:translateX(-50%);color:rgba(255,255,255,0.7);font-size:10px;letter-spacing:0.34em;text-transform:uppercase;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none}
.site-bn-hero__cue::after{content:"";width:1px;height:38px;background:linear-gradient(var(--token-color-primary,#c6a14e),transparent);animation:bn-hero-cue 2.2s var(--bn-ease) infinite}
@keyframes bn-hero-cue{0%{transform:scaleY(0);transform-origin:top}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}
@media (max-width:760px){
  .site-bn-hero__meta{display:none}
  .site-bn-hero__heading{font-size:clamp(2.6rem,12vw,4.5rem)}
  .site-bn-hero__arrow{display:none}
}
@media (prefers-reduced-motion: reduce){
  .site-bn-hero__slide{transition:opacity .2s linear}
  .site-builder-node--carousel[data-builder-carousel-variant="hero"][data-bn-kenburns="true"] .site-bn-hero__slide[data-active] .site-bn-hero__slide-bg{animation:none;transform:none}
  .site-bn-hero__cue::after{animation:none}
}
`;

const BUILDER_NODE_RENDERER_CSS = `
@keyframes bn-anim-fade-in{from{opacity:0}to{opacity:1}}
@keyframes bn-anim-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes bn-anim-fall{from{opacity:0;transform:translateY(-24px)}to{opacity:1;transform:translateY(0)}}
@keyframes bn-anim-zoom-in{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
@keyframes bn-anim-slide-left{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
@keyframes bn-anim-slide-right{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}
@keyframes bn-anim-blur-in{from{opacity:0;filter:blur(12px)}to{opacity:1;filter:blur(0)}}
@keyframes bn-anim-flip-in{from{opacity:0;transform:perspective(800px) rotateX(35deg)}to{opacity:1;transform:perspective(800px) rotateX(0)}}
@keyframes bn-anim-bounce-in{0%{opacity:0;transform:scale(0.8)}60%{opacity:1;transform:scale(1.04)}100%{opacity:1;transform:scale(1)}}
@keyframes bn-parallax-subtle{from{transform:translateY(4%)}to{transform:translateY(-4%)}}
@keyframes bn-parallax-medium{from{transform:translateY(8%)}to{transform:translateY(-8%)}}
@keyframes bn-parallax-strong{from{transform:translateY(14%)}to{transform:translateY(-14%)}}
@media (prefers-reduced-motion:reduce){.site-builder-node[style*="animation"]{animation:none!important}}
/* Reveal-on-view (2026-06-04) — IntersectionObserver-driven entry interaction.
   The node starts at its hidden/offset pose and eases to rest the first time it
   scrolls into view. The inline IO script toggles [data-bn-revealed]; before the
   script runs (or with no IO / reduced motion) the node is shown at rest. */
.site-builder-node[data-bn-reveal]{transition:opacity var(--bn-reveal-duration,0.6s) var(--bn-reveal-easing,cubic-bezier(0.4,0,0.2,1)) var(--bn-reveal-delay,0s),transform var(--bn-reveal-duration,0.6s) var(--bn-reveal-easing,cubic-bezier(0.4,0,0.2,1)) var(--bn-reveal-delay,0s);will-change:opacity,transform}
.site-builder-node[data-bn-reveal][data-bn-reveal-armed]:not([data-bn-revealed]){opacity:0}
.site-builder-node[data-bn-reveal="fade-up"][data-bn-reveal-armed]:not([data-bn-revealed]){transform:translateY(var(--bn-reveal-distance,24px))}
.site-builder-node[data-bn-reveal="fade-down"][data-bn-reveal-armed]:not([data-bn-revealed]){transform:translateY(calc(-1 * var(--bn-reveal-distance,24px)))}
.site-builder-node[data-bn-reveal="fade-left"][data-bn-reveal-armed]:not([data-bn-revealed]){transform:translateX(var(--bn-reveal-distance,24px))}
.site-builder-node[data-bn-reveal="fade-right"][data-bn-reveal-armed]:not([data-bn-revealed]){transform:translateX(calc(-1 * var(--bn-reveal-distance,24px)))}
.site-builder-node[data-bn-reveal="zoom"][data-bn-reveal-armed]:not([data-bn-revealed]){transform:scale(0.92)}
.site-builder-node[data-bn-reveal][data-bn-revealed]{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.site-builder-node[data-bn-reveal]{opacity:1!important;transform:none!important;transition:none!important}}
.site-builder-node{box-sizing:border-box}
.site-builder-node[data-builder-style-container-type]{container-type:var(--bn-container-type)}
.site-builder-node[data-builder-style-container-name]{container-name:var(--bn-container-name)}
.site-builder-node--container{width:100%;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:var(--bn-gap,1.25rem);align-items:var(--bn-align,stretch)}
.site-builder-node--container[data-builder-layout="row"]{flex-direction:row;flex-wrap:wrap}
.site-builder-node--container[data-builder-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-columns,2),minmax(0,1fr))}
.site-builder-node--container[data-builder-display="grid"]{display:grid;grid-template-columns:repeat(var(--bn-columns,2),minmax(0,1fr))}
.site-builder-node--container[data-builder-display="slider"]{display:flex;flex-direction:row;flex-wrap:nowrap;gap:var(--bn-slider-gap,var(--bn-gap,16px));overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
.site-builder-node--container[data-builder-display="slider"] > *{flex:0 0 calc((100% - (var(--bn-items-per-view,3) - 1) * var(--bn-slider-gap,var(--bn-gap,16px))) / var(--bn-items-per-view,3));min-width:0;scroll-snap-align:start}
.site-builder-node--split{width:100%;max-width:1120px;margin:0 auto;display:grid;grid-template-columns:var(--bn-split-left,1fr) var(--bn-split-right,1fr);gap:var(--bn-gap,1.25rem);align-items:center}
.site-builder-node--carousel{width:100%;max-width:1120px;min-width:0;margin:0 auto;display:grid;gap:0.75rem}
.site-builder-node--carousel-track{width:100%;min-width:0;display:flex;gap:var(--bn-gap,1.25rem);overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:thin}
.site-builder-node--carousel-slide{min-width:0;flex:0 0 var(--bn-slide-width,50%);scroll-snap-align:start}
.site-builder-node--carousel-controls{display:flex;justify-content:flex-end;gap:0.5rem}
.site-builder-node--carousel-arrow{display:inline-flex;height:2rem;width:2rem;align-items:center;justify-content:center;border:1px solid rgba(18,18,18,0.16);border-radius:999px;background:#fff;color:#111;font-weight:700;text-decoration:none}
.site-builder-node--carousel-dots{display:flex;justify-content:center;gap:0.4rem}
.site-builder-node--carousel-dot{height:0.45rem;width:0.45rem;border:0;border-radius:999px;background:rgba(18,18,18,0.28);padding:0;cursor:pointer}
.site-builder-node--divider{border:0;margin:1rem 0;height:1px;background:rgba(18,18,18,0.16);width:100%}
.site-builder-node--divider[data-builder-divider-tone="muted"]{background:rgba(18,18,18,0.09)}
.site-builder-node--masonry{width:100%;max-width:1120px;margin:0 auto;column-count:var(--bn-columns,3);column-gap:var(--bn-gap,1.25rem)}
.site-builder-node--masonry>*{break-inside:avoid;margin-bottom:var(--bn-gap,1.25rem)}
.site-builder-node--card{width:100%;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:var(--bn-gap,1.25rem);padding:1.25rem;box-sizing:border-box}
.site-builder-node--card[data-builder-card-variant="elevated"]{background:var(--token-color-surface-raised,rgba(255,255,255,0.96));color:var(--token-color-ink,#111);box-shadow:0 10px 28px rgba(18,18,18,0.08)}
.site-builder-node--card[data-builder-card-variant="outline"]{background:var(--token-color-surface-raised,#fff);color:var(--token-color-ink,#111);border:1px solid color-mix(in oklab,var(--token-color-ink,#111) 14%,transparent)}
.site-builder-node--card[data-builder-card-variant="ghost"]{background:color-mix(in oklab,var(--token-color-surface-raised,#f6f1e8) 55%,transparent);color:var(--token-color-ink,#111)}
.site-builder-node--cta-group{width:100%;max-width:1120px;margin:0 auto;display:flex;flex-wrap:wrap;gap:var(--bn-gap,1rem);box-sizing:border-box}
.site-builder-node--cta-group[data-builder-cta-layout="stack"]{flex-direction:column;align-items:stretch}
.site-builder-node--section-embed{display:block;width:100%}
.site-builder-node--section-embed-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.4rem;width:100%;max-width:1120px;margin:0 auto;min-height:160px;padding:2rem 1.5rem;text-align:center;border:1px dashed rgba(18,18,18,0.22);border-radius:14px;background:rgba(246,241,232,0.4);box-sizing:border-box}
.site-builder-node--section-embed-placeholder-label{font:700 0.95rem/1.2 var(--site-heading-font,inherit);letter-spacing:0.01em;color:var(--token-color-ink,#111)}
.site-builder-node--section-embed-placeholder-note{font:500 0.82rem/1.4 var(--site-body-font,inherit);color:rgba(18,18,18,0.58)}
.site-builder-node--live-talent-grid{display:grid;grid-template-columns:repeat(var(--bn-live-columns,4),minmax(0,1fr));gap:var(--bn-gap,1.25rem);width:100%}
.site-builder-node--live-chip-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:0.75rem;width:100%}
.site-builder-node--live-chip{display:inline-flex;align-items:center;gap:0.5rem;border:1px solid rgba(18,18,18,0.16);background:#fff;color:#111;padding:0.75rem 1rem;text-decoration:none}
.site-builder-node--live-chip strong{font-weight:700}
.site-builder-node--live-chip span{color:rgba(18,18,18,0.58);font-size:0.82rem}
.site-builder-node--live-search-shell{display:flex;width:min(100%,680px);align-items:center;justify-content:space-between;gap:1rem;border:1px solid rgba(18,18,18,0.16);background:#fff;padding:0.75rem 0.75rem 0.75rem 1rem}
.site-builder-node--live-search-shell span{color:rgba(18,18,18,0.58)}
.site-builder-node--button{display:inline-flex;width:fit-content;align-items:center;justify-content:center;border:1px solid color-mix(in oklab,var(--token-color-ink,#111) 18%,transparent);border-radius:999px;padding:0.85rem 1.6rem;font-size:0.82rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;transition:background-color .16s ease,color .16s ease,border-color .16s ease,transform .2s ease}
.site-builder-node--button:hover{transform:translateY(-2px)}
@media (prefers-reduced-motion:reduce){.site-builder-node--button{transition:none}.site-builder-node--button:hover{transform:none}}
.site-builder-node--button[data-builder-button-tone="primary"]{background:var(--token-color-primary,var(--token-color-ink,#111));color:var(--token-color-surface-raised,#fff)}
.site-builder-node--button[data-builder-button-tone="secondary"]{background:transparent;color:var(--token-color-primary,var(--token-color-ink,#111))}
.site-builder-node--button[data-builder-button-hover-tone="primary"]:hover,.site-builder-node--button[data-builder-button-focus-tone="primary"]:focus-visible,.site-builder-node--button[data-builder-button-active-tone="primary"]:active{background:var(--token-color-primary,var(--token-color-ink,#111))!important;color:var(--token-color-surface-raised,#fff)!important;border-color:var(--token-color-primary,var(--token-color-ink,#111))!important}
.site-builder-node--button[data-builder-button-hover-tone="secondary"]:hover,.site-builder-node--button[data-builder-button-focus-tone="secondary"]:focus-visible,.site-builder-node--button[data-builder-button-active-tone="secondary"]:active{background:transparent!important;color:var(--token-color-primary,var(--token-color-ink,#111))!important;border-color:color-mix(in oklab,var(--token-color-ink,#111) 28%,transparent)!important}
.site-builder-node--button[data-builder-button-disabled-tone="secondary"][aria-disabled="true"]{background:transparent;color:rgba(18,18,18,0.42);border-color:rgba(18,18,18,0.16);pointer-events:none}
.site-builder-node--button[data-builder-button-disabled-tone="primary"][aria-disabled="true"]{background:rgba(18,18,18,0.35);color:#fff;border-color:rgba(18,18,18,0.08);pointer-events:none}
.site-builder-node--heading{align-self:stretch;font-family:var(--site-heading-font,inherit);color:var(--token-color-ink,inherit)}
.site-builder-node--paragraph{align-self:stretch;font-family:var(--site-body-font,inherit)}
.site-builder-node--video{display:block;width:100%;max-width:100%;background:#000}
.site-builder-node--embed{display:block;width:100%;max-width:100%;border:0;background:#000}
.site-builder-node--icon{display:inline-flex;align-items:center;justify-content:center;color:currentColor;line-height:1}
.site-builder-node--pricing-table{width:100%;max-width:1120px;margin:0 auto;display:grid;grid-template-columns:repeat(var(--bn-pricing-columns,3),minmax(0,1fr));gap:var(--bn-gap,1.25rem);align-items:stretch}
.site-builder-node--pricing-tier{display:flex;min-width:0;flex-direction:column;gap:1rem;border:1px solid rgba(18,18,18,0.14);background:#fff;padding:1.25rem}
.site-builder-node--pricing-tier[data-builder-pricing-highlighted="true"]{border-color:var(--token-color-primary,var(--token-color-ink,#111));box-shadow:0 14px 36px rgba(18,18,18,0.12)}
.site-builder-node--pricing-tier-header{display:grid;gap:0.4rem}
.site-builder-node--pricing-tier-title{margin:0;font-size:1rem;font-weight:800;line-height:1.15;color:var(--token-color-ink,#111)}
.site-builder-node--pricing-tier-description{margin:0;color:rgba(18,18,18,0.66);font-size:0.92rem;line-height:1.5}
.site-builder-node--pricing-price{display:flex;align-items:baseline;gap:0.35rem;color:var(--token-color-ink,#111)}
.site-builder-node--pricing-price strong{font-size:clamp(2rem,4vw,3.2rem);line-height:0.95}
.site-builder-node--pricing-period{color:rgba(18,18,18,0.58);font-size:0.9rem}
.site-builder-node--pricing-features{display:grid;gap:0.6rem;margin:0;padding:0;list-style:none}
.site-builder-node--pricing-feature{display:grid;grid-template-columns:1.2rem minmax(0,1fr);gap:0.55rem;align-items:start;color:rgba(18,18,18,0.78);font-size:0.92rem;line-height:1.45}
.site-builder-node--pricing-feature[data-builder-feature-included="false"]{color:rgba(18,18,18,0.42)}
.site-builder-node--pricing-feature-mark{font-weight:800;color:var(--token-color-primary,var(--token-color-ink,#111))}
.site-builder-node--pricing-feature[data-builder-feature-included="false"] .site-builder-node--pricing-feature-mark{color:rgba(18,18,18,0.34)}
.site-builder-node--pricing-cta{margin-top:auto;display:inline-flex;width:100%;align-items:center;justify-content:center;border:1px solid var(--token-color-primary,var(--token-color-ink,#111));border-radius:999px;background:var(--token-color-primary,var(--token-color-ink,#111));color:var(--token-color-surface-raised,#fff);padding:0.8rem 1rem;font-weight:800;text-align:center;text-decoration:none}
.site-builder-node--code{display:block;width:100%;max-width:100%;margin:0 auto;border:0;background:transparent;box-sizing:border-box}
.site-builder-node--rich-text{width:100%;max-width:100%;font-family:var(--site-body-font,inherit)}
.site-builder-node--rich-text .site-link{color:inherit;text-decoration:underline;text-underline-offset:0.16em}
.site-builder-node[data-builder-style-size="sm"]{font-size:${TEXT_SIZE_CLAMP.sm}}
.site-builder-node[data-builder-style-size="md"]{font-size:${TEXT_SIZE_CLAMP.md}}
.site-builder-node[data-builder-style-size="lg"]{font-size:${TEXT_SIZE_CLAMP.lg}}
.site-builder-node[data-builder-style-size="xl"]{font-size:${TEXT_SIZE_CLAMP.xl}}
.site-builder-node[data-builder-style-size="display"]{font-size:${TEXT_SIZE_CLAMP.display}}
.site-builder-node--paragraph[data-builder-style-size="lg"]{font-size:${TEXT_SIZE_CLAMP_PARAGRAPH.lg}}
.site-builder-node--paragraph[data-builder-style-size="xl"]{font-size:${TEXT_SIZE_CLAMP_PARAGRAPH.xl}}
.site-builder-node--paragraph[data-builder-style-size="display"]{font-size:${TEXT_SIZE_CLAMP_PARAGRAPH.display}}
.site-builder-node[data-builder-style-transition]{transition-property:var(--bn-transition-property,all);transition-duration:var(--bn-transition-duration,.2s);transition-timing-function:var(--bn-transition-timing-function,ease);transition-delay:var(--bn-transition-delay,0s)}
.site-builder-node[data-builder-style-hover-bg]:hover,.site-builder-node[data-builder-style-hover-bg]:focus-visible{background-color:var(--bn-hover-bg)!important}
.site-builder-node[data-builder-style-hover-color]:hover,.site-builder-node[data-builder-style-hover-color]:focus-visible{color:var(--bn-hover-color)!important}
.site-builder-node[data-builder-style-hover-border-color]:hover,.site-builder-node[data-builder-style-hover-border-color]:focus-visible{border-color:var(--bn-hover-border-color)!important}
.site-builder-node[data-builder-style-hover-shadow]:hover,.site-builder-node[data-builder-style-hover-shadow]:focus-visible{box-shadow:var(--bn-hover-shadow)!important}
.site-builder-node[data-builder-style-hover-scale]:hover,.site-builder-node[data-builder-style-hover-scale]:focus-visible{scale:var(--bn-hover-scale)!important}
.site-builder-node[data-builder-style-hover-translate]:hover,.site-builder-node[data-builder-style-hover-translate]:focus-visible{translate:var(--bn-hover-translate)!important}
.site-builder-node[data-builder-style-hover-opacity]:hover,.site-builder-node[data-builder-style-hover-opacity]:focus-visible{opacity:var(--bn-hover-opacity)!important}
.site-builder-node[data-builder-style-focus-bg]:focus-visible{background-color:var(--bn-focus-bg)!important}
.site-builder-node[data-builder-style-focus-color]:focus-visible{color:var(--bn-focus-color)!important}
.site-builder-node[data-builder-style-focus-border-color]:focus-visible{border-color:var(--bn-focus-border-color)!important}
.site-builder-node[data-builder-style-focus-shadow]:focus-visible{box-shadow:var(--bn-focus-shadow)!important}
.site-builder-node[data-builder-style-focus-scale]:focus-visible{scale:var(--bn-focus-scale)!important}
.site-builder-node[data-builder-style-focus-translate]:focus-visible{translate:var(--bn-focus-translate)!important}
.site-builder-node[data-builder-style-focus-opacity]:focus-visible{opacity:var(--bn-focus-opacity)!important}
.site-builder-node[data-builder-style-active-bg]:active{background-color:var(--bn-active-bg)!important}
.site-builder-node[data-builder-style-active-color]:active{color:var(--bn-active-color)!important}
.site-builder-node[data-builder-style-active-border-color]:active{border-color:var(--bn-active-border-color)!important}
.site-builder-node[data-builder-style-active-shadow]:active{box-shadow:var(--bn-active-shadow)!important}
.site-builder-node[data-builder-style-active-scale]:active{scale:var(--bn-active-scale)!important}
.site-builder-node[data-builder-style-active-translate]:active{translate:var(--bn-active-translate)!important}
.site-builder-node[data-builder-style-active-opacity]:active{opacity:var(--bn-active-opacity)!important}
@media (max-width:900px){
  .site-builder-node[data-builder-style-tablet-align]{text-align:var(--bn-tablet-align)!important}
  .site-builder-node[data-builder-style-tablet-size="sm"]{font-size:clamp(0.9rem,1vw,1rem)!important}
  .site-builder-node[data-builder-style-tablet-size="md"]{font-size:clamp(1rem,1.3vw,1.25rem)!important}
  .site-builder-node[data-builder-style-tablet-size="lg"]{font-size:clamp(1.35rem,2vw,2.25rem)!important}
  .site-builder-node[data-builder-style-tablet-size="xl"]{font-size:clamp(2rem,4vw,4.5rem)!important}
  .site-builder-node[data-builder-style-tablet-size="display"]{font-size:clamp(3.5rem,6vw,6rem)!important}
  .site-builder-node--paragraph[data-builder-style-tablet-size="lg"]{font-size:clamp(1.1rem,1.45vw,1.45rem)!important}
  .site-builder-node--paragraph[data-builder-style-tablet-size="xl"]{font-size:clamp(1.25rem,1.8vw,1.8rem)!important}
  .site-builder-node--paragraph[data-builder-style-tablet-size="display"]{font-size:clamp(2rem,4vw,4.5rem)!important}
  .site-builder-node[data-builder-style-tablet-tone]{color:var(--bn-tablet-color)!important}
  .site-builder-node[data-builder-style-tablet-width]{max-width:var(--bn-tablet-max-width)!important}
  .site-builder-node[data-builder-style-tablet-margin-top]{margin-top:var(--bn-tablet-margin-top)!important}
  .site-builder-node[data-builder-style-tablet-margin-bottom]{margin-bottom:var(--bn-tablet-margin-bottom)!important}
  .site-builder-node[data-builder-style-tablet-padding-x]{padding-left:var(--bn-tablet-padding-x)!important;padding-right:var(--bn-tablet-padding-x)!important}
  .site-builder-node[data-builder-style-tablet-padding-y]{padding-top:var(--bn-tablet-padding-y)!important;padding-bottom:var(--bn-tablet-padding-y)!important}
  .site-builder-node[data-builder-style-tablet-background]{background:var(--bn-tablet-background)!important}
  .site-builder-node[data-builder-style-tablet-radius]{border-radius:var(--bn-tablet-radius)!important}
  .site-builder-node[data-builder-style-tablet-fit]{object-fit:var(--bn-tablet-fit)!important}
  .site-builder-node[data-builder-style-tablet-object-position]{object-position:var(--bn-tablet-object-position)!important}
  .site-builder-node[data-builder-style-tablet-ratio]{aspect-ratio:var(--bn-tablet-ratio)!important}
  .site-builder-node[data-builder-style-tablet-aspect-free]{aspect-ratio:var(--bn-tablet-aspect-free)!important}
  .site-builder-node[data-builder-style-tablet-hidden]{display:none!important}
  .site-builder-node[data-builder-style-tablet-font-family]{font-family:var(--bn-tablet-font-family)!important}
  .site-builder-node[data-builder-style-tablet-font-size]{font-size:var(--bn-tablet-font-size)!important}
  .site-builder-node[data-builder-style-tablet-font-weight]{font-weight:var(--bn-tablet-font-weight)!important}
  .site-builder-node[data-builder-style-tablet-line-height]{line-height:var(--bn-tablet-line-height)!important}
  .site-builder-node[data-builder-style-tablet-letter-spacing]{letter-spacing:var(--bn-tablet-letter-spacing)!important}
  .site-builder-node[data-builder-style-tablet-text-transform]{text-transform:var(--bn-tablet-text-transform)!important}
  .site-builder-node[data-builder-style-tablet-font-style]{font-style:var(--bn-tablet-font-style)!important}
  .site-builder-node[data-builder-style-tablet-text-decoration]{text-decoration:var(--bn-tablet-text-decoration)!important}
  .site-builder-node[data-builder-style-tablet-text-color]{color:var(--bn-tablet-text-color)!important}
  .site-builder-node[data-builder-style-tablet-bg-color]{background-color:var(--bn-tablet-bg-color)!important}
  .site-builder-node[data-builder-style-tablet-border-color]{border-color:var(--bn-tablet-border-color)!important}
  .site-builder-node[data-builder-style-tablet-border-width]{border-width:var(--bn-tablet-border-width)!important}
  .site-builder-node[data-builder-style-tablet-border-style]{border-style:var(--bn-tablet-border-style)!important}
  .site-builder-node[data-builder-style-tablet-free-width]{width:var(--bn-tablet-free-width)!important}
  .site-builder-node[data-builder-style-tablet-height]{height:var(--bn-tablet-height)!important}
  .site-builder-node[data-builder-style-tablet-min-height]{min-height:var(--bn-tablet-min-height)!important}
  .site-builder-node[data-builder-style-tablet-min-width]{min-width:var(--bn-tablet-min-width)!important}
  .site-builder-node[data-builder-style-tablet-max-width-free]{max-width:var(--bn-tablet-max-width-free)!important}
  .site-builder-node[data-builder-style-tablet-max-height]{max-height:var(--bn-tablet-max-height)!important}
  .site-builder-node[data-builder-style-tablet-padding-top]{padding-top:var(--bn-tablet-padding-top)!important}
  .site-builder-node[data-builder-style-tablet-padding-right]{padding-right:var(--bn-tablet-padding-right)!important}
  .site-builder-node[data-builder-style-tablet-padding-bottom]{padding-bottom:var(--bn-tablet-padding-bottom)!important}
  .site-builder-node[data-builder-style-tablet-padding-left]{padding-left:var(--bn-tablet-padding-left)!important}
  .site-builder-node[data-builder-style-tablet-margin-top-free]{margin-top:var(--bn-tablet-margin-top-free)!important}
  .site-builder-node[data-builder-style-tablet-margin-right-free]{margin-right:var(--bn-tablet-margin-right-free)!important}
  .site-builder-node[data-builder-style-tablet-margin-bottom-free]{margin-bottom:var(--bn-tablet-margin-bottom-free)!important}
  .site-builder-node[data-builder-style-tablet-margin-left-free]{margin-left:var(--bn-tablet-margin-left-free)!important}
  .site-builder-node[data-builder-style-tablet-shadow]{box-shadow:var(--bn-tablet-shadow)!important}
  .site-builder-node[data-builder-style-tablet-text-shadow]{text-shadow:var(--bn-tablet-text-shadow)!important}
  .site-builder-node[data-builder-style-tablet-bg-image]{background-image:var(--bn-tablet-bg-image)!important}
  .site-builder-node[data-builder-style-tablet-opacity]{opacity:var(--bn-tablet-opacity)!important}
  .site-builder-node[data-builder-style-tablet-radius-free]{border-radius:var(--bn-tablet-radius-free)!important}
  .site-builder-node[data-builder-style-tablet-gap-free]{--bn-gap:var(--bn-tablet-gap-free)!important}
  .site-builder-node[data-builder-style-tablet-position]{position:var(--bn-tablet-position)!important}
  .site-builder-node[data-builder-style-tablet-inset-top]{top:var(--bn-tablet-inset-top)!important}
  .site-builder-node[data-builder-style-tablet-inset-right]{right:var(--bn-tablet-inset-right)!important}
  .site-builder-node[data-builder-style-tablet-inset-bottom]{bottom:var(--bn-tablet-inset-bottom)!important}
  .site-builder-node[data-builder-style-tablet-inset-left]{left:var(--bn-tablet-inset-left)!important}
  .site-builder-node[data-builder-style-tablet-z-index]{z-index:var(--bn-tablet-z-index)!important}
  .site-builder-node[data-builder-style-tablet-overflow]{overflow:var(--bn-tablet-overflow)!important}
  .site-builder-node[data-builder-style-tablet-rotate]{rotate:var(--bn-tablet-rotate)!important}
  .site-builder-node[data-builder-style-tablet-scale]{scale:var(--bn-tablet-scale)!important}
  .site-builder-node[data-builder-style-tablet-translate]{translate:var(--bn-tablet-translate)!important}
  .site-builder-node[data-builder-style-tablet-transform-origin]{transform-origin:var(--bn-tablet-transform-origin)!important}
  .site-builder-node[data-builder-style-tablet-align-self]{align-self:var(--bn-tablet-align-self)!important}
  .site-builder-node[data-builder-style-tablet-flex-grow]{flex-grow:var(--bn-tablet-flex-grow)!important}
  .site-builder-node[data-builder-style-tablet-flex-shrink]{flex-shrink:var(--bn-tablet-flex-shrink)!important}
  .site-builder-node[data-builder-style-tablet-flex-basis]{flex-basis:var(--bn-tablet-flex-basis)!important}
  .site-builder-node[data-builder-style-tablet-grid-column]{grid-column:var(--bn-tablet-grid-column)!important}
  .site-builder-node[data-builder-style-tablet-grid-row]{grid-row:var(--bn-tablet-grid-row)!important}
  .site-builder-node[data-builder-style-tablet-order]{order:var(--bn-tablet-order)!important}
  .site-builder-node[data-builder-style-tablet-filter]{filter:var(--bn-tablet-filter)!important}
  .site-builder-node[data-builder-style-tablet-backdrop-filter]{backdrop-filter:var(--bn-tablet-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-tablet-backdrop-filter)!important}
  .site-builder-node[data-builder-style-tablet-mix-blend-mode]{mix-blend-mode:var(--bn-tablet-mix-blend-mode)!important}
  .site-builder-node[data-builder-style-tablet-justify-content]{justify-content:var(--bn-tablet-justify-content)!important}
  .site-builder-node[data-builder-style-tablet-align-items]{align-items:var(--bn-tablet-align-items)!important}
  .site-builder-node[data-builder-style-tablet-flex-wrap]{flex-wrap:var(--bn-tablet-flex-wrap)!important}
  .site-builder-node[data-builder-style-tablet-grid-template-columns]{grid-template-columns:var(--bn-tablet-grid-template-columns)!important}
  .site-builder-node[data-builder-style-tablet-grid-template-rows]{grid-template-rows:var(--bn-tablet-grid-template-rows)!important}
  .site-builder-node[data-builder-style-tablet-grid-auto-flow]{grid-auto-flow:var(--bn-tablet-grid-auto-flow)!important}
  .site-builder-node[data-builder-style-tablet-clip-path]{clip-path:var(--bn-tablet-clip-path)!important;-webkit-clip-path:var(--bn-tablet-clip-path)!important}
  .site-builder-node[data-builder-style-tablet-mask-image]{mask-image:var(--bn-tablet-mask-image)!important;-webkit-mask-image:var(--bn-tablet-mask-image)!important}
  .site-builder-node[data-builder-style-tablet-text-stroke]{-webkit-text-stroke:var(--bn-tablet-text-stroke)!important}
  .site-builder-node[data-builder-style-tablet-cursor]{cursor:var(--bn-tablet-cursor)!important}
  .site-builder-node[data-builder-style-tablet-user-select]{user-select:var(--bn-tablet-user-select)!important;-webkit-user-select:var(--bn-tablet-user-select)!important}
  .site-builder-node[data-builder-style-tablet-pointer-events]{pointer-events:var(--bn-tablet-pointer-events)!important}
  .site-builder-node[data-builder-style-tablet-scroll-snap-type]{scroll-snap-type:var(--bn-tablet-scroll-snap-type)!important}
  .site-builder-node[data-builder-style-tablet-scroll-snap-align]{scroll-snap-align:var(--bn-tablet-scroll-snap-align)!important}
  .site-builder-node[data-builder-style-tablet-outline]{outline:var(--bn-tablet-outline)!important}
  .site-builder-node[data-builder-style-tablet-outline-offset]{outline-offset:var(--bn-tablet-outline-offset)!important}
  .site-builder-node[data-builder-style-tablet-accent-color]{accent-color:var(--bn-tablet-accent-color)!important}
  .site-builder-node[data-builder-style-tablet-caret-color]{caret-color:var(--bn-tablet-caret-color)!important}
  .site-builder-node[data-builder-style-tablet-transition]{transition-property:var(--bn-tablet-transition-property,var(--bn-transition-property,all))!important;transition-duration:var(--bn-tablet-transition-duration,var(--bn-transition-duration,.2s))!important;transition-timing-function:var(--bn-tablet-transition-timing-function,var(--bn-transition-timing-function,ease))!important;transition-delay:var(--bn-tablet-transition-delay,var(--bn-transition-delay,0s))!important}
  .site-builder-node--container[data-builder-tablet-layout="stack"]{display:flex;flex-direction:column}
  .site-builder-node--container[data-builder-tablet-layout="row"]{display:flex;flex-direction:row;flex-wrap:wrap}
  .site-builder-node--container[data-builder-tablet-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-tablet-columns,var(--bn-columns,2)),minmax(0,1fr))}
  .site-builder-node--container[data-builder-tablet-display="grid"]{display:grid;grid-template-columns:repeat(var(--bn-tablet-columns,var(--bn-columns,2)),minmax(0,1fr));overflow-x:visible}
  .site-builder-node--container[data-builder-tablet-display="grid"] > *{flex:initial;scroll-snap-align:none}
  .site-builder-node--container[data-builder-tablet-display="slider"]{display:flex;flex-direction:row;flex-wrap:nowrap;gap:var(--bn-slider-gap,var(--bn-gap,16px));overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
  .site-builder-node--container[data-builder-tablet-display="slider"] > *{flex:0 0 calc((100% - (var(--bn-tablet-items-per-view,var(--bn-items-per-view,3)) - 1) * var(--bn-slider-gap,var(--bn-gap,16px))) / var(--bn-tablet-items-per-view,var(--bn-items-per-view,3)));min-width:0;scroll-snap-align:start}
  .site-builder-node--live-talent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .site-builder-node--carousel-slide{flex-basis:calc(100% / var(--bn-tablet-slides,2))}
  .site-builder-node--masonry{column-count:var(--bn-tablet-columns,2)}
}
@media (max-width:640px){
  .site-builder-node[data-builder-style-mobile-align]{text-align:var(--bn-mobile-align)!important}
  .site-builder-node[data-builder-style-mobile-size="sm"]{font-size:clamp(0.9rem,1vw,1rem)!important}
  .site-builder-node[data-builder-style-mobile-size="md"]{font-size:clamp(1rem,1.3vw,1.25rem)!important}
  .site-builder-node[data-builder-style-mobile-size="lg"]{font-size:clamp(1.35rem,2vw,2.25rem)!important}
  .site-builder-node[data-builder-style-mobile-size="xl"]{font-size:clamp(2rem,4vw,4.5rem)!important}
  .site-builder-node[data-builder-style-mobile-size="display"]{font-size:clamp(3.5rem,6vw,6rem)!important}
  .site-builder-node--paragraph[data-builder-style-mobile-size="lg"]{font-size:clamp(1.1rem,1.45vw,1.45rem)!important}
  .site-builder-node--paragraph[data-builder-style-mobile-size="xl"]{font-size:clamp(1.25rem,1.8vw,1.8rem)!important}
  .site-builder-node--paragraph[data-builder-style-mobile-size="display"]{font-size:clamp(2rem,4vw,4.5rem)!important}
  .site-builder-node[data-builder-style-mobile-tone]{color:var(--bn-mobile-color)!important}
  .site-builder-node[data-builder-style-mobile-width]{max-width:var(--bn-mobile-max-width)!important}
  .site-builder-node[data-builder-style-mobile-margin-top]{margin-top:var(--bn-mobile-margin-top)!important}
  .site-builder-node[data-builder-style-mobile-margin-bottom]{margin-bottom:var(--bn-mobile-margin-bottom)!important}
  .site-builder-node[data-builder-style-mobile-padding-x]{padding-left:var(--bn-mobile-padding-x)!important;padding-right:var(--bn-mobile-padding-x)!important}
  .site-builder-node[data-builder-style-mobile-padding-y]{padding-top:var(--bn-mobile-padding-y)!important;padding-bottom:var(--bn-mobile-padding-y)!important}
  .site-builder-node[data-builder-style-mobile-background]{background:var(--bn-mobile-background)!important}
  .site-builder-node[data-builder-style-mobile-radius]{border-radius:var(--bn-mobile-radius)!important}
  .site-builder-node[data-builder-style-mobile-fit]{object-fit:var(--bn-mobile-fit)!important}
  .site-builder-node[data-builder-style-mobile-object-position]{object-position:var(--bn-mobile-object-position)!important}
  .site-builder-node[data-builder-style-mobile-ratio]{aspect-ratio:var(--bn-mobile-ratio)!important}
  .site-builder-node[data-builder-style-mobile-aspect-free]{aspect-ratio:var(--bn-mobile-aspect-free)!important}
  .site-builder-node[data-builder-style-mobile-hidden]{display:none!important}
  .site-builder-node[data-builder-style-mobile-font-family]{font-family:var(--bn-mobile-font-family)!important}
  .site-builder-node[data-builder-style-mobile-font-size]{font-size:var(--bn-mobile-font-size)!important}
  .site-builder-node[data-builder-style-mobile-font-weight]{font-weight:var(--bn-mobile-font-weight)!important}
  .site-builder-node[data-builder-style-mobile-line-height]{line-height:var(--bn-mobile-line-height)!important}
  .site-builder-node[data-builder-style-mobile-letter-spacing]{letter-spacing:var(--bn-mobile-letter-spacing)!important}
  .site-builder-node[data-builder-style-mobile-text-transform]{text-transform:var(--bn-mobile-text-transform)!important}
  .site-builder-node[data-builder-style-mobile-font-style]{font-style:var(--bn-mobile-font-style)!important}
  .site-builder-node[data-builder-style-mobile-text-decoration]{text-decoration:var(--bn-mobile-text-decoration)!important}
  .site-builder-node[data-builder-style-mobile-text-color]{color:var(--bn-mobile-text-color)!important}
  .site-builder-node[data-builder-style-mobile-bg-color]{background-color:var(--bn-mobile-bg-color)!important}
  .site-builder-node[data-builder-style-mobile-border-color]{border-color:var(--bn-mobile-border-color)!important}
  .site-builder-node[data-builder-style-mobile-border-width]{border-width:var(--bn-mobile-border-width)!important}
  .site-builder-node[data-builder-style-mobile-border-style]{border-style:var(--bn-mobile-border-style)!important}
  .site-builder-node[data-builder-style-mobile-free-width]{width:var(--bn-mobile-free-width)!important}
  .site-builder-node[data-builder-style-mobile-height]{height:var(--bn-mobile-height)!important}
  .site-builder-node[data-builder-style-mobile-min-height]{min-height:var(--bn-mobile-min-height)!important}
  .site-builder-node[data-builder-style-mobile-min-width]{min-width:var(--bn-mobile-min-width)!important}
  .site-builder-node[data-builder-style-mobile-max-width-free]{max-width:var(--bn-mobile-max-width-free)!important}
  .site-builder-node[data-builder-style-mobile-max-height]{max-height:var(--bn-mobile-max-height)!important}
  .site-builder-node[data-builder-style-mobile-padding-top]{padding-top:var(--bn-mobile-padding-top)!important}
  .site-builder-node[data-builder-style-mobile-padding-right]{padding-right:var(--bn-mobile-padding-right)!important}
  .site-builder-node[data-builder-style-mobile-padding-bottom]{padding-bottom:var(--bn-mobile-padding-bottom)!important}
  .site-builder-node[data-builder-style-mobile-padding-left]{padding-left:var(--bn-mobile-padding-left)!important}
  .site-builder-node[data-builder-style-mobile-margin-top-free]{margin-top:var(--bn-mobile-margin-top-free)!important}
  .site-builder-node[data-builder-style-mobile-margin-right-free]{margin-right:var(--bn-mobile-margin-right-free)!important}
  .site-builder-node[data-builder-style-mobile-margin-bottom-free]{margin-bottom:var(--bn-mobile-margin-bottom-free)!important}
  .site-builder-node[data-builder-style-mobile-margin-left-free]{margin-left:var(--bn-mobile-margin-left-free)!important}
  .site-builder-node[data-builder-style-mobile-shadow]{box-shadow:var(--bn-mobile-shadow)!important}
  .site-builder-node[data-builder-style-mobile-text-shadow]{text-shadow:var(--bn-mobile-text-shadow)!important}
  .site-builder-node[data-builder-style-mobile-bg-image]{background-image:var(--bn-mobile-bg-image)!important}
  .site-builder-node[data-builder-style-mobile-opacity]{opacity:var(--bn-mobile-opacity)!important}
  .site-builder-node[data-builder-style-mobile-radius-free]{border-radius:var(--bn-mobile-radius-free)!important}
  .site-builder-node[data-builder-style-mobile-gap-free]{--bn-gap:var(--bn-mobile-gap-free)!important}
  .site-builder-node[data-builder-style-mobile-position]{position:var(--bn-mobile-position)!important}
  .site-builder-node[data-builder-style-mobile-inset-top]{top:var(--bn-mobile-inset-top)!important}
  .site-builder-node[data-builder-style-mobile-inset-right]{right:var(--bn-mobile-inset-right)!important}
  .site-builder-node[data-builder-style-mobile-inset-bottom]{bottom:var(--bn-mobile-inset-bottom)!important}
  .site-builder-node[data-builder-style-mobile-inset-left]{left:var(--bn-mobile-inset-left)!important}
  .site-builder-node[data-builder-style-mobile-z-index]{z-index:var(--bn-mobile-z-index)!important}
  .site-builder-node[data-builder-style-mobile-overflow]{overflow:var(--bn-mobile-overflow)!important}
  .site-builder-node[data-builder-style-mobile-rotate]{rotate:var(--bn-mobile-rotate)!important}
  .site-builder-node[data-builder-style-mobile-scale]{scale:var(--bn-mobile-scale)!important}
  .site-builder-node[data-builder-style-mobile-translate]{translate:var(--bn-mobile-translate)!important}
  .site-builder-node[data-builder-style-mobile-transform-origin]{transform-origin:var(--bn-mobile-transform-origin)!important}
  .site-builder-node[data-builder-style-mobile-align-self]{align-self:var(--bn-mobile-align-self)!important}
  .site-builder-node[data-builder-style-mobile-flex-grow]{flex-grow:var(--bn-mobile-flex-grow)!important}
  .site-builder-node[data-builder-style-mobile-flex-shrink]{flex-shrink:var(--bn-mobile-flex-shrink)!important}
  .site-builder-node[data-builder-style-mobile-flex-basis]{flex-basis:var(--bn-mobile-flex-basis)!important}
  .site-builder-node[data-builder-style-mobile-grid-column]{grid-column:var(--bn-mobile-grid-column)!important}
  .site-builder-node[data-builder-style-mobile-grid-row]{grid-row:var(--bn-mobile-grid-row)!important}
  .site-builder-node[data-builder-style-mobile-order]{order:var(--bn-mobile-order)!important}
  .site-builder-node[data-builder-style-mobile-filter]{filter:var(--bn-mobile-filter)!important}
  .site-builder-node[data-builder-style-mobile-backdrop-filter]{backdrop-filter:var(--bn-mobile-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-mobile-backdrop-filter)!important}
  .site-builder-node[data-builder-style-mobile-mix-blend-mode]{mix-blend-mode:var(--bn-mobile-mix-blend-mode)!important}
  .site-builder-node[data-builder-style-mobile-justify-content]{justify-content:var(--bn-mobile-justify-content)!important}
  .site-builder-node[data-builder-style-mobile-align-items]{align-items:var(--bn-mobile-align-items)!important}
  .site-builder-node[data-builder-style-mobile-flex-wrap]{flex-wrap:var(--bn-mobile-flex-wrap)!important}
  .site-builder-node[data-builder-style-mobile-grid-template-columns]{grid-template-columns:var(--bn-mobile-grid-template-columns)!important}
  .site-builder-node[data-builder-style-mobile-grid-template-rows]{grid-template-rows:var(--bn-mobile-grid-template-rows)!important}
  .site-builder-node[data-builder-style-mobile-grid-auto-flow]{grid-auto-flow:var(--bn-mobile-grid-auto-flow)!important}
  .site-builder-node[data-builder-style-mobile-clip-path]{clip-path:var(--bn-mobile-clip-path)!important;-webkit-clip-path:var(--bn-mobile-clip-path)!important}
  .site-builder-node[data-builder-style-mobile-mask-image]{mask-image:var(--bn-mobile-mask-image)!important;-webkit-mask-image:var(--bn-mobile-mask-image)!important}
  .site-builder-node[data-builder-style-mobile-text-stroke]{-webkit-text-stroke:var(--bn-mobile-text-stroke)!important}
  .site-builder-node[data-builder-style-mobile-cursor]{cursor:var(--bn-mobile-cursor)!important}
  .site-builder-node[data-builder-style-mobile-user-select]{user-select:var(--bn-mobile-user-select)!important;-webkit-user-select:var(--bn-mobile-user-select)!important}
  .site-builder-node[data-builder-style-mobile-pointer-events]{pointer-events:var(--bn-mobile-pointer-events)!important}
  .site-builder-node[data-builder-style-mobile-scroll-snap-type]{scroll-snap-type:var(--bn-mobile-scroll-snap-type)!important}
  .site-builder-node[data-builder-style-mobile-scroll-snap-align]{scroll-snap-align:var(--bn-mobile-scroll-snap-align)!important}
  .site-builder-node[data-builder-style-mobile-outline]{outline:var(--bn-mobile-outline)!important}
  .site-builder-node[data-builder-style-mobile-outline-offset]{outline-offset:var(--bn-mobile-outline-offset)!important}
  .site-builder-node[data-builder-style-mobile-accent-color]{accent-color:var(--bn-mobile-accent-color)!important}
  .site-builder-node[data-builder-style-mobile-caret-color]{caret-color:var(--bn-mobile-caret-color)!important}
  .site-builder-node[data-builder-style-mobile-transition]{transition-property:var(--bn-mobile-transition-property,var(--bn-transition-property,all))!important;transition-duration:var(--bn-mobile-transition-duration,var(--bn-transition-duration,.2s))!important;transition-timing-function:var(--bn-mobile-transition-timing-function,var(--bn-transition-timing-function,ease))!important;transition-delay:var(--bn-mobile-transition-delay,var(--bn-transition-delay,0s))!important}
  .site-builder-node--container{align-items:stretch}
  .site-builder-node--container[data-builder-mobile-layout="stack"],.site-builder-node--container:not([data-builder-mobile-layout]){display:flex;flex-direction:column}
  .site-builder-node--container[data-builder-mobile-layout="row"]{display:flex;flex-direction:row;flex-wrap:wrap}
  .site-builder-node--container[data-builder-mobile-layout="grid"]{display:grid;grid-template-columns:repeat(var(--bn-mobile-columns,1),minmax(0,1fr))}
  .site-builder-node--container[data-builder-mobile-display="grid"]{display:grid;grid-template-columns:repeat(var(--bn-mobile-columns,var(--bn-columns,1)),minmax(0,1fr));overflow-x:visible}
  .site-builder-node--container[data-builder-mobile-display="grid"] > *{flex:initial;scroll-snap-align:none}
  .site-builder-node--container[data-builder-mobile-display="slider"]{display:flex;flex-direction:row;flex-wrap:nowrap;gap:var(--bn-slider-gap,var(--bn-gap,16px));overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
  .site-builder-node--container[data-builder-mobile-display="slider"] > *{flex:0 0 calc((100% - (var(--bn-mobile-items-per-view,var(--bn-items-per-view,1)) - 1) * var(--bn-slider-gap,var(--bn-gap,16px))) / var(--bn-mobile-items-per-view,var(--bn-items-per-view,1)));min-width:0;scroll-snap-align:start}
  .site-builder-node--live-talent-grid{grid-template-columns:1fr}
  .site-builder-node--live-search-shell{align-items:stretch;flex-direction:column}
  .site-builder-node--split[data-builder-collapse-mobile="true"]{grid-template-columns:1fr}
  .site-builder-node--carousel-slide{flex-basis:var(--bn-mobile-slide-width,86%)}
  .site-builder-node--masonry{column-count:var(--bn-mobile-columns,1)}
  .site-builder-node--pricing-table{grid-template-columns:1fr}
}
${BUILDER_NODE_CONTAINER_QUERY_CSS}
${BUILDER_NODE_NAV_CSS}
${BUILDER_NODE_SOCIAL_CSS}
${BUILDER_NODE_CAROUSEL_HERO_CSS}
${BUILDER_NODE_SOCIAL_FEED_CSS}
${BACKGROUND_MEDIA_CSS}
`;

/**
 * Reveal-on-view runtime (2026-06-04). A tiny inline IntersectionObserver the
 * published page injects ONCE when any node opts into `revealOnView`. It:
 *   1. ARMS every `[data-bn-reveal]` node (`data-bn-reveal-armed`) — only after
 *      arming does the sheet apply the hidden/offset pose, so a no-JS / no-IO
 *      render shows the node at rest (no flash of hidden content, SEO-safe).
 *   2. Observes each node and sets `data-bn-revealed` the first time ≥12% of it
 *      enters the viewport, then unobserves it (reveal once, never replays).
 * Skips entirely when IntersectionObserver is unavailable (leaves nodes at rest)
 * and respects prefers-reduced-motion (reveals immediately, no transition — the
 * sheet's reduced-motion guard forces the rest pose). Self-contained, no deps.
 */
const BUILDER_NODE_REVEAL_SCRIPT = `(function(){
  try{
    var nodes=document.querySelectorAll('[data-bn-reveal]');
    if(!nodes.length)return;
    var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce||typeof IntersectionObserver==='undefined'){
      for(var i=0;i<nodes.length;i++)nodes[i].setAttribute('data-bn-revealed','');
      return;
    }
    for(var j=0;j<nodes.length;j++)nodes[j].setAttribute('data-bn-reveal-armed','');
    var io=new IntersectionObserver(function(entries){
      for(var k=0;k<entries.length;k++){
        var e=entries[k];
        if(e.isIntersecting){
          e.target.setAttribute('data-bn-revealed','');
          io.unobserve(e.target);
        }
      }
    },{threshold:0.12,rootMargin:'0px 0px -8% 0px'});
    for(var m=0;m<nodes.length;m++)io.observe(nodes[m]);
  }catch(err){
    var f=document.querySelectorAll('[data-bn-reveal]');
    for(var n=0;n<f.length;n++)f[n].setAttribute('data-bn-revealed','');
  }
})();`;

/**
 * ABTEST-1 — inline experiment runtime. Injected ONCE (gated on a live
 * experiment node) by the published render path. It:
 *   1. finds every `[data-experiment]` element,
 *   2. fires ONE `experiment_view` impression per experiment id (de-duped),
 *   3. binds the conversion: a click for `data-experiment-trigger="click"`
 *      (button / cta_group) or a submit for `="submit"` (form), firing
 *      `experiment_convert` once per experiment id.
 * Both POST to the SAME `/api/analytics/events` seam with tenant_id top-level
 * (promoted to the analytics_events column server-side) and the surface tag —
 * no parallel event table. Reads tenant/surface off its own script tag's
 * data-* attrs. Pure vanilla JS, keepalive fetch, fully wrapped in try/catch so
 * a tracking failure never breaks the page.
 */
const BUILDER_NODE_EXPERIMENT_SCRIPT = `(function(){
  try{
    // Idempotency guard — the root-tree renderer emits one renderBuilderNodes
    // call per block, so this runtime can appear more than once on a page. Only
    // the FIRST instance binds; it already queries every [data-experiment] on
    // the page, so a second run would only double-count.
    if(window.__bnExperimentRuntime)return;
    window.__bnExperimentRuntime=1;
    var s=document.currentScript||document.querySelector('[data-builder-node-experiment-runtime]');
    var tenant=s&&s.getAttribute('data-tenant-id')||'';
    var surface=s&&s.getAttribute('data-surface')||'';
    var els=document.querySelectorAll('[data-experiment][data-variant]');
    if(!els.length)return;
    var sent={};
    function send(name,exp,variant,kind){
      try{
        var payload={experiment_id:exp,variant:variant,node_kind:kind};
        if(surface)payload.surface=surface;
        if(tenant)payload.tenant_id=tenant;
        var body={name:name,payload:payload,path:(location&&location.pathname)||null};
        if(tenant)body.tenant_id=tenant;
        fetch('/api/analytics/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true}).catch(function(){});
        if(window.gtag)window.gtag('event',name,payload);
      }catch(e){}
    }
    for(var i=0;i<els.length;i++){
      var el=els[i];
      var exp=el.getAttribute('data-experiment');
      var variant=el.getAttribute('data-variant');
      var trig=el.getAttribute('data-experiment-trigger');
      var kind=el.getAttribute('data-experiment-kind')||'';
      if(!exp||!variant)continue;
      var viewKey='v:'+exp;
      if(!sent[viewKey]){sent[viewKey]=1;send('experiment_view',exp,variant,kind);}
      (function(el,exp,variant,trig,kind){
        var evt=trig==='submit'?'submit':'click';
        el.addEventListener(evt,function(){
          var convKey='c:'+exp;
          if(sent[convKey])return;
          sent[convKey]=1;
          send('experiment_convert',exp,variant,kind);
        },{capture:true});
      })(el,exp,variant,trig,kind);
    }
  }catch(err){}
})();`;

function builderNodeStyleVars(
  vars: Record<string, string | number | undefined>,
): CSSProperties {
  const style: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) style[key] = value;
  }
  return style as CSSProperties;
}

function hasTransitionLonghands(style: BuilderNodeStyleValue | undefined): boolean {
  return Boolean(
    style?.transitionProperty ||
      style?.transitionDuration ||
      style?.transitionTimingFunction ||
      style?.transitionDelay,
  );
}

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Allowlist guard for inline markdown-link hrefs. Permits https:// and
 * relative / in-page targets only; rejects javascript:, data:, vbscript: and
 * any other scheme. Exported so the section-level renderInlineRich guards every
 * user-authored link at one chokepoint, not just the rich_text builder node.
 */
export function isSafeBuilderRichTextHref(value: string): boolean {
  const href = value.trim();
  if (!href || href.startsWith("//")) return false;
  if (/^https:\/\//i.test(href)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  return (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("?") ||
    href.startsWith("./") ||
    href.startsWith("../")
  );
}

export function sanitizeBuilderRichText(input: string): string {
  return input.replace(MARKDOWN_LINK_RE, (match, label: string, href: string) =>
    isSafeBuilderRichTextHref(href) ? match : label,
  );
}

const CONTAINER_QUERY_STYLE_ATTR_KEYS: ReadonlyArray<[
  keyof BuilderNodeStyleValue,
  string,
]> = [
  ["align", "align"],
  ["tone", "tone"],
  ["maxWidth", "width"],
  ["marginTop", "margin-top"],
  ["marginBottom", "margin-bottom"],
  ["paddingX", "padding-x"],
  ["paddingY", "padding-y"],
  ["background", "background"],
  ["radius", "radius"],
  ["objectFit", "fit"],
  ["objectPosition", "object-position"],
  ["aspectRatio", "ratio"],
  ["aspectRatioFree", "aspect-free"],
  ["fontFamily", "font-family"],
  ["fontSize", "font-size"],
  ["fontWeight", "font-weight"],
  ["lineHeight", "line-height"],
  ["letterSpacing", "letter-spacing"],
  ["textTransform", "text-transform"],
  ["fontStyle", "font-style"],
  ["textDecoration", "text-decoration"],
  ["textColor", "text-color"],
  ["backgroundColor", "bg-color"],
  ["borderColor", "border-color"],
  ["width", "free-width"],
  ["height", "height"],
  ["minHeight", "min-height"],
  ["minWidth", "min-width"],
  ["maxWidthFree", "max-width-free"],
  ["maxHeight", "max-height"],
  ["paddingTop", "padding-top"],
  ["paddingRight", "padding-right"],
  ["paddingBottom", "padding-bottom"],
  ["paddingLeft", "padding-left"],
  ["marginTopFree", "margin-top-free"],
  ["marginRightFree", "margin-right-free"],
  ["marginBottomFree", "margin-bottom-free"],
  ["marginLeftFree", "margin-left-free"],
  ["boxShadow", "shadow"],
  ["textShadow", "text-shadow"],
  ["backgroundImage", "bg-image"],
  ["opacity", "opacity"],
  ["borderRadius", "radius-free"],
  ["gap", "gap-free"],
  ["containerType", "container-type"],
  ["containerName", "container-name"],
  ["position", "position"],
  ["top", "inset-top"],
  ["right", "inset-right"],
  ["bottom", "inset-bottom"],
  ["left", "inset-left"],
  ["zIndex", "z-index"],
  ["overflow", "overflow"],
  ["rotate", "rotate"],
  ["scale", "scale"],
  ["translate", "translate"],
  ["transformOrigin", "transform-origin"],
  ["alignSelf", "align-self"],
  ["flexGrow", "flex-grow"],
  ["flexShrink", "flex-shrink"],
  ["flexBasis", "flex-basis"],
  ["gridColumn", "grid-column"],
  ["gridRow", "grid-row"],
  ["order", "order"],
  ["filter", "filter"],
  ["backdropFilter", "backdrop-filter"],
  ["mixBlendMode", "mix-blend-mode"],
  ["justifyContent", "justify-content"],
  ["alignItems", "align-items"],
  ["flexWrap", "flex-wrap"],
  ["gridTemplateColumns", "grid-template-columns"],
  ["gridTemplateRows", "grid-template-rows"],
  ["gridAutoFlow", "grid-auto-flow"],
  ["clipPath", "clip-path"],
  ["maskImage", "mask-image"],
  ["textStroke", "text-stroke"],
  ["cursor", "cursor"],
  ["userSelect", "user-select"],
  ["pointerEvents", "pointer-events"],
  ["scrollSnapType", "scroll-snap-type"],
  ["scrollSnapAlign", "scroll-snap-align"],
  ["outline", "outline"],
  ["outlineOffset", "outline-offset"],
  ["accentColor", "accent-color"],
  ["caretColor", "caret-color"],
];

function builderNodeContainerQueryStyleAttrs(
  breakpoint: "tablet" | "mobile",
  bucket: BuilderNodeStyleValue | undefined,
) {
  const attrs: Record<string, string | undefined> = {};
  const prefix = `data-builder-style-cq-${breakpoint}`;
  if (bucket?.size) attrs[`${prefix}-size`] = bucket.size;
  if (bucket?.visibility === "hidden") attrs[`${prefix}-hidden`] = "";
  if (bucket?.borderColor || bucket?.borderWidth || bucket?.borderStyle) {
    attrs[`${prefix}-border-width`] = "";
    attrs[`${prefix}-border-style`] = "";
  }
  if (hasTransitionLonghands(bucket)) attrs[`${prefix}-transition`] = "";
  for (const [key, attr] of CONTAINER_QUERY_STYLE_ATTR_KEYS) {
    const value = bucket?.[key];
    if (value !== undefined && value !== "") attrs[`${prefix}-${attr}`] = "";
  }
  return attrs;
}

// Exported so the injected section_embed renderer can apply the SAME wrapper
// style attrs/inline style to its wrapper <div> (section_embed restyle support).
// render.tsx only imports the section-embed renderer's TYPE, so this value
// export creates no runtime import cycle.
export function builderNodeStyleAttrs(style: BuilderNodeStyle | undefined) {
  const tablet = style?.responsive?.tablet;
  const mobile = style?.responsive?.mobile;
  const hasBaseTransition =
    Boolean(style?.hover) ||
    Boolean(style?.stateStyles?.focus) ||
    Boolean(style?.stateStyles?.active) ||
    hasTransitionLonghands(style);
  return {
    "data-builder-style-align": style?.align,
    "data-builder-style-size": style?.size,
    "data-builder-style-tone": style?.tone,
    "data-builder-style-width": style?.maxWidth,
    "data-builder-style-background": style?.background,
    "data-builder-style-radius": style?.radius,
    "data-builder-style-fit": style?.objectFit,
    "data-builder-style-object-position": style?.objectPosition,
    "data-builder-style-ratio": style?.aspectRatio,
    "data-builder-style-container-type": style?.containerType ? "" : undefined,
    "data-builder-style-container-name": style?.containerName ? "" : undefined,
    "data-builder-style-transition": hasBaseTransition ? "" : undefined,
    // Reveal-on-view — the published-page IntersectionObserver targets this attr;
    // the per-direction CSS + the distance/duration/delay/easing vars do the rest.
    "data-bn-reveal":
      style?.revealOnView && style.revealOnView !== "none"
        ? style.revealOnView
        : undefined,
    ...builderNodeContainerQueryStyleAttrs(
      "tablet",
      style?.containerQueries?.tablet,
    ),
    ...builderNodeContainerQueryStyleAttrs(
      "mobile",
      style?.containerQueries?.mobile,
    ),
    "data-builder-style-tablet-align": tablet?.align,
    "data-builder-style-tablet-size": tablet?.size,
    "data-builder-style-tablet-tone": tablet?.tone,
    "data-builder-style-tablet-width": tablet?.maxWidth,
    "data-builder-style-tablet-margin-top": tablet?.marginTop,
    "data-builder-style-tablet-margin-bottom": tablet?.marginBottom,
    "data-builder-style-tablet-padding-x": tablet?.paddingX,
    "data-builder-style-tablet-padding-y": tablet?.paddingY,
    "data-builder-style-tablet-background": tablet?.background,
    "data-builder-style-tablet-radius": tablet?.radius,
    "data-builder-style-tablet-fit": tablet?.objectFit,
    "data-builder-style-tablet-object-position": tablet?.objectPosition,
    "data-builder-style-tablet-ratio": tablet?.aspectRatio,
    "data-builder-style-tablet-aspect-free": tablet?.aspectRatioFree ? "" : undefined,
    "data-builder-style-tablet-hidden": tablet?.visibility === "hidden" ? "" : undefined,
    "data-builder-style-tablet-font-family": tablet?.fontFamily ? "" : undefined,
    "data-builder-style-tablet-font-size": tablet?.fontSize ? "" : undefined,
    "data-builder-style-tablet-font-weight":
      typeof tablet?.fontWeight === "number" ? "" : undefined,
    "data-builder-style-tablet-line-height": tablet?.lineHeight ? "" : undefined,
    "data-builder-style-tablet-letter-spacing": tablet?.letterSpacing ? "" : undefined,
    "data-builder-style-tablet-text-transform": tablet?.textTransform ? "" : undefined,
    "data-builder-style-tablet-font-style": tablet?.fontStyle ? "" : undefined,
    "data-builder-style-tablet-text-decoration": tablet?.textDecoration ? "" : undefined,
    "data-builder-style-tablet-text-color": tablet?.textColor ? "" : undefined,
    "data-builder-style-tablet-bg-color": tablet?.backgroundColor ? "" : undefined,
    "data-builder-style-tablet-border-color": tablet?.borderColor ? "" : undefined,
    "data-builder-style-tablet-border-width":
      tablet?.borderColor || tablet?.borderWidth || tablet?.borderStyle ? "" : undefined,
    "data-builder-style-tablet-border-style":
      tablet?.borderColor || tablet?.borderWidth || tablet?.borderStyle ? "" : undefined,
    "data-builder-style-tablet-free-width": tablet?.width ? "" : undefined,
    "data-builder-style-tablet-height": tablet?.height ? "" : undefined,
    "data-builder-style-tablet-min-height": tablet?.minHeight ? "" : undefined,
    "data-builder-style-tablet-min-width": tablet?.minWidth ? "" : undefined,
    "data-builder-style-tablet-max-width-free": tablet?.maxWidthFree ? "" : undefined,
    "data-builder-style-tablet-max-height": tablet?.maxHeight ? "" : undefined,
    "data-builder-style-tablet-padding-top": tablet?.paddingTop ? "" : undefined,
    "data-builder-style-tablet-padding-right": tablet?.paddingRight ? "" : undefined,
    "data-builder-style-tablet-padding-bottom": tablet?.paddingBottom ? "" : undefined,
    "data-builder-style-tablet-padding-left": tablet?.paddingLeft ? "" : undefined,
    "data-builder-style-tablet-margin-top-free": tablet?.marginTopFree ? "" : undefined,
    "data-builder-style-tablet-margin-right-free": tablet?.marginRightFree ? "" : undefined,
    "data-builder-style-tablet-margin-bottom-free": tablet?.marginBottomFree ? "" : undefined,
    "data-builder-style-tablet-margin-left-free": tablet?.marginLeftFree ? "" : undefined,
    "data-builder-style-tablet-shadow": tablet?.boxShadow ? "" : undefined,
    "data-builder-style-tablet-text-shadow": tablet?.textShadow ? "" : undefined,
    "data-builder-style-tablet-bg-image": tablet?.backgroundImage ? "" : undefined,
    "data-builder-style-tablet-opacity":
      typeof tablet?.opacity === "number" ? "" : undefined,
    "data-builder-style-tablet-radius-free": tablet?.borderRadius ? "" : undefined,
    "data-builder-style-tablet-gap-free": tablet?.gap ? "" : undefined,
    "data-builder-style-tablet-position": tablet?.position ? "" : undefined,
    "data-builder-style-tablet-inset-top": tablet?.top ? "" : undefined,
    "data-builder-style-tablet-inset-right": tablet?.right ? "" : undefined,
    "data-builder-style-tablet-inset-bottom": tablet?.bottom ? "" : undefined,
    "data-builder-style-tablet-inset-left": tablet?.left ? "" : undefined,
    "data-builder-style-tablet-z-index":
      typeof tablet?.zIndex === "number" ? "" : undefined,
    "data-builder-style-tablet-overflow": tablet?.overflow ? "" : undefined,
    "data-builder-style-tablet-rotate": tablet?.rotate ? "" : undefined,
    "data-builder-style-tablet-scale": tablet?.scale ? "" : undefined,
    "data-builder-style-tablet-translate": tablet?.translate ? "" : undefined,
    "data-builder-style-tablet-transform-origin": tablet?.transformOrigin
      ? ""
      : undefined,
    "data-builder-style-tablet-align-self": tablet?.alignSelf ? "" : undefined,
    "data-builder-style-tablet-flex-grow":
      typeof tablet?.flexGrow === "number" ? "" : undefined,
    "data-builder-style-tablet-flex-shrink":
      typeof tablet?.flexShrink === "number" ? "" : undefined,
    "data-builder-style-tablet-flex-basis": tablet?.flexBasis ? "" : undefined,
    "data-builder-style-tablet-grid-column": tablet?.gridColumn ? "" : undefined,
    "data-builder-style-tablet-grid-row": tablet?.gridRow ? "" : undefined,
    "data-builder-style-tablet-order":
      typeof tablet?.order === "number" ? "" : undefined,
    "data-builder-style-tablet-filter": tablet?.filter ? "" : undefined,
    "data-builder-style-tablet-backdrop-filter":
      tablet?.backdropFilter ? "" : undefined,
    "data-builder-style-tablet-mix-blend-mode":
      tablet?.mixBlendMode ? "" : undefined,
    "data-builder-style-tablet-justify-content": tablet?.justifyContent ? "" : undefined,
    "data-builder-style-tablet-align-items": tablet?.alignItems ? "" : undefined,
    "data-builder-style-tablet-flex-wrap": tablet?.flexWrap ? "" : undefined,
    "data-builder-style-tablet-grid-template-columns": tablet?.gridTemplateColumns ? "" : undefined,
    "data-builder-style-tablet-grid-template-rows": tablet?.gridTemplateRows ? "" : undefined,
    "data-builder-style-tablet-grid-auto-flow": tablet?.gridAutoFlow ? "" : undefined,
    "data-builder-style-tablet-clip-path": tablet?.clipPath ? "" : undefined,
    "data-builder-style-tablet-mask-image": tablet?.maskImage ? "" : undefined,
    "data-builder-style-tablet-text-stroke": tablet?.textStroke ? "" : undefined,
    "data-builder-style-tablet-cursor": tablet?.cursor ? "" : undefined,
    "data-builder-style-tablet-user-select": tablet?.userSelect ? "" : undefined,
    "data-builder-style-tablet-pointer-events": tablet?.pointerEvents ? "" : undefined,
    "data-builder-style-tablet-scroll-snap-type": tablet?.scrollSnapType ? "" : undefined,
    "data-builder-style-tablet-scroll-snap-align": tablet?.scrollSnapAlign ? "" : undefined,
    "data-builder-style-tablet-outline": tablet?.outline ? "" : undefined,
    "data-builder-style-tablet-outline-offset": tablet?.outlineOffset ? "" : undefined,
    "data-builder-style-tablet-accent-color": tablet?.accentColor ? "" : undefined,
    "data-builder-style-tablet-caret-color": tablet?.caretColor ? "" : undefined,
    "data-builder-style-tablet-transition": hasTransitionLonghands(tablet)
      ? ""
      : undefined,
    "data-builder-style-mobile-align": mobile?.align,
    "data-builder-style-mobile-size": mobile?.size,
    "data-builder-style-mobile-tone": mobile?.tone,
    "data-builder-style-mobile-width": mobile?.maxWidth,
    "data-builder-style-mobile-margin-top": mobile?.marginTop,
    "data-builder-style-mobile-margin-bottom": mobile?.marginBottom,
    "data-builder-style-mobile-padding-x": mobile?.paddingX,
    "data-builder-style-mobile-padding-y": mobile?.paddingY,
    "data-builder-style-mobile-background": mobile?.background,
    "data-builder-style-mobile-radius": mobile?.radius,
    "data-builder-style-mobile-fit": mobile?.objectFit,
    "data-builder-style-mobile-object-position": mobile?.objectPosition,
    "data-builder-style-mobile-ratio": mobile?.aspectRatio,
    "data-builder-style-mobile-aspect-free": mobile?.aspectRatioFree ? "" : undefined,
    "data-builder-style-mobile-hidden": mobile?.visibility === "hidden" ? "" : undefined,
    "data-builder-style-mobile-font-family": mobile?.fontFamily ? "" : undefined,
    "data-builder-style-mobile-font-size": mobile?.fontSize ? "" : undefined,
    "data-builder-style-mobile-font-weight":
      typeof mobile?.fontWeight === "number" ? "" : undefined,
    "data-builder-style-mobile-line-height": mobile?.lineHeight ? "" : undefined,
    "data-builder-style-mobile-letter-spacing": mobile?.letterSpacing ? "" : undefined,
    "data-builder-style-mobile-text-transform": mobile?.textTransform ? "" : undefined,
    "data-builder-style-mobile-font-style": mobile?.fontStyle ? "" : undefined,
    "data-builder-style-mobile-text-decoration": mobile?.textDecoration ? "" : undefined,
    "data-builder-style-mobile-text-color": mobile?.textColor ? "" : undefined,
    "data-builder-style-mobile-bg-color": mobile?.backgroundColor ? "" : undefined,
    "data-builder-style-mobile-border-color": mobile?.borderColor ? "" : undefined,
    "data-builder-style-mobile-border-width":
      mobile?.borderColor || mobile?.borderWidth || mobile?.borderStyle ? "" : undefined,
    "data-builder-style-mobile-border-style":
      mobile?.borderColor || mobile?.borderWidth || mobile?.borderStyle ? "" : undefined,
    "data-builder-style-mobile-free-width": mobile?.width ? "" : undefined,
    "data-builder-style-mobile-height": mobile?.height ? "" : undefined,
    "data-builder-style-mobile-min-height": mobile?.minHeight ? "" : undefined,
    "data-builder-style-mobile-min-width": mobile?.minWidth ? "" : undefined,
    "data-builder-style-mobile-max-width-free": mobile?.maxWidthFree ? "" : undefined,
    "data-builder-style-mobile-max-height": mobile?.maxHeight ? "" : undefined,
    "data-builder-style-mobile-padding-top": mobile?.paddingTop ? "" : undefined,
    "data-builder-style-mobile-padding-right": mobile?.paddingRight ? "" : undefined,
    "data-builder-style-mobile-padding-bottom": mobile?.paddingBottom ? "" : undefined,
    "data-builder-style-mobile-padding-left": mobile?.paddingLeft ? "" : undefined,
    "data-builder-style-mobile-margin-top-free": mobile?.marginTopFree ? "" : undefined,
    "data-builder-style-mobile-margin-right-free": mobile?.marginRightFree ? "" : undefined,
    "data-builder-style-mobile-margin-bottom-free": mobile?.marginBottomFree ? "" : undefined,
    "data-builder-style-mobile-margin-left-free": mobile?.marginLeftFree ? "" : undefined,
    "data-builder-style-mobile-shadow": mobile?.boxShadow ? "" : undefined,
    "data-builder-style-mobile-text-shadow": mobile?.textShadow ? "" : undefined,
    "data-builder-style-mobile-bg-image": mobile?.backgroundImage ? "" : undefined,
    "data-builder-style-mobile-opacity":
      typeof mobile?.opacity === "number" ? "" : undefined,
    "data-builder-style-mobile-radius-free": mobile?.borderRadius ? "" : undefined,
    "data-builder-style-mobile-gap-free": mobile?.gap ? "" : undefined,
    "data-builder-style-mobile-position": mobile?.position ? "" : undefined,
    "data-builder-style-mobile-inset-top": mobile?.top ? "" : undefined,
    "data-builder-style-mobile-inset-right": mobile?.right ? "" : undefined,
    "data-builder-style-mobile-inset-bottom": mobile?.bottom ? "" : undefined,
    "data-builder-style-mobile-inset-left": mobile?.left ? "" : undefined,
    "data-builder-style-mobile-z-index":
      typeof mobile?.zIndex === "number" ? "" : undefined,
    "data-builder-style-mobile-overflow": mobile?.overflow ? "" : undefined,
    "data-builder-style-mobile-rotate": mobile?.rotate ? "" : undefined,
    "data-builder-style-mobile-scale": mobile?.scale ? "" : undefined,
    "data-builder-style-mobile-translate": mobile?.translate ? "" : undefined,
    "data-builder-style-mobile-transform-origin": mobile?.transformOrigin
      ? ""
      : undefined,
    "data-builder-style-mobile-align-self": mobile?.alignSelf ? "" : undefined,
    "data-builder-style-mobile-flex-grow":
      typeof mobile?.flexGrow === "number" ? "" : undefined,
    "data-builder-style-mobile-flex-shrink":
      typeof mobile?.flexShrink === "number" ? "" : undefined,
    "data-builder-style-mobile-flex-basis": mobile?.flexBasis ? "" : undefined,
    "data-builder-style-mobile-grid-column": mobile?.gridColumn ? "" : undefined,
    "data-builder-style-mobile-grid-row": mobile?.gridRow ? "" : undefined,
    "data-builder-style-mobile-order":
      typeof mobile?.order === "number" ? "" : undefined,
    "data-builder-style-mobile-filter": mobile?.filter ? "" : undefined,
    "data-builder-style-mobile-backdrop-filter":
      mobile?.backdropFilter ? "" : undefined,
    "data-builder-style-mobile-mix-blend-mode":
      mobile?.mixBlendMode ? "" : undefined,
    "data-builder-style-mobile-justify-content": mobile?.justifyContent ? "" : undefined,
    "data-builder-style-mobile-align-items": mobile?.alignItems ? "" : undefined,
    "data-builder-style-mobile-flex-wrap": mobile?.flexWrap ? "" : undefined,
    "data-builder-style-mobile-grid-template-columns": mobile?.gridTemplateColumns ? "" : undefined,
    "data-builder-style-mobile-grid-template-rows": mobile?.gridTemplateRows ? "" : undefined,
    "data-builder-style-mobile-grid-auto-flow": mobile?.gridAutoFlow ? "" : undefined,
    "data-builder-style-mobile-clip-path": mobile?.clipPath ? "" : undefined,
    "data-builder-style-mobile-mask-image": mobile?.maskImage ? "" : undefined,
    "data-builder-style-mobile-text-stroke": mobile?.textStroke ? "" : undefined,
    "data-builder-style-mobile-cursor": mobile?.cursor ? "" : undefined,
    "data-builder-style-mobile-user-select": mobile?.userSelect ? "" : undefined,
    "data-builder-style-mobile-pointer-events": mobile?.pointerEvents ? "" : undefined,
    "data-builder-style-mobile-scroll-snap-type": mobile?.scrollSnapType ? "" : undefined,
    "data-builder-style-mobile-scroll-snap-align": mobile?.scrollSnapAlign ? "" : undefined,
    "data-builder-style-mobile-outline": mobile?.outline ? "" : undefined,
    "data-builder-style-mobile-outline-offset": mobile?.outlineOffset ? "" : undefined,
    "data-builder-style-mobile-accent-color": mobile?.accentColor ? "" : undefined,
    "data-builder-style-mobile-caret-color": mobile?.caretColor ? "" : undefined,
    "data-builder-style-mobile-transition": hasTransitionLonghands(mobile)
      ? ""
      : undefined,
    // Hover-state gates — each presence attr arms the matching :hover rule in the
    // static sheet (which reads the --bn-hover-* var). No attr ⇒ no rule ⇒ resting
    // value is untouched.
    "data-builder-style-hover-bg": style?.hover?.backgroundColor ? "" : undefined,
    "data-builder-style-hover-color": style?.hover?.color ? "" : undefined,
    "data-builder-style-hover-border-color": style?.hover?.borderColor ? "" : undefined,
    "data-builder-style-hover-shadow": style?.hover?.boxShadow ? "" : undefined,
    "data-builder-style-hover-scale": style?.hover?.scale ? "" : undefined,
    "data-builder-style-hover-translate": style?.hover?.translate ? "" : undefined,
    "data-builder-style-hover-opacity":
      typeof style?.hover?.opacity === "number" ? "" : undefined,
    // Focus-visible state gates (Wave 3 · 3D — universal state editor).
    "data-builder-style-focus-bg":
      style?.stateStyles?.focus?.backgroundColor ? "" : undefined,
    "data-builder-style-focus-color":
      style?.stateStyles?.focus?.color ? "" : undefined,
    "data-builder-style-focus-border-color":
      style?.stateStyles?.focus?.borderColor ? "" : undefined,
    "data-builder-style-focus-shadow":
      style?.stateStyles?.focus?.boxShadow ? "" : undefined,
    "data-builder-style-focus-scale":
      style?.stateStyles?.focus?.scale ? "" : undefined,
    "data-builder-style-focus-translate":
      style?.stateStyles?.focus?.translate ? "" : undefined,
    "data-builder-style-focus-opacity":
      typeof style?.stateStyles?.focus?.opacity === "number" ? "" : undefined,
    // Active state gates.
    "data-builder-style-active-bg":
      style?.stateStyles?.active?.backgroundColor ? "" : undefined,
    "data-builder-style-active-color":
      style?.stateStyles?.active?.color ? "" : undefined,
    "data-builder-style-active-border-color":
      style?.stateStyles?.active?.borderColor ? "" : undefined,
    "data-builder-style-active-shadow":
      style?.stateStyles?.active?.boxShadow ? "" : undefined,
    "data-builder-style-active-scale":
      style?.stateStyles?.active?.scale ? "" : undefined,
    "data-builder-style-active-translate":
      style?.stateStyles?.active?.translate ? "" : undefined,
    "data-builder-style-active-opacity":
      typeof style?.stateStyles?.active?.opacity === "number" ? "" : undefined,
  };
}

function styleColor(tone: BuilderNodeStyleValue["tone"]): string | undefined {
  // Theme-adaptive (AIQ-4): fall back to the old hardcoded values only when the
  // theme defines no token, so light themes look identical and dark themes stop
  // rendering muted/strong text near-black-on-dark.
  if (tone === "muted") return "var(--token-color-muted, rgba(18, 18, 18, 0.62))";
  if (tone === "strong") return "var(--token-color-ink, #111)";
  return undefined;
}

function styleBackground(
  background: BuilderNodeStyleValue["background"],
): string | undefined {
  if (background === "none") return "transparent";
  // Theme-paired raised surface (AIQ-1): dark themes now get a dark panel that
  // their own ink reads on, instead of a fixed cream band.
  if (background === "surface") return "var(--token-color-surface-raised, rgba(246, 241, 232, 0.92))";
  if (background === "contrast") return "#111";
  // Theme-paired band ROLES (AIQ-13). Unlike "contrast" these carry a guaranteed
  // paired foreground (applied in sharedNodeStyle), so they read on any theme.
  if (background === "accent") return "var(--token-color-primary, var(--token-color-ink, #111))";
  if (background === "muted")
    return "color-mix(in oklab, var(--token-color-surface-raised, #f6f1e8) 62%, var(--token-color-ink, #111) 4%)";
  return undefined;
}

// Token-binding resolution (Wave 3 · 3A). A color / font-family style value may
// be a `token:<key>` sentinel that binds to a Theme design token; this maps it
// to `var(--token-…, fallback)` so a live theme change cascades. A raw value
// (hex / rgb / keyword / literal var()) is returned UNCHANGED, so existing trees
// + the flagship are byte-identical. Applied at every color / font emit site.
function styleToken(value: string | undefined): string | undefined {
  return resolveStyleTokenRef(value) as string | undefined;
}

function containerQueryStyleVars(
  breakpoint: "tablet" | "mobile",
  style: BuilderNodeStyleValue | undefined,
  base: BuilderNodeStyle | undefined,
): Record<string, string | number | undefined> {
  const prefix = `--bn-cq-${breakpoint}`;
  return {
    [`${prefix}-align`]: style?.align,
    [`${prefix}-color`]: styleColor(style?.tone),
    [`${prefix}-max-width`]: style?.maxWidth
      ? NODE_MAX_WIDTH[style.maxWidth]
      : undefined,
    [`${prefix}-margin-top`]: style?.marginTop
      ? NODE_SPACING[style.marginTop]
      : undefined,
    [`${prefix}-margin-bottom`]: style?.marginBottom
      ? NODE_SPACING[style.marginBottom]
      : undefined,
    [`${prefix}-padding-x`]: style?.paddingX
      ? NODE_SPACING[style.paddingX]
      : undefined,
    [`${prefix}-padding-y`]: style?.paddingY
      ? NODE_SPACING[style.paddingY]
      : undefined,
    [`${prefix}-background`]: styleBackground(style?.background),
    [`${prefix}-radius`]: style?.radius ? NODE_RADIUS[style.radius] : undefined,
    [`${prefix}-fit`]: style?.objectFit,
    [`${prefix}-object-position`]: style?.objectPosition,
    [`${prefix}-ratio`]: style?.aspectRatio
      ? NODE_ASPECT_RATIO[style.aspectRatio]
      : undefined,
    [`${prefix}-aspect-free`]: style?.aspectRatioFree,
    [`${prefix}-font-family`]: styleToken(style?.fontFamily),
    [`${prefix}-font-size`]: styleToken(style?.fontSize),
    [`${prefix}-font-weight`]: style?.fontWeight,
    [`${prefix}-line-height`]: style?.lineHeight,
    [`${prefix}-letter-spacing`]: style?.letterSpacing,
    [`${prefix}-text-transform`]: style?.textTransform,
    [`${prefix}-font-style`]: style?.fontStyle,
    [`${prefix}-text-decoration`]: style?.textDecoration,
    [`${prefix}-text-color`]: styleToken(style?.textColor),
    [`${prefix}-bg-color`]: styleToken(style?.backgroundColor),
    [`${prefix}-border-color`]: styleToken(style?.borderColor),
    [`${prefix}-border-width`]:
      style?.borderColor || style?.borderWidth || style?.borderStyle
        ? style?.borderWidth ?? base?.borderWidth ?? "1px"
        : undefined,
    [`${prefix}-border-style`]:
      style?.borderColor || style?.borderWidth || style?.borderStyle
        ? style?.borderStyle ?? base?.borderStyle ?? "solid"
        : undefined,
    [`${prefix}-free-width`]: style?.width,
    [`${prefix}-height`]: style?.height,
    [`${prefix}-min-height`]: style?.minHeight,
    [`${prefix}-min-width`]: style?.minWidth,
    [`${prefix}-max-width-free`]: style?.maxWidthFree,
    [`${prefix}-max-height`]: style?.maxHeight,
    [`${prefix}-padding-top`]: styleToken(style?.paddingTop),
    [`${prefix}-padding-right`]: styleToken(style?.paddingRight),
    [`${prefix}-padding-bottom`]: styleToken(style?.paddingBottom),
    [`${prefix}-padding-left`]: styleToken(style?.paddingLeft),
    [`${prefix}-margin-top-free`]: styleToken(style?.marginTopFree),
    [`${prefix}-margin-right-free`]: styleToken(style?.marginRightFree),
    [`${prefix}-margin-bottom-free`]: styleToken(style?.marginBottomFree),
    [`${prefix}-margin-left-free`]: styleToken(style?.marginLeftFree),
    [`${prefix}-shadow`]: styleToken(style?.boxShadow),
    [`${prefix}-text-shadow`]: style?.textShadow,
    [`${prefix}-bg-image`]: style?.backgroundImage,
    [`${prefix}-opacity`]: style?.opacity,
    [`${prefix}-radius-free`]: styleToken(style?.borderRadius),
    [`${prefix}-gap-free`]: styleToken(style?.gap),
    [`${prefix}-container-type`]: style?.containerType,
    [`${prefix}-container-name`]: style?.containerName,
    [`${prefix}-position`]: style?.position,
    [`${prefix}-inset-top`]: style?.top,
    [`${prefix}-inset-right`]: style?.right,
    [`${prefix}-inset-bottom`]: style?.bottom,
    [`${prefix}-inset-left`]: style?.left,
    [`${prefix}-z-index`]: style?.zIndex,
    [`${prefix}-overflow`]: style?.overflow,
    [`${prefix}-rotate`]: style?.rotate,
    [`${prefix}-scale`]: style?.scale,
    [`${prefix}-translate`]: style?.translate,
    [`${prefix}-transform-origin`]: style?.transformOrigin,
    [`${prefix}-transition-property`]: style?.transitionProperty,
    [`${prefix}-transition-duration`]: style?.transitionDuration,
    [`${prefix}-transition-timing-function`]: style?.transitionTimingFunction,
    [`${prefix}-transition-delay`]: style?.transitionDelay,
    [`${prefix}-align-self`]: style?.alignSelf,
    [`${prefix}-flex-grow`]: style?.flexGrow,
    [`${prefix}-flex-shrink`]: style?.flexShrink,
    [`${prefix}-flex-basis`]: style?.flexBasis,
    [`${prefix}-grid-column`]: style?.gridColumn,
    [`${prefix}-grid-row`]: style?.gridRow,
    [`${prefix}-order`]: style?.order,
    [`${prefix}-filter`]: style?.filter,
    [`${prefix}-backdrop-filter`]: style?.backdropFilter,
    [`${prefix}-mix-blend-mode`]: style?.mixBlendMode,
    [`${prefix}-justify-content`]: style?.justifyContent,
    [`${prefix}-align-items`]: style?.alignItems,
    [`${prefix}-flex-wrap`]: style?.flexWrap,
    [`${prefix}-grid-template-columns`]: style?.gridTemplateColumns,
    [`${prefix}-grid-template-rows`]: style?.gridTemplateRows,
    [`${prefix}-grid-auto-flow`]: style?.gridAutoFlow,
    [`${prefix}-clip-path`]: style?.clipPath,
    [`${prefix}-mask-image`]: style?.maskImage,
    [`${prefix}-text-stroke`]: style?.textStroke,
    [`${prefix}-cursor`]: style?.cursor,
    [`${prefix}-user-select`]: style?.userSelect,
    [`${prefix}-pointer-events`]: style?.pointerEvents,
    [`${prefix}-scroll-snap-type`]: style?.scrollSnapType,
    [`${prefix}-scroll-snap-align`]: style?.scrollSnapAlign,
    [`${prefix}-outline`]: style?.outline,
    [`${prefix}-outline-offset`]: style?.outlineOffset,
    [`${prefix}-accent-color`]: styleToken(style?.accentColor),
    [`${prefix}-caret-color`]: styleToken(style?.caretColor),
  };
}

function responsiveStyleVars(
  style: BuilderNodeStyle | undefined,
): CSSProperties {
  const hasBaseTransition =
    Boolean(style?.hover) ||
    Boolean(style?.stateStyles?.focus) ||
    Boolean(style?.stateStyles?.active) ||
    hasTransitionLonghands(style);
  return builderNodeStyleVars({
    "--bn-container-type": style?.containerType,
    "--bn-container-name": style?.containerName,
    ...containerQueryStyleVars("tablet", style?.containerQueries?.tablet, style),
    ...containerQueryStyleVars("mobile", style?.containerQueries?.mobile, style),
    "--bn-transition-property": hasBaseTransition
      ? style?.transitionProperty ?? "all"
      : undefined,
    "--bn-transition-duration": hasBaseTransition
      ? style?.transitionDuration ?? ".2s"
      : undefined,
    "--bn-transition-timing-function": hasBaseTransition
      ? style?.transitionTimingFunction ?? "ease"
      : undefined,
    "--bn-transition-delay": hasBaseTransition
      ? style?.transitionDelay ?? "0s"
      : undefined,
    "--bn-tablet-align": style?.responsive?.tablet?.align,
    "--bn-tablet-color": styleColor(style?.responsive?.tablet?.tone),
    "--bn-tablet-max-width": style?.responsive?.tablet?.maxWidth
      ? NODE_MAX_WIDTH[style.responsive.tablet.maxWidth]
      : undefined,
    "--bn-tablet-margin-top": style?.responsive?.tablet?.marginTop
      ? NODE_SPACING[style.responsive.tablet.marginTop]
      : undefined,
    "--bn-tablet-margin-bottom": style?.responsive?.tablet?.marginBottom
      ? NODE_SPACING[style.responsive.tablet.marginBottom]
      : undefined,
    "--bn-tablet-padding-x": style?.responsive?.tablet?.paddingX
      ? NODE_SPACING[style.responsive.tablet.paddingX]
      : undefined,
    "--bn-tablet-padding-y": style?.responsive?.tablet?.paddingY
      ? NODE_SPACING[style.responsive.tablet.paddingY]
      : undefined,
    "--bn-tablet-background": styleBackground(style?.responsive?.tablet?.background),
    "--bn-tablet-radius": style?.responsive?.tablet?.radius
      ? NODE_RADIUS[style.responsive.tablet.radius]
      : undefined,
    "--bn-tablet-fit": style?.responsive?.tablet?.objectFit,
    "--bn-tablet-object-position": style?.responsive?.tablet?.objectPosition,
    "--bn-tablet-ratio": style?.responsive?.tablet?.aspectRatio
      ? NODE_ASPECT_RATIO[style.responsive.tablet.aspectRatio]
      : undefined,
    "--bn-tablet-aspect-free": style?.responsive?.tablet?.aspectRatioFree,
    "--bn-mobile-align": style?.responsive?.mobile?.align,
    "--bn-mobile-color": styleColor(style?.responsive?.mobile?.tone),
    "--bn-mobile-max-width": style?.responsive?.mobile?.maxWidth
      ? NODE_MAX_WIDTH[style.responsive.mobile.maxWidth]
      : undefined,
    "--bn-mobile-margin-top": style?.responsive?.mobile?.marginTop
      ? NODE_SPACING[style.responsive.mobile.marginTop]
      : undefined,
    "--bn-mobile-margin-bottom": style?.responsive?.mobile?.marginBottom
      ? NODE_SPACING[style.responsive.mobile.marginBottom]
      : undefined,
    "--bn-mobile-padding-x": style?.responsive?.mobile?.paddingX
      ? NODE_SPACING[style.responsive.mobile.paddingX]
      : undefined,
    "--bn-mobile-padding-y": style?.responsive?.mobile?.paddingY
      ? NODE_SPACING[style.responsive.mobile.paddingY]
      : undefined,
    "--bn-mobile-background": styleBackground(style?.responsive?.mobile?.background),
    "--bn-mobile-radius": style?.responsive?.mobile?.radius
      ? NODE_RADIUS[style.responsive.mobile.radius]
      : undefined,
    "--bn-mobile-fit": style?.responsive?.mobile?.objectFit,
    "--bn-mobile-object-position": style?.responsive?.mobile?.objectPosition,
    "--bn-mobile-ratio": style?.responsive?.mobile?.aspectRatio
      ? NODE_ASPECT_RATIO[style.responsive.mobile.aspectRatio]
      : undefined,
    "--bn-mobile-aspect-free": style?.responsive?.mobile?.aspectRatioFree,
    // Free-value escapes — per-breakpoint overrides. Desktop applies these inline
    // in sharedNodeStyle; these vars only render when the breakpoint value is set,
    // gated by the matching data-attr so an unset var never clobbers the desktop
    // value (an ungated !important rule would reset inherited props to the parent).
    "--bn-tablet-font-family": styleToken(style?.responsive?.tablet?.fontFamily),
    "--bn-tablet-font-size": styleToken(style?.responsive?.tablet?.fontSize),
    "--bn-tablet-font-weight": style?.responsive?.tablet?.fontWeight,
    "--bn-tablet-line-height": style?.responsive?.tablet?.lineHeight,
    "--bn-tablet-letter-spacing": style?.responsive?.tablet?.letterSpacing,
    "--bn-tablet-text-transform": style?.responsive?.tablet?.textTransform,
    "--bn-tablet-font-style": style?.responsive?.tablet?.fontStyle,
    "--bn-tablet-text-decoration": style?.responsive?.tablet?.textDecoration,
    "--bn-tablet-text-color": styleToken(style?.responsive?.tablet?.textColor),
    "--bn-tablet-bg-color": styleToken(style?.responsive?.tablet?.backgroundColor),
    "--bn-tablet-border-color": styleToken(style?.responsive?.tablet?.borderColor),
    "--bn-tablet-border-width":
      style?.responsive?.tablet?.borderColor ||
      style?.responsive?.tablet?.borderWidth ||
      style?.responsive?.tablet?.borderStyle
        ? style?.responsive?.tablet?.borderWidth ?? style?.borderWidth ?? "1px"
        : undefined,
    "--bn-tablet-border-style":
      style?.responsive?.tablet?.borderColor ||
      style?.responsive?.tablet?.borderWidth ||
      style?.responsive?.tablet?.borderStyle
        ? style?.responsive?.tablet?.borderStyle ?? style?.borderStyle ?? "solid"
        : undefined,
    "--bn-mobile-font-family": styleToken(style?.responsive?.mobile?.fontFamily),
    "--bn-mobile-font-size": styleToken(style?.responsive?.mobile?.fontSize),
    "--bn-mobile-font-weight": style?.responsive?.mobile?.fontWeight,
    "--bn-mobile-line-height": style?.responsive?.mobile?.lineHeight,
    "--bn-mobile-letter-spacing": style?.responsive?.mobile?.letterSpacing,
    "--bn-mobile-text-transform": style?.responsive?.mobile?.textTransform,
    "--bn-mobile-font-style": style?.responsive?.mobile?.fontStyle,
    "--bn-mobile-text-decoration": style?.responsive?.mobile?.textDecoration,
    "--bn-mobile-text-color": styleToken(style?.responsive?.mobile?.textColor),
    "--bn-mobile-bg-color": styleToken(style?.responsive?.mobile?.backgroundColor),
    "--bn-mobile-border-color": styleToken(style?.responsive?.mobile?.borderColor),
    "--bn-mobile-border-width":
      style?.responsive?.mobile?.borderColor ||
      style?.responsive?.mobile?.borderWidth ||
      style?.responsive?.mobile?.borderStyle
        ? style?.responsive?.mobile?.borderWidth ?? style?.borderWidth ?? "1px"
        : undefined,
    "--bn-mobile-border-style":
      style?.responsive?.mobile?.borderColor ||
      style?.responsive?.mobile?.borderWidth ||
      style?.responsive?.mobile?.borderStyle
        ? style?.responsive?.mobile?.borderStyle ?? style?.borderStyle ?? "solid"
        : undefined,
    "--bn-tablet-free-width": style?.responsive?.tablet?.width,
    "--bn-tablet-height": style?.responsive?.tablet?.height,
    "--bn-tablet-min-height": style?.responsive?.tablet?.minHeight,
    "--bn-tablet-min-width": style?.responsive?.tablet?.minWidth,
    "--bn-tablet-max-width-free": style?.responsive?.tablet?.maxWidthFree,
    "--bn-tablet-max-height": style?.responsive?.tablet?.maxHeight,
    "--bn-mobile-free-width": style?.responsive?.mobile?.width,
    "--bn-mobile-height": style?.responsive?.mobile?.height,
    "--bn-mobile-min-height": style?.responsive?.mobile?.minHeight,
    "--bn-mobile-min-width": style?.responsive?.mobile?.minWidth,
    "--bn-mobile-max-width-free": style?.responsive?.mobile?.maxWidthFree,
    "--bn-mobile-max-height": style?.responsive?.mobile?.maxHeight,
    "--bn-tablet-padding-top": styleToken(style?.responsive?.tablet?.paddingTop),
    "--bn-tablet-padding-right": styleToken(style?.responsive?.tablet?.paddingRight),
    "--bn-tablet-padding-bottom": styleToken(style?.responsive?.tablet?.paddingBottom),
    "--bn-tablet-padding-left": styleToken(style?.responsive?.tablet?.paddingLeft),
    "--bn-mobile-padding-top": styleToken(style?.responsive?.mobile?.paddingTop),
    "--bn-mobile-padding-right": styleToken(style?.responsive?.mobile?.paddingRight),
    "--bn-mobile-padding-bottom": styleToken(style?.responsive?.mobile?.paddingBottom),
    "--bn-mobile-padding-left": styleToken(style?.responsive?.mobile?.paddingLeft),
    "--bn-tablet-margin-top-free": styleToken(style?.responsive?.tablet?.marginTopFree),
    "--bn-tablet-margin-right-free": styleToken(style?.responsive?.tablet?.marginRightFree),
    "--bn-tablet-margin-bottom-free": styleToken(style?.responsive?.tablet?.marginBottomFree),
    "--bn-tablet-margin-left-free": styleToken(style?.responsive?.tablet?.marginLeftFree),
    "--bn-mobile-margin-top-free": styleToken(style?.responsive?.mobile?.marginTopFree),
    "--bn-mobile-margin-right-free": styleToken(style?.responsive?.mobile?.marginRightFree),
    "--bn-mobile-margin-bottom-free": styleToken(style?.responsive?.mobile?.marginBottomFree),
    "--bn-mobile-margin-left-free": styleToken(style?.responsive?.mobile?.marginLeftFree),
    "--bn-tablet-shadow": styleToken(style?.responsive?.tablet?.boxShadow),
    "--bn-tablet-text-shadow": style?.responsive?.tablet?.textShadow,
    "--bn-tablet-bg-image": style?.responsive?.tablet?.backgroundImage,
    "--bn-tablet-opacity": style?.responsive?.tablet?.opacity,
    "--bn-mobile-shadow": styleToken(style?.responsive?.mobile?.boxShadow),
    "--bn-mobile-text-shadow": style?.responsive?.mobile?.textShadow,
    "--bn-mobile-bg-image": style?.responsive?.mobile?.backgroundImage,
    "--bn-mobile-opacity": style?.responsive?.mobile?.opacity,
    "--bn-tablet-radius-free": styleToken(style?.responsive?.tablet?.borderRadius),
    "--bn-mobile-radius-free": styleToken(style?.responsive?.mobile?.borderRadius),
    "--bn-tablet-gap-free": styleToken(style?.responsive?.tablet?.gap),
    "--bn-mobile-gap-free": styleToken(style?.responsive?.mobile?.gap),
    "--bn-tablet-position": style?.responsive?.tablet?.position,
    "--bn-tablet-inset-top": style?.responsive?.tablet?.top,
    "--bn-tablet-inset-right": style?.responsive?.tablet?.right,
    "--bn-tablet-inset-bottom": style?.responsive?.tablet?.bottom,
    "--bn-tablet-inset-left": style?.responsive?.tablet?.left,
    "--bn-mobile-position": style?.responsive?.mobile?.position,
    "--bn-mobile-inset-top": style?.responsive?.mobile?.top,
    "--bn-mobile-inset-right": style?.responsive?.mobile?.right,
    "--bn-mobile-inset-bottom": style?.responsive?.mobile?.bottom,
    "--bn-mobile-inset-left": style?.responsive?.mobile?.left,
    "--bn-tablet-z-index": style?.responsive?.tablet?.zIndex,
    "--bn-tablet-overflow": style?.responsive?.tablet?.overflow,
    "--bn-mobile-z-index": style?.responsive?.mobile?.zIndex,
    "--bn-mobile-overflow": style?.responsive?.mobile?.overflow,
    "--bn-tablet-rotate": style?.responsive?.tablet?.rotate,
    "--bn-tablet-scale": style?.responsive?.tablet?.scale,
    "--bn-tablet-translate": style?.responsive?.tablet?.translate,
    "--bn-tablet-transform-origin": style?.responsive?.tablet?.transformOrigin,
    "--bn-mobile-rotate": style?.responsive?.mobile?.rotate,
    "--bn-mobile-scale": style?.responsive?.mobile?.scale,
    "--bn-mobile-translate": style?.responsive?.mobile?.translate,
    "--bn-mobile-transform-origin": style?.responsive?.mobile?.transformOrigin,
    "--bn-tablet-align-self": style?.responsive?.tablet?.alignSelf,
    "--bn-tablet-flex-grow": style?.responsive?.tablet?.flexGrow,
    "--bn-tablet-flex-shrink": style?.responsive?.tablet?.flexShrink,
    "--bn-tablet-flex-basis": style?.responsive?.tablet?.flexBasis,
    "--bn-mobile-align-self": style?.responsive?.mobile?.alignSelf,
    "--bn-mobile-flex-grow": style?.responsive?.mobile?.flexGrow,
    "--bn-mobile-flex-shrink": style?.responsive?.mobile?.flexShrink,
    "--bn-mobile-flex-basis": style?.responsive?.mobile?.flexBasis,
    "--bn-tablet-grid-column": style?.responsive?.tablet?.gridColumn,
    "--bn-tablet-grid-row": style?.responsive?.tablet?.gridRow,
    "--bn-tablet-order": style?.responsive?.tablet?.order,
    "--bn-mobile-grid-column": style?.responsive?.mobile?.gridColumn,
    "--bn-mobile-grid-row": style?.responsive?.mobile?.gridRow,
    "--bn-mobile-order": style?.responsive?.mobile?.order,
    "--bn-tablet-filter": style?.responsive?.tablet?.filter,
    "--bn-tablet-backdrop-filter": style?.responsive?.tablet?.backdropFilter,
    "--bn-tablet-mix-blend-mode": style?.responsive?.tablet?.mixBlendMode,
    "--bn-mobile-filter": style?.responsive?.mobile?.filter,
    "--bn-mobile-backdrop-filter": style?.responsive?.mobile?.backdropFilter,
    "--bn-mobile-mix-blend-mode": style?.responsive?.mobile?.mixBlendMode,
    "--bn-tablet-justify-content": style?.responsive?.tablet?.justifyContent,
    "--bn-tablet-align-items": style?.responsive?.tablet?.alignItems,
    "--bn-tablet-flex-wrap": style?.responsive?.tablet?.flexWrap,
    "--bn-mobile-justify-content": style?.responsive?.mobile?.justifyContent,
    "--bn-mobile-align-items": style?.responsive?.mobile?.alignItems,
    "--bn-mobile-flex-wrap": style?.responsive?.mobile?.flexWrap,
    "--bn-tablet-grid-template-columns": style?.responsive?.tablet?.gridTemplateColumns,
    "--bn-tablet-grid-template-rows": style?.responsive?.tablet?.gridTemplateRows,
    "--bn-tablet-grid-auto-flow": style?.responsive?.tablet?.gridAutoFlow,
    "--bn-mobile-grid-template-columns": style?.responsive?.mobile?.gridTemplateColumns,
    "--bn-mobile-grid-template-rows": style?.responsive?.mobile?.gridTemplateRows,
    "--bn-mobile-grid-auto-flow": style?.responsive?.mobile?.gridAutoFlow,
    "--bn-tablet-clip-path": style?.responsive?.tablet?.clipPath,
    "--bn-tablet-mask-image": style?.responsive?.tablet?.maskImage,
    "--bn-tablet-text-stroke": style?.responsive?.tablet?.textStroke,
    "--bn-tablet-cursor": style?.responsive?.tablet?.cursor,
    "--bn-tablet-user-select": style?.responsive?.tablet?.userSelect,
    "--bn-tablet-pointer-events": style?.responsive?.tablet?.pointerEvents,
    "--bn-tablet-scroll-snap-type": style?.responsive?.tablet?.scrollSnapType,
    "--bn-tablet-scroll-snap-align": style?.responsive?.tablet?.scrollSnapAlign,
    "--bn-tablet-outline": style?.responsive?.tablet?.outline,
    "--bn-tablet-outline-offset": style?.responsive?.tablet?.outlineOffset,
    "--bn-tablet-accent-color": styleToken(style?.responsive?.tablet?.accentColor),
    "--bn-tablet-caret-color": styleToken(style?.responsive?.tablet?.caretColor),
    "--bn-tablet-transition-property":
      style?.responsive?.tablet?.transitionProperty,
    "--bn-tablet-transition-duration":
      style?.responsive?.tablet?.transitionDuration,
    "--bn-tablet-transition-timing-function":
      style?.responsive?.tablet?.transitionTimingFunction,
    "--bn-tablet-transition-delay": style?.responsive?.tablet?.transitionDelay,
    "--bn-mobile-clip-path": style?.responsive?.mobile?.clipPath,
    "--bn-mobile-mask-image": style?.responsive?.mobile?.maskImage,
    "--bn-mobile-text-stroke": style?.responsive?.mobile?.textStroke,
    "--bn-mobile-cursor": style?.responsive?.mobile?.cursor,
    "--bn-mobile-user-select": style?.responsive?.mobile?.userSelect,
    "--bn-mobile-pointer-events": style?.responsive?.mobile?.pointerEvents,
    "--bn-mobile-scroll-snap-type": style?.responsive?.mobile?.scrollSnapType,
    "--bn-mobile-scroll-snap-align": style?.responsive?.mobile?.scrollSnapAlign,
    "--bn-mobile-outline": style?.responsive?.mobile?.outline,
    "--bn-mobile-outline-offset": style?.responsive?.mobile?.outlineOffset,
    "--bn-mobile-accent-color": styleToken(style?.responsive?.mobile?.accentColor),
    "--bn-mobile-caret-color": styleToken(style?.responsive?.mobile?.caretColor),
    "--bn-mobile-transition-property":
      style?.responsive?.mobile?.transitionProperty,
    "--bn-mobile-transition-duration":
      style?.responsive?.mobile?.transitionDuration,
    "--bn-mobile-transition-timing-function":
      style?.responsive?.mobile?.transitionTimingFunction,
    "--bn-mobile-transition-delay": style?.responsive?.mobile?.transitionDelay,
    // Hover-state overrides — a single (non-viewport) layer. Each var only renders
    // when set; the matching data-builder-style-hover-* attr gates a :hover rule in
    // the static sheet so the override applies only while hovered/focused, and an
    // unset var never clobbers the resting value.
    "--bn-hover-bg": styleToken(style?.hover?.backgroundColor),
    "--bn-hover-color": styleToken(style?.hover?.color),
    "--bn-hover-border-color": styleToken(style?.hover?.borderColor),
    "--bn-hover-shadow": styleToken(style?.hover?.boxShadow),
    "--bn-hover-scale": style?.hover?.scale,
    "--bn-hover-translate": style?.hover?.translate,
    "--bn-hover-opacity": style?.hover?.opacity,
    // Wave 3 · 3D — universal state editor: focus-visible + active.
    "--bn-focus-bg": styleToken(style?.stateStyles?.focus?.backgroundColor),
    "--bn-focus-color": styleToken(style?.stateStyles?.focus?.color),
    "--bn-focus-border-color": styleToken(style?.stateStyles?.focus?.borderColor),
    "--bn-focus-shadow": styleToken(style?.stateStyles?.focus?.boxShadow),
    "--bn-focus-scale": style?.stateStyles?.focus?.scale,
    "--bn-focus-translate": style?.stateStyles?.focus?.translate,
    "--bn-focus-opacity": style?.stateStyles?.focus?.opacity,
    "--bn-active-bg": styleToken(style?.stateStyles?.active?.backgroundColor),
    "--bn-active-color": styleToken(style?.stateStyles?.active?.color),
    "--bn-active-border-color": styleToken(style?.stateStyles?.active?.borderColor),
    "--bn-active-shadow": styleToken(style?.stateStyles?.active?.boxShadow),
    "--bn-active-scale": style?.stateStyles?.active?.scale,
    "--bn-active-translate": style?.stateStyles?.active?.translate,
    "--bn-active-opacity": style?.stateStyles?.active?.opacity,
  });
}

// Map a friendly easing key to a CSS timing-function. "back" overshoots
// slightly (a tasteful spring feel); "smooth" is the Material standard curve.
// Wave 6B (#27): a free `custom` curve (cubic-bezier/steps/linear()) WINS over
// the named enum when set, so an author can dial in an exact timing curve. The
// custom string lands in an inline `animation` shorthand and is validated by the
// CSSOM; undefined → the named easing path (byte-identical to before).
function resolveAnimationEasing(
  easing: BuilderNodeStyle["animationEasing"],
  custom?: string,
): string {
  if (custom && custom.trim()) return custom.trim();
  switch (easing) {
    case "linear":
    case "ease-in":
    case "ease-out":
    case "ease-in-out":
      return easing;
    case "back":
      return "cubic-bezier(0.34, 1.56, 0.64, 1)";
    case "smooth":
      return "cubic-bezier(0.4, 0, 0.2, 1)";
    case "ease":
    default:
      return "ease";
  }
}

// Wave 6B (#27) — named parallax intensity → the baked keyframe + drift amount.
// The keyframe glides the node ±`amount` of the viewport as it passes through,
// driven by `animation-timeline:view()` (the whole on-screen pass).
const BUILDER_PARALLAX_KEYFRAME: Record<
  Exclude<NonNullable<BuilderNodeStyle["parallax"]>, "none">,
  string
> = {
  subtle: "bn-parallax-subtle",
  medium: "bn-parallax-medium",
  strong: "bn-parallax-strong",
};

/** Per-side margin escapes in {@link sharedNodeStyle} must not mix with `margin` shorthand. */
const MARGIN_ZERO: CSSProperties = {
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
};

function marginShorthandToLonghand(
  margin: CSSProperties["margin"],
): Partial<
  Pick<CSSProperties, "marginTop" | "marginRight" | "marginBottom" | "marginLeft">
> {
  if (margin === undefined) return {};
  if (margin === 0 || margin === "0" || margin === "0px") {
    return { marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0 };
  }
  if (margin === "0 auto" || margin === "0px auto") {
    return {
      marginTop: 0,
      marginRight: "auto",
      marginBottom: 0,
      marginLeft: "auto",
    };
  }
  return {};
}

/** Merge inline node styles without mixing `margin` shorthand + per-side margins. */
export function composeInlineNodeStyle(
  ...layers: Array<CSSProperties | undefined>
): CSSProperties {
  const merged: CSSProperties = {};
  for (const layer of layers) {
    if (layer) Object.assign(merged, layer);
  }
  const {
    margin,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    ...rest
  } = merged;
  const hasLonghand =
    marginTop !== undefined ||
    marginRight !== undefined ||
    marginBottom !== undefined ||
    marginLeft !== undefined;
  if (margin === undefined || !hasLonghand) return merged;
  const fromShorthand = marginShorthandToLonghand(margin);
  return {
    ...rest,
    marginTop: marginTop ?? fromShorthand.marginTop,
    marginRight: marginRight ?? fromShorthand.marginRight,
    marginBottom: marginBottom ?? fromShorthand.marginBottom,
    marginLeft: marginLeft ?? fromShorthand.marginLeft,
  };
}

/** Module-level cache: style object identity → computed CSSProperties. */
const sharedNodeStyleCache = new WeakMap<object, CSSProperties>();

/**
 * Mobile-safety clamp for a FREE fixed-length `width` / `minWidth` escape.
 *
 * A node that hard-codes a desktop-scale pixel width (the classic offender: a
 * content container baked at `width:1120px` in an older published tree) will
 * blow past a ~390px phone viewport and force the whole page to scroll
 * horizontally. Wrapping the value in `min(<value>, 100%)` makes it
 * self-clamping: on a wide desktop parent `min(1120px,100%)` still computes to
 * `1120px` (byte-identical desktop render), while on a narrow phone the `100%`
 * arm wins and the node shrinks to fit its container instead of overflowing.
 *
 * Only pure fixed lengths at or above a mobile-unsafe threshold are wrapped, so
 * small decorative widths (a 30px rule, a 46px disc) and intrinsic/relative
 * keywords (`100%`, `max-content`, `auto`, `calc(...)`, `min(...)`, `clamp(...)`,
 * viewport units) are emitted unchanged — the marquee tracks that rely on
 * `width:max-content` + parent `overflow:hidden` keep working.
 */
const MOBILE_UNSAFE_WIDTH_PX = 360;
function clampFreeWidthForMobile(value: string): string {
  const match = /^\s*(\d+(?:\.\d+)?)(px|rem|em)\s*$/.exec(value);
  if (!match) return value; // %, vw, calc(), min(), max-content, auto → leave as-is
  const n = Number(match[1]);
  const unit = match[2];
  const px = unit === "px" ? n : n * 16; // rem/em ≈ 16px root
  if (px < MOBILE_UNSAFE_WIDTH_PX) return value; // small decorative sizes untouched
  return `min(${value.trim()}, 100%)`;
}

export function inlineNodeStyle(
  style: BuilderNodeStyle | undefined,
  ...base: Array<CSSProperties | undefined>
): CSSProperties {
  return composeInlineNodeStyle(...base, sharedNodeStyle(style));
}

export function sharedNodeStyle(style: BuilderNodeStyle | undefined): CSSProperties {
  if (!style) return {};
  const cached = sharedNodeStyleCache.get(style);
  if (cached) return cached;
  const out: CSSProperties = {
    ...responsiveStyleVars(style),
  };
  if (style.align) out.textAlign = style.align;
  if (style.maxWidth) out.maxWidth = NODE_MAX_WIDTH[style.maxWidth];
  if (style.marginTop) out.marginTop = NODE_SPACING[style.marginTop];
  if (style.marginBottom) out.marginBottom = NODE_SPACING[style.marginBottom];
  if (style.paddingX) {
    out.paddingLeft = NODE_SPACING[style.paddingX];
    out.paddingRight = NODE_SPACING[style.paddingX];
  }
  if (style.paddingY) {
    out.paddingTop = NODE_SPACING[style.paddingY];
    out.paddingBottom = NODE_SPACING[style.paddingY];
  }
  if (style.radius) out.borderRadius = NODE_RADIUS[style.radius];
  if (style.background === "surface") out.background = "var(--token-color-surface-raised, rgba(246, 241, 232, 0.92))";
  if (style.background === "contrast") {
    out.background = "var(--token-color-ink,#111)";
    out.color = "#fff";
  }
  // AIQ-13 — theme-paired band roles. Each emits a background AND its guaranteed
  // paired foreground (like "contrast" does), so a tenant's own brand color paints
  // the band and the text stays readable on every theme. Kept AFTER surface/
  // contrast and BEFORE tone so an explicit tone/textColor still wins.
  if (style.background === "accent") {
    out.background = "var(--token-color-primary, var(--token-color-ink, #111))";
    out.color = "var(--token-color-surface-raised, #fff)";
  }
  if (style.background === "muted") {
    out.background =
      "color-mix(in oklab, var(--token-color-surface-raised, #f6f1e8) 62%, var(--token-color-ink, #111) 4%)";
    out.color = "var(--token-color-ink, #111)";
  }
  if (style.tone === "muted") out.color = "var(--token-color-muted, rgba(18, 18, 18, 0.62))";
  if (style.tone === "strong") out.color = "var(--token-color-ink,#111)";
  // Free-value escapes — applied last so they override the token presets above.
  // fontFamily may be a `token:typography.*-font-family` binding → resolved to
  // the theme font var; a raw stack is emitted unchanged.
  if (style.fontFamily) out.fontFamily = styleToken(style.fontFamily);
  // fontSize may bind to a type-scale token (`token:typography.h2-size`); a raw
  // length is emitted unchanged (resolveStyleTokenRef returns it by identity).
  if (style.fontSize) out.fontSize = styleToken(style.fontSize);
  if (typeof style.fontWeight === "number") out.fontWeight = style.fontWeight;
  if (style.lineHeight) out.lineHeight = style.lineHeight;
  if (style.letterSpacing) out.letterSpacing = style.letterSpacing;
  if (style.textTransform) out.textTransform = style.textTransform;
  if (style.fontStyle) out.fontStyle = style.fontStyle;
  if (style.textDecoration) out.textDecoration = style.textDecoration;
  // Advanced text controls.
  if (style.textWrap) {
    (out as Record<string, unknown>).textWrap = style.textWrap;
  }
  if (style.whiteSpace) out.whiteSpace = style.whiteSpace;
  // Line-clamp truncates to N lines with an ellipsis — needs the -webkit-box
  // display + vertical orient + hidden overflow together.
  if (typeof style.lineClamp === "number" && style.lineClamp > 0) {
    out.display = "-webkit-box";
    out.WebkitLineClamp = style.lineClamp;
    out.WebkitBoxOrient = "vertical";
    out.overflow = "hidden";
  }
  // Color emits — a `token:<key>` value binds to a Theme token (resolved to its
  // CSS var); a raw hex/rgb/keyword is emitted unchanged (flagship-identical).
  if (style.textColor) out.color = styleToken(style.textColor);
  if (style.backgroundColor) out.backgroundColor = styleToken(style.backgroundColor);
  if (style.borderColor || style.borderWidth || style.borderStyle) {
    out.borderStyle = style.borderStyle ?? "solid";
    out.borderWidth = style.borderWidth ?? "1px";
    if (style.borderColor) out.borderColor = styleToken(style.borderColor);
  }
  // Free border-radius escape — applied after the radius token so an exact value
  // (or per-corner shorthand) wins over the preset. May ALSO be a
  // `token:radius.*` binding → resolved to var(--site-radius-*, fallback) so a
  // live "Radius scale" theme change re-rounds it; a raw value is unchanged.
  if (style.borderRadius) out.borderRadius = styleToken(style.borderRadius);
  // Free dimension escapes — exact width/height + min/max clamps. width coexists
  // with the maxWidth token above; maxWidthFree is applied after it so an exact
  // clamp wins over the preset.
  if (style.width) out.width = clampFreeWidthForMobile(style.width);
  if (style.height) out.height = style.height;
  if (style.minHeight) out.minHeight = style.minHeight;
  if (style.minWidth) out.minWidth = clampFreeWidthForMobile(style.minWidth);
  if (style.maxWidthFree) out.maxWidth = style.maxWidthFree;
  if (style.maxHeight) out.maxHeight = style.maxHeight;
  // Free per-side padding — applied after the paddingX/paddingY token so an
  // exact side overrides the preset. Each may bind to a `token:space.*` var; a
  // raw length is emitted unchanged.
  if (style.paddingTop) out.paddingTop = styleToken(style.paddingTop);
  if (style.paddingRight) out.paddingRight = styleToken(style.paddingRight);
  if (style.paddingBottom) out.paddingBottom = styleToken(style.paddingBottom);
  if (style.paddingLeft) out.paddingLeft = styleToken(style.paddingLeft);
  // Free per-side margin — applied after the marginTop/marginBottom token so an
  // exact side overrides the preset (and adds left/right, which have no token).
  if (style.marginTopFree) out.marginTop = styleToken(style.marginTopFree);
  if (style.marginRightFree) out.marginRight = styleToken(style.marginRightFree);
  if (style.marginBottomFree) out.marginBottom = styleToken(style.marginBottomFree);
  if (style.marginLeftFree) out.marginLeft = styleToken(style.marginLeftFree);
  // Surface & depth escapes. A box-shadow layers over the token background; a
  // background image/gradient is painted cover/center/no-repeat; opacity 0–1.
  // boxShadow may bind to a `token:shadow.*` var; a raw shadow is unchanged.
  if (style.boxShadow) out.boxShadow = styleToken(style.boxShadow);
  if (style.textShadow) out.textShadow = style.textShadow;
  // Paint a background image at the desktop level AND whenever any breakpoint
  // sets one, so the paint axes (cover/center/no-repeat defaults, or the free
  // backgroundSize / backgroundPosition / backgroundRepeat overrides) ride the
  // inline style across every breakpoint. The responsive bg-image CSS rule only
  // swaps the image via its var — it never re-forces the paint axes — so a
  // desktop override (e.g. "contain") is never reset at tablet / mobile.
  const hasAnyBackgroundImage =
    style.backgroundImage ||
    style.responsive?.tablet?.backgroundImage ||
    style.responsive?.mobile?.backgroundImage;
  if (style.backgroundImage) out.backgroundImage = style.backgroundImage;
  if (hasAnyBackgroundImage) {
    out.backgroundSize = style.backgroundSize ?? "cover";
    out.backgroundPosition = style.backgroundPosition ?? "center";
    out.backgroundRepeat = style.backgroundRepeat ?? "no-repeat";
  }
  // Layered background system (Wave 3 · 3C). Stacks multiple gradient / image /
  // solid-color layers into a comma-joined background-image value with an
  // optional background-blend-mode. Applied AFTER the scalar backgroundImage
  // so it composes on top — a node with ONLY backgroundImage (the old path,
  // used by the flagship) never reaches this branch and renders byte-identical.
  if (style.backgroundLayers && style.backgroundLayers.length > 0) {
    const layerCss = style.backgroundLayers.map((layer) => {
      if (layer.type === "color") {
        // Wrap a solid color in a gradient so it participates in the stack.
        return `linear-gradient(${layer.value},${layer.value})`;
      }
      return layer.value; // gradient string or url(…) — already valid CSS
    });
    // Prepend to any existing backgroundImage so the layers paint on top.
    const existing = out.backgroundImage as string | undefined;
    out.backgroundImage = existing
      ? [...layerCss, existing].join(",")
      : layerCss.join(",");
    // Paint axes: size=cover/pos=center/repeat=no-repeat per layer unless the
    // free overrides are set. Comma-join repeats each value once per layer.
    const count = layerCss.length + (existing ? 1 : 0);
    const sizes = Array(count).fill(style.backgroundSize ?? "cover");
    const positions = Array(count).fill(style.backgroundPosition ?? "center");
    const repeats = Array(count).fill(style.backgroundRepeat ?? "no-repeat");
    out.backgroundSize = sizes.join(",");
    out.backgroundPosition = positions.join(",");
    out.backgroundRepeat = repeats.join(",") as CSSProperties["backgroundRepeat"];
  }
  if (style.backgroundBlendMode) {
    (out as Record<string, unknown>).backgroundBlendMode =
      style.backgroundBlendMode;
  }
  // Gradient/clipped text — paint the background through the text glyphs. Gated
  // on an actual background paint so we never blank the text, and bundled with
  // the -webkit- prefix + transparent text fill the technique requires. Set at
  // the base layer so it cascades to every breakpoint.
  if (
    style.backgroundClip === "text" &&
    (style.backgroundImage || style.backgroundColor)
  ) {
    out.backgroundClip = "text";
    out.WebkitBackgroundClip = "text";
    out.WebkitTextFillColor = "transparent";
  }
  if (typeof style.opacity === "number") out.opacity = style.opacity;
  // Free gap escape — reassign the --bn-gap variable that every layout consumer
  // reads. Spread after the node's own --bn-gap (see containerStyle etc.) so the
  // exact value wins, and inherited by child tracks (carousel) automatically.
  // May bind to a `token:space.*` var; a raw length is emitted unchanged.
  if (style.gap) out["--bn-gap" as keyof CSSProperties] = styleToken(style.gap) as never;
  // Positioning escapes — a position context plus inset offsets. Applied after
  // layout so an explicit position/offset wins; negatives enable overlaps.
  if (style.position) out.position = style.position;
  if (style.top) out.top = style.top;
  if (style.right) out.right = style.right;
  if (style.bottom) out.bottom = style.bottom;
  if (style.left) out.left = style.left;
  // Wave 6B (#23) — sticky pinning convenience. Setting stickyAnchor makes the
  // node sticky and writes the inset on the anchored edge, but ONLY where the
  // raw escapes above didn't already set a value (explicit position/top/bottom
  // always win — so existing position:sticky+top trees are byte-identical, and
  // a free escape can override the convenience). stickyOffset defaults to 0.
  if (style.stickyAnchor) {
    if (!style.position) out.position = "sticky";
    const offset = style.stickyOffset && style.stickyOffset.trim()
      ? style.stickyOffset.trim()
      : "0px";
    if (style.stickyAnchor === "top" && !style.top) out.top = offset;
    if (style.stickyAnchor === "bottom" && !style.bottom) out.bottom = offset;
  }
  // Stacking & clipping escapes — z-index orders overlapping nodes (0 is a
  // valid value, so test the type); overflow clips/scrolls the node's box.
  if (typeof style.zIndex === "number") out.zIndex = style.zIndex;
  if (style.overflow) out.overflow = style.overflow;
  // Transform escapes — standalone rotate/scale/translate (compose
  // independently of any position/layout). Applied after positioning so they
  // layer on top. transformOrigin sets the pivot for rotate/scale.
  if (style.rotate) out.rotate = style.rotate;
  if (style.scale) out.scale = style.scale;
  if (style.translate) out.translate = style.translate;
  if (style.transformOrigin) out.transformOrigin = style.transformOrigin;
  // Legacy transition shorthand. First-class longhands + hover auto-defaults
  // emit through the renderer CSS var/data-attr path above.
  if (style.transition) out.transition = style.transition;
  // Flex/grid child placement — how this node sizes/aligns inside its parent
  // (0 is meaningful for grow/shrink, so test the type). No-op outside flex/grid.
  if (style.alignSelf) out.alignSelf = style.alignSelf;
  if (typeof style.flexGrow === "number") out.flexGrow = style.flexGrow;
  if (typeof style.flexShrink === "number") out.flexShrink = style.flexShrink;
  if (style.flexBasis) out.flexBasis = style.flexBasis;
  // Grid child placement — span/line position in a grid parent. No-op elsewhere.
  if (style.gridColumn) out.gridColumn = style.gridColumn;
  if (style.gridRow) out.gridRow = style.gridRow;
  // Flex/grid child order — reposition among siblings without moving in the DOM
  // (0 is a valid order, so test the type). No-op outside a flex/grid parent.
  if (typeof style.order === "number") out.order = style.order;
  // Flex/grid container layout — distribute this node's OWN children on the main
  // axis (justifyContent) / cross axis (alignItems) and control row wrapping.
  // Applied inline so a free value wins over the container's structured align /
  // hardcoded wrap. No-op on non-flex/grid nodes.
  if (style.justifyContent) out.justifyContent = style.justifyContent;
  if (style.alignItems) out.alignItems = style.alignItems;
  if (style.flexWrap) out.flexWrap = style.flexWrap;
  // Grid container tracks — free column/row templates + implicit-flow direction.
  // Applied inline so an exact track definition wins over the container's
  // structured repeat(columns) grid. No-op on non-grid nodes.
  if (style.gridTemplateColumns) out.gridTemplateColumns = style.gridTemplateColumns;
  if (style.gridTemplateRows) out.gridTemplateRows = style.gridTemplateRows;
  if (style.gridAutoFlow) out.gridAutoFlow = style.gridAutoFlow;
  // Filter effects — self filter + backdrop frost (with the -webkit- prefix so
  // backdrop-filter works on Safari).
  if (style.filter) out.filter = style.filter;
  if (style.backdropFilter) {
    out.backdropFilter = style.backdropFilter;
    out.WebkitBackdropFilter = style.backdropFilter;
  }
  // Compositing — blend this node against the backdrop (overlays/duotone).
  if (style.mixBlendMode) out.mixBlendMode = style.mixBlendMode;
  // Premium-2026 effect & interaction escapes — applied last so they layer over
  // everything. clipPath/maskImage carry the -webkit- prefix for Safari;
  // textStroke maps to -webkit-text-stroke (outlined/hollow glyphs).
  if (style.clipPath) {
    out.clipPath = style.clipPath;
    (out as Record<string, unknown>).WebkitClipPath = style.clipPath;
  }
  if (style.maskImage) {
    (out as Record<string, unknown>).maskImage = style.maskImage;
    out.WebkitMaskImage = style.maskImage;
  }
  if (style.textStroke) {
    (out as Record<string, unknown>).WebkitTextStroke = style.textStroke;
  }
  if (style.cursor) out.cursor = style.cursor;
  if (style.userSelect) {
    out.userSelect = style.userSelect;
    out.WebkitUserSelect = style.userSelect;
  }
  if (style.pointerEvents) out.pointerEvents = style.pointerEvents;
  if (style.scrollSnapType) out.scrollSnapType = style.scrollSnapType;
  if (style.scrollSnapAlign) out.scrollSnapAlign = style.scrollSnapAlign;
  if (style.outline) out.outline = style.outline;
  if (style.outlineOffset) out.outlineOffset = style.outlineOffset;
  if (style.accentColor) out.accentColor = styleToken(style.accentColor);
  if (style.caretColor) out.caretColor = styleToken(style.caretColor);
  // Entrance animation — fires on the PUBLISHED page only (the edit canvas uses
  // a separate renderer, so the inspector won't re-animate on every keystroke).
  // Maps a friendly preset to a named @keyframe in the static sheet; `both`
  // fill keeps the end state. Honours prefers-reduced-motion via the sheet.
  if (style.animationPreset && style.animationPreset !== "none") {
    const duration = style.animationDuration || "0.6s";
    const delay = style.animationDelay || "0s";
    const easing = resolveAnimationEasing(
      style.animationEasing,
      style.animationEasingCustom,
    );
    out.animation = `bn-anim-${style.animationPreset} ${duration} ${easing} ${delay} both`;
    if (style.animationTrigger === "scroll") {
      // CSS scroll-driven animation — progress maps to the node entering the
      // viewport. Pure CSS; unsupported browsers ignore the timeline and just
      // play it on load. The view-timeline ignores the duration above.
      const record = out as Record<string, unknown>;
      record.animationTimeline = "view()";
      record.animationRange = "entry 0% cover 35%";
    }
  }
  // Wave 6B (#27) — scroll parallax. Persistent scroll-driven drift, independent
  // of the entrance preset. When BOTH are set, parallax wins the single
  // `animation` slot (entrance is the one-shot intro; parallax is what the
  // visitor keeps seeing as they scroll). Driven by `animation-timeline:view()`
  // over the node's full on-screen pass, linear so the drift tracks scroll 1:1.
  // The baked keyframe lives in the static sheet; the reduced-motion guard there
  // ([style*="animation"]) disables it for visitors who asked for less motion.
  if (style.parallax && style.parallax !== "none") {
    const record = out as Record<string, unknown>;
    record.animation = `${BUILDER_PARALLAX_KEYFRAME[style.parallax]} linear both`;
    record.animationTimeline = "view()";
    record.animationRange = "cover 0% cover 100%";
  }
  // Reveal-on-view (2026-06-04) — IntersectionObserver-driven entry. The
  // direction is carried by the `data-bn-reveal` attribute (see
  // builderNodeStyleAttrs); here we publish the tuning vars the sheet reads. The
  // hidden/offset pose only applies once the inline script arms the node, so a
  // no-JS render shows it at rest (no flash of hidden content).
  if (style.revealOnView && style.revealOnView !== "none") {
    const record = out as Record<string, unknown>;
    if (style.revealDistance) record["--bn-reveal-distance"] = style.revealDistance;
    if (style.revealDuration) record["--bn-reveal-duration"] = style.revealDuration;
    if (style.revealDelay) record["--bn-reveal-delay"] = style.revealDelay;
    if (style.revealEasing) {
      record["--bn-reveal-easing"] = resolveAnimationEasing(style.revealEasing);
    }
  }
  // Visibility — a desktop-level "hidden" removes the node everywhere (the
  // breakpoint layers inherit it). Per-breakpoint hides are handled by the
  // data-attr + media rules in builderNodeStyleAttrs / the static sheet.
  if (style.visibility === "hidden") out.display = "none";
  Object.freeze(out);
  sharedNodeStyleCache.set(style, out);
  return out;
}

function hasRenderableChildren(
  node: BuilderNode,
): node is BuilderNode & { children: BuilderNode[] } {
  return "children" in node && Array.isArray(node.children) && node.children.length > 0;
}

/**
 * Runtime guard for a builder node's `children`. Container node kinds type
 * `children` as required, but a malformed / legacy / AI-authored draft tree —
 * or the live edit-mode canvas bridge, which renders the draft WITHOUT a
 * `validateBuilderNodeTree` normalization pass — can reach the renderer with
 * `children` undefined. An unguarded `.filter/.map/.slice/.find` then throws
 * ("reading 'filter' of undefined") and crashes the whole canvas — the same
 * class as the snapshot.slots crash (#646). Always read children through this
 * inside the renderer.
 */
function nodeChildren(node: BuilderNode): BuilderNode[] {
  const kids = (node as { children?: unknown }).children;
  return Array.isArray(kids) ? (kids as BuilderNode[]) : [];
}

/**
 * PERF (A3) — per-NODE memo boundary for descendants.
 *
 * `BuilderNodeView` at the top level (renderBuilderNodes) only made the memo
 * granularity per-ROOT-BLOCK: a patch to one deep node re-created the node
 * identities along its ancestor path, the root's `BuilderNodeView` re-rendered,
 * and `renderChildren` then rebuilt the ENTIRE root subtree because it called
 * `renderBuilderNode(child, options)` directly with no memo boundary between
 * siblings. Emitting each child through `BuilderNodeView` makes the bail
 * per-node: an immutable tree patch re-renders exactly the ancestor path of the
 * patched node — unchanged sibling subtrees keep their previous vdom.
 *
 * Output is byte-identical: `BuilderNodeView` renders EXACTLY what
 * `renderBuilderNode(child, options)` returns (no wrapper element), and the
 * `key={child.id}` on the boundary matches the `key={node.id}` the rendered
 * root element carried before, so list reconciliation is unchanged.
 *
 * Repaint guarantees (audited — see canvas-render-granularity.test.tsx):
 *   - node changes → immutable ops re-identify the ancestor path → repaint.
 *   - theme/style-class/component-default/locale/dataSources changes → the
 *     canvas options useMemo re-identifies `options` → EVERY boundary's
 *     `Object.is(options)` half fails → full repaint.
 *   - React context updates propagate THROUGH memo components by design, so a
 *     context-driven child never goes stale behind this boundary.
 */
function renderChildren(
  node: BuilderNode & { children: BuilderNode[] },
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  return nodeChildren(node)
    .filter((child) => shouldRenderNode(child, options))
    .map((child) => (
      <BuilderNodeView key={child.id} node={child} options={options} />
    ));
}

function renderRepeatContainerChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode | null {
  const template = nodeChildren(node).find((child) => shouldRenderNode(child, options));
  if (!template) return renderChildren(node, options);
  const binding = getBuilderNodeDataBinding(node);
  const records = binding
    ? collectionRecordsForSource(binding.sourceKey, options.dataSources)
    : [];
  const items = resolveBuilderDataBindingCollection(binding, records);
  if (items.length === 0 || options.repeatDepth >= MAX_REPEAT_RENDER_DEPTH) {
    return (
      <BuilderNodeView key={template.id} node={template} options={options} />
    );
  }
  return items.map((item) => {
    const namespace = `${node.id}__repeat_${item.key}`;
    const materialized = materializeRepeatTemplateIds(template, namespace);
    return renderBuilderNode(materialized, {
      ...options,
      repeatItem: item,
      repeatDepth: options.repeatDepth + 1,
    });
  });
}

function collectionRecordsForSource(
  sourceKey: string,
  dataSources: BuilderNodeRenderDataSources,
): ReadonlyArray<BuilderDataSourceRecord> {
  const custom = dataSources.collections?.[sourceKey];
  if (custom) return custom;
  switch (sourceKey) {
    case "featured_talent_profiles":
      return (dataSources.featuredTalentProfiles ?? []).map((card) => ({
        ...card,
        imageUrl: card.thumbnailUrl,
        href: profileHrefForRepeat(card),
      }));
    case "talent_locations":
      return (dataSources.talentLocations ?? []).map((location) => ({
        ...location,
        href: `/directory?location=${encodeURIComponent(location.citySlug)}`,
      }));
    case "tenant_directory_search":
      return (dataSources.directoryShortcuts ?? []).map((shortcut) => ({
        ...shortcut,
        // Deep-link by taxonomy term UUID (?tax=), which the directory parser
        // reads; ?type=<slug> was silently ignored → unfiltered roster.
        href: `/directory?tax=${encodeURIComponent(shortcut.id)}`,
      }));
    case "workspace_social_links":
      return (dataSources.socialLinks ?? []).map((link) => ({ ...link }));
    case "cms_page":
    case "cms_posts":
      // A4 follow-up — collection nav sources. The SHELL/server caller injects
      // the resolved records into `dataSources.collections[sourceKey]` (handled
      // by the `custom` short-circuit above); with nothing injected this returns
      // [] so a bound nav simply falls back to its static links.
      return [];
    default:
      return [];
  }
}

/**
 * A4 follow-up — project resolved collection records into flat nav links
 * (label + href). PURE: used by the `nav` render case to auto-populate a bound
 * nav. Records without a usable href are dropped (no dead `<a href>`); the label
 * falls back through `label → title → href` so a page/post row always shows
 * something. `maxItems` caps the row when set. Returns [] when there are no
 * usable records, so the nav case can fall back to static links.
 */
export function navLinksFromRecords(
  records: ReadonlyArray<BuilderDataSourceRecord>,
  maxItems?: number,
): Array<{ id: string; label: string; href: string }> {
  const out: Array<{ id: string; label: string; href: string }> = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i]!;
    const href = typeof record.href === "string" ? record.href.trim() : "";
    if (!href) continue;
    const labelRaw =
      (typeof record.label === "string" && record.label.trim()) ||
      (typeof record.title === "string" && record.title.trim()) ||
      href;
    out.push({ id: `bound-${i}`, label: labelRaw, href });
  }
  if (typeof maxItems === "number" && maxItems > 0) {
    return out.slice(0, maxItems);
  }
  return out;
}

function profileHrefForRepeat(card: FeaturedTalentCardDTO): string {
  const code = encodeURIComponent(card.profileCode);
  // The /t/ route resolves by EXACT profile_code; a `-<slug>` suffix 404s
  // (and slugPart can equal the code, doubling it). Link by code only.
  return `/t/${code}`;
}

function materializeRepeatTemplateIds(node: BuilderNode, namespace: string): BuilderNode {
  const namespacedId = `${namespace}__${node.id}`;
  if (!("children" in node) || !Array.isArray(node.children)) {
    return { ...node, id: namespacedId } as BuilderNode;
  }
  const props = node.props as Record<string, unknown>;
  let nextProps: Record<string, unknown> = { ...props };
  if (node.kind === "accordion" && Array.isArray(props.defaultOpenItemIds)) {
    nextProps = {
      ...nextProps,
      defaultOpenItemIds: (props.defaultOpenItemIds as string[]).map(
        (id) => `${namespace}__${id}`,
      ),
    };
  }
  if (node.kind === "tabs" && typeof props.defaultTabId === "string") {
    nextProps = { ...nextProps, defaultTabId: `${namespace}__${props.defaultTabId}` };
  }
  return {
    ...node,
    id: namespacedId,
    props: nextProps,
    children: node.children.map((child) =>
      materializeRepeatTemplateIds(child, namespace),
    ),
  } as BuilderNode;
}

function renderDataBoundContainerChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  // Phase 3 — live component instance. When this container is a linked instance
  // and its master definition is available, render the resolved master subtree
  // (with per-instance overrides) LIVE. resolveInstanceChildren returns null when
  // the component is missing/unloaded, so we fall through to the node's own
  // stored children — a published page can never blank out.
  if (node.props.instanceOf) {
    const resolved = resolveInstanceChildren(node, options.components);
    if (resolved) {
      // PERF (A3) — same per-node boundary as renderChildren. Instance-resolved
      // children are re-derived per render (fresh identities), so the memo
      // rarely bails here — but routing through the boundary keeps one code
      // path and lets a memoized resolver bail in the future.
      return resolved
        .filter((child) => shouldRenderNode(child, options))
        .map((child) => (
          <BuilderNodeView key={child.id} node={child} options={options} />
        ));
    }
  }
  if (isBuilderDataBindingRepeater(getBuilderNodeDataBinding(node))) {
    return renderRepeatContainerChildren(node, options);
  }
  const sourceKey = node.props.dataBinding?.sourceKey;
  if (sourceKey === "tenant_directory_search") {
    return renderDirectorySearchChildren(node, options);
  }
  if (sourceKey === "featured_talent_profiles") {
    return renderFeaturedTalentChildren(node, options);
  }
  if (sourceKey === "talent_locations") {
    return renderTalentLocationChildren(node, options);
  }
  return renderChildren(node, options);
}

function renderFeaturedTalentChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  const limit = node.props.dataBinding?.maxItems ?? 4;
  const cards = (options.dataSources.featuredTalentProfiles ?? []).slice(0, limit);
  if (cards.length === 0) {
    return renderChildren(node, options);
  }

  const editableIntroChildren = nodeChildren(node)
    .slice(0, 2)
    .filter((child) => shouldRenderNode(child, options));

  return (
    <>
      {editableIntroChildren.map((child) => (
        <BuilderNodeView key={child.id} node={child} options={options} />
      ))}
      <div
        className="site-builder-node--live-talent-grid"
        data-builder-live-data-grid="featured_talent_profiles"
        style={builderNodeStyleVars({
          "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
          "--bn-live-columns": node.props.columns ?? 4,
        })}
      >
        {cards.map((card, index) => (
          <FeaturedTalentCard
            key={card.id}
            card={card}
            priority={index < 2}
            publicPathPrefix={options.publicPathPrefix}
          />
        ))}
      </div>
    </>
  );
}

function renderTalentLocationChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  const limit = node.props.dataBinding?.maxItems ?? 6;
  const locations = (options.dataSources.talentLocations ?? []).slice(0, limit);
  if (locations.length === 0) return renderChildren(node, options);

  const introChildren = nodeChildren(node)
    .slice(0, 2)
    .filter((child) => shouldRenderNode(child, options));
  const mapPlaceholder = nodeChildren(node)
    .slice(3)
    .filter((child) => shouldRenderNode(child, options));

  return (
    <>
      {introChildren.map((child) => (
        <BuilderNodeView key={child.id} node={child} options={options} />
      ))}
      <div
        className="site-builder-node--live-chip-grid"
        data-builder-live-data-grid="talent_locations"
      >
        {locations.map((location) => (
          <a
            key={location.id}
            className="site-builder-node--live-chip"
            href={prefixPublicHref(
              `/directory?location=${encodeURIComponent(location.citySlug)}`,
              options.publicPathPrefix,
            )}
          >
            <strong>{location.displayName}</strong>
            <span>{location.talentCount} talents</span>
          </a>
        ))}
      </div>
      {mapPlaceholder.map((child) => (
        <BuilderNodeView key={child.id} node={child} options={options} />
      ))}
    </>
  );
}

function renderDirectorySearchChildren(
  node: Extract<BuilderNode, { kind: "container" }>,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  const shortcuts = (options.dataSources.directoryShortcuts ?? []).slice(0, 6);
  if (shortcuts.length === 0) return renderChildren(node, options);

  const introChildren = nodeChildren(node)
    .slice(0, 2)
    .filter((child) => shouldRenderNode(child, options));

  return (
    <>
      {introChildren.map((child) => (
        <BuilderNodeView key={child.id} node={child} options={options} />
      ))}
      <form
        action={prefixPublicHref("/directory", options.publicPathPrefix)}
        className="site-builder-node--live-search-shell"
        data-builder-live-data-grid="tenant_directory_search"
      >
        <span>Search the directory by role, location, or fit</span>
        <button type="submit" className="site-builder-node site-builder-node--button">
          Search
        </button>
      </form>
      <div className="site-builder-node--live-chip-grid">
        {shortcuts.map((shortcut) => (
          <a
            key={shortcut.id}
            className="site-builder-node--live-chip"
            href={prefixPublicHref(
              `/directory?tax=${encodeURIComponent(shortcut.id)}`,
              options.publicPathPrefix,
            )}
          >
            <strong>{shortcut.name}</strong>
          </a>
        ))}
      </div>
    </>
  );
}

function shouldRenderNode(
  node: BuilderNode,
  options: Pick<NormalizedBuilderNodeRenderOptions, "mode" | "visibilityContext">,
): boolean {
  if (node.kind === "section") return false;
  if (options.mode === "freeform" && resolveBuilderNodeRole(node.id)) return false;
  // Wave 5B · #38 — OPTIONAL conditional visibility. Evaluated server-side at
  // this single choke point so a hidden node is OMITTED (no DOM, no flash).
  // No condition → always shown (back-compat); a signal the context lacks
  // passes (never hides on a missing signal).
  if (!evaluateBuilderNodeVisibility(node, options.visibilityContext)) {
    return false;
  }
  return true;
}

// Tiers whose container-layout overrides render via the STATIC stylesheet.
// Any other key in `responsive` is a custom tier handled at runtime by
// generateContainerLayoutCss + the data-attrs below.
const BUILTIN_CONTAINER_TIERS: ReadonlySet<string> = new Set(["tablet", "mobile"]);

// Emit `--bn-<tier>-columns` for each custom tier so the runtime grid rule can
// thread the per-tier column count (mirrors the static --bn-tablet/mobile vars).
function customTierColumnVars(
  responsive: Extract<BuilderNode, { kind: "container" }>["props"]["responsive"],
): Record<string, string | number | undefined> {
  if (!responsive) return {};
  const out: Record<string, string | number | undefined> = {};
  for (const [tierId, bucket] of Object.entries(responsive)) {
    if (BUILTIN_CONTAINER_TIERS.has(tierId)) continue;
    if (bucket?.columns !== undefined) out[`--bn-${tierId}-columns`] = bucket.columns;
  }
  return out;
}

// Emit `--bn-<tier>-items-per-view` for each custom tier so the runtime slider
// rule can thread the per-tier tile count (mirrors customTierColumnVars).
function customTierItemsPerViewVars(
  responsive: Extract<BuilderNode, { kind: "container" }>["props"]["responsive"],
): Record<string, string | number | undefined> {
  if (!responsive) return {};
  const out: Record<string, string | number | undefined> = {};
  for (const [tierId, bucket] of Object.entries(responsive)) {
    if (BUILTIN_CONTAINER_TIERS.has(tierId)) continue;
    if (bucket?.itemsPerView !== undefined) out[`--bn-${tierId}-items-per-view`] = bucket.itemsPerView;
  }
  return out;
}

// Emit `data-builder-<tier>-layout` for each custom tier (mirrors the static
// data-builder-tablet/mobile-layout attrs). Built-in tiers are emitted inline
// in the render JSX, so they are skipped here.
function customTierLayoutAttrs(
  responsive: Extract<BuilderNode, { kind: "container" }>["props"]["responsive"],
): Record<string, string> {
  if (!responsive) return {};
  const out: Record<string, string> = {};
  for (const [tierId, bucket] of Object.entries(responsive)) {
    if (BUILTIN_CONTAINER_TIERS.has(tierId)) continue;
    if (bucket?.layout) out[`data-builder-${tierId}-layout`] = bucket.layout;
    if (bucket?.display) out[`data-builder-${tierId}-display`] = bucket.display;
  }
  return out;
}

function containerStyle(node: Extract<BuilderNode, { kind: "container" }>): CSSProperties {
  return inlineNodeStyle(node.props.style, builderNodeStyleVars({
    "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
    "--bn-align": node.props.align ?? "stretch",
    "--bn-columns": node.props.columns ?? 2,
    "--bn-tablet-columns": node.props.responsive?.tablet?.columns,
    "--bn-mobile-columns": node.props.responsive?.mobile?.columns,
    "--bn-items-per-view": node.props.itemsPerView,
    "--bn-tablet-items-per-view": node.props.responsive?.tablet?.itemsPerView,
    "--bn-mobile-items-per-view": node.props.responsive?.mobile?.itemsPerView,
    ...customTierColumnVars(node.props.responsive),
    ...customTierItemsPerViewVars(node.props.responsive),
    }));
}

function splitStyle(node: Extract<BuilderNode, { kind: "split" }>): CSSProperties {
  const [left, right] = (node.props.ratio ?? "50-50").split("-").map(Number);
  return inlineNodeStyle(node.props.style, builderNodeStyleVars({
      "--bn-split-left": `${left}fr`,
      "--bn-split-right": `${right}fr`,
      "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
    }));
}

function cardStyle(node: Extract<BuilderNode, { kind: "card" }>): CSSProperties {
  return inlineNodeStyle(node.props.style, builderNodeStyleVars({
      "--bn-gap": GAP_BY_SIZE.m,
    }));
}

function ctaGroupStyle(node: Extract<BuilderNode, { kind: "cta_group" }>): CSSProperties {
  const alignMap = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    stretch: "stretch",
  } as const;
  const layout = node.props.layout ?? "row";
  const align = node.props.align ?? "center";
  // Structured justify/align come first; sharedNodeStyle is spread LAST so a free
  // justifyContent / alignItems / flexWrap escape wins over the cta_group preset
  // (matching the "free always wins" rule the container/split/card paths follow).
  const structured: CSSProperties =
    layout === "stack"
      ? { alignItems: align === "stretch" ? "stretch" : alignMap[align] }
      : {
          justifyContent: alignMap[align === "stretch" ? "center" : align],
          alignItems: "center",
        };
  return inlineNodeStyle(node.props.style, builderNodeStyleVars({
      "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
    }), structured);
}

function pricingTableStyle(
  node: Extract<BuilderNode, { kind: "pricing_table" }>,
): CSSProperties {
  return inlineNodeStyle(node.props.style, builderNodeStyleVars({
      "--bn-pricing-columns": Math.min(Math.max(node.props.tiers.length, 2), 4),
      "--bn-gap": GAP_BY_SIZE.m,
    }));
}

function resolveNodeStringProp(
  node: BuilderNode,
  prop: BuilderFieldBindingProp,
  fallbackValue: string,
  repeatItem: BuilderRepeatItem | null,
  contentLocale?: BuilderNodeContentLocaleOptions,
): { value: string; bound: boolean; isFallback: boolean } {
  // WS5 — for LOCALIZABLE props, swap the base (default-locale) value for the
  // locale-resolved value BEFORE field-binding. The base prop is the
  // default-locale value; `node.i18n[locale][prop]` supplies the rest. A
  // {{field}} binding (repeat data) still wins over both — it overrides the
  // resolved string just as it overrode the raw base value before.
  let baseValue = fallbackValue;
  let isFallback = false;
  if (contentLocale && isLocalizableProp(node.kind, prop)) {
    const map: Record<string, string | null | undefined> = {
      [contentLocale.defaultLocale]: fallbackValue,
    };
    const overlay = node.i18n;
    if (overlay) {
      for (const [code, props] of Object.entries(overlay)) {
        const v = props?.[prop];
        if (typeof v === "string") map[code] = v;
      }
    }
    const resolved = resolveLocalized(
      map,
      contentLocale.locale,
      contentLocale.chain,
    );
    // Keep the default-locale base when the overlay resolved to empty (e.g. a
    // brand-new node with no copy yet) so we never blank out a populated field.
    baseValue = resolved.value !== "" ? resolved.value : fallbackValue;
    isFallback = resolved.isFallback;
  }
  const fieldBindings = (node.props as { fieldBindings?: Record<string, string> })
    .fieldBindings;
  const bound = resolveBuilderFieldBindingValue(
    baseValue,
    fieldBindings?.[prop],
    repeatItem,
  );
  // A live field-binding supersedes the translation entirely → not a fallback.
  return { ...bound, isFallback: bound.bound ? false : isFallback };
}

/**
 * WS5 — resolve a localizable prop NOT covered by the field-binding props
 * (`title` on accordion/tab/embed, `brand` on nav, `label` on icon). No
 * `{{field}}` repeat-binding applies to these, so this is a pure overlay
 * resolution. Returns the localized value + whether it fell back. When no
 * `contentLocale` is supplied, returns the base value verbatim (byte-identical).
 */
function resolveNodeLocalizedText(
  node: BuilderNode,
  prop: string,
  baseValue: string,
  contentLocale: BuilderNodeContentLocaleOptions | undefined,
): { value: string; isFallback: boolean } {
  if (!contentLocale || !isLocalizableProp(node.kind, prop)) {
    return { value: baseValue, isFallback: false };
  }
  const map: Record<string, string | null | undefined> = {
    [contentLocale.defaultLocale]: baseValue,
  };
  const overlay = node.i18n;
  if (overlay) {
    for (const [code, props] of Object.entries(overlay)) {
      const v = props?.[prop];
      if (typeof v === "string") map[code] = v;
    }
  }
  const resolved = resolveLocalized(map, contentLocale.locale, contentLocale.chain);
  return {
    value: resolved.value !== "" ? resolved.value : baseValue,
    isFallback: resolved.isFallback,
  };
}

/**
 * WS5 — editor-only "needs translation" cue. Returns style + data-attr overrides
 * to splat onto a node element when its active-locale text fell back to another
 * locale AND we're in the editor preview (`editorPreview: true`). 40% opacity +
 * a dotted outline. Empty object on the published path (no `editorPreview`) or
 * when the node IS translated → byte-identical published markup.
 */
function localeFallbackCue(
  isFallback: boolean,
  contentLocale: BuilderNodeContentLocaleOptions | undefined,
): { style?: CSSProperties; attrs?: Record<string, string> } {
  if (!isFallback || !contentLocale?.editorPreview) return {};
  return {
    style: {
      opacity: 0.4,
      outline: "1px dotted rgba(124, 58, 237, 0.55)",
      outlineOffset: "2px",
    },
    attrs: { "data-builder-i18n-untranslated": contentLocale.locale },
  };
}

function renderButtonHref(
  href: { value: string; bound: boolean },
  publicPathPrefix: string,
): string | undefined {
  if (!href.value.trim()) return undefined;
  if (href.bound && !isSafeRichTextHref(href.value)) return undefined;
  return prefixPublicHref(href.value, publicPathPrefix);
}

function renderImageSrc(src: { value: string; bound: boolean }): string | undefined {
  if (!src.value.trim()) return undefined;
  if (src.bound && !isSafeBuilderBoundImageSrc(src.value)) return undefined;
  return src.value;
}

function buttonStateAttrs(node: Extract<BuilderNode, { kind: "button" }>) {
  return {
    "data-builder-button-tone": node.props.tone ?? "primary",
    "data-builder-button-hover-tone": node.props.stateStyles?.hover?.tone,
    "data-builder-button-focus-tone": node.props.stateStyles?.focus?.tone,
    "data-builder-button-active-tone": node.props.stateStyles?.active?.tone,
    "data-builder-button-disabled-tone": node.props.stateStyles?.disabled?.tone,
  };
}

function isSafeBuilderImageSrc(value: string | null | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  // `data:image/*` URIs are safe in an <img src>: the <img> element never
  // executes embedded SVG scripts, and only image MIME types match here
  // (`data:text/html`, `data:application/*`, etc. are NOT accepted). Without
  // this, inline-SVG / data-URI images render as nothing — a regression
  // introduced when the image case gained src validation in P3.
  if (/^data:image\/[a-z0-9.+-]+[,;]/i.test(trimmed)) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ── P4-IMAGEOPT: responsive image pipeline for the freeform renderer ──────────
// render.tsx emits static HTML, so we can't drop a next/image React component in.
// Instead we keep the raw <img src> (validated above, and the universal fallback
// for old browsers / data URIs) and ADD a srcset that routes through the Next
// image optimizer (/_next/image) — which serves AVIF/WebP (next.config formats)
// and downscaled widths. Only same-origin paths + hosts present in next.config
// images.remotePatterns are optimized; anything else stays a plain <img> so the
// optimizer never 400s (which would spam the console). Disable with
// BUILDER_IMAGE_OPT=off.
const BUILDER_IMAGE_OPT_ENABLED = process.env.BUILDER_IMAGE_OPT !== "off";
const BUILDER_IMAGE_WIDTHS = [640, 828, 1200, 1920] as const;
const OPTIMIZABLE_IMAGE_HOSTS: ReadonlySet<string> = new Set(
  [
    (() => {
      try {
        return process.env.NEXT_PUBLIC_SUPABASE_URL
          ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
          : null;
      } catch {
        return null;
      }
    })(),
    "images.unsplash.com",
    "i.pravatar.cc",
  ].filter((host): host is string => Boolean(host)),
);

function builderImageSrcSet(
  src: string,
  sizesOverride?: string,
): { srcSet: string; sizes: string } | null {
  if (!BUILDER_IMAGE_OPT_ENABLED || !src || src.startsWith("data:")) return null;
  let optimizable = false;
  if (src.startsWith("/") && !src.startsWith("//")) {
    optimizable = true; // same-origin / /public asset
  } else {
    try {
      const url = new URL(src);
      optimizable =
        (url.protocol === "https:" || url.protocol === "http:") &&
        OPTIMIZABLE_IMAGE_HOSTS.has(url.hostname);
    } catch {
      return null;
    }
  }
  if (!optimizable) return null;
  const srcSet = BUILDER_IMAGE_WIDTHS.map(
    (w) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75 ${w}w`,
  ).join(", ");
  // Builder images are width:100% of a variable container; full-width on phones,
  // ~half on desktop is a safe default that never under-loads. Callers that know
  // the image is full-bleed (e.g. a `priority` hero slide) pass `100vw` so the
  // optimizer serves a large variant instead of the half-width one (which made
  // full-screen hero slides render soft).
  return { srcSet, sizes: sizesOverride ?? "(max-width: 768px) 100vw, 50vw" };
}

// ── Hero LCP: pull the bare URL out of a CSS `background-image` value so the
// FIRST hero slide can paint it as a real eager <img> (preloadable,
// fetchpriority="high", alt-bearing) instead of a late CSS background. Returns
// null for gradients, layered backgrounds (multiple commas), or anything that
// isn't a single clean `url(...)` — those keep the existing CSS-background path.
function singleBackgroundImageUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Bail on gradients or multi-layer backgrounds — we only lift a lone image.
  if (/gradient\(/i.test(trimmed)) return null;
  const match = /^url\(\s*(['"]?)([^'")]+)\1\s*\)$/i.exec(trimmed);
  if (!match) return null;
  const url = match[2].trim();
  return url.length > 0 ? url : null;
}

// ── Hero LCP: derive a meaningful alt for the eager slide-0 image from the
// slide's own freeform copy (first eyebrow/heading/paragraph text it can find),
// falling back to a brand-safe default. Walks a shallow subtree; cheap and
// purely additive (only ever runs for hero slide 0).
function deriveHeroSlideAlt(node: BuilderNode, fallback: string): string {
  let found = "";
  const visit = (n: BuilderNode, depth: number) => {
    if (found || depth > 4) return;
    const text = (n.props as { text?: unknown } | undefined)?.text;
    if (typeof text === "string" && text.trim().length > 0) {
      // Strip any inline rich-text markup to a plain string.
      found = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return;
    }
    for (const child of nodeChildren(n)) {
      visit(child, depth + 1);
      if (found) return;
    }
  };
  visit(node, 0);
  if (!found) return fallback;
  return found.length > 140 ? `${found.slice(0, 137).trimEnd()}…` : found;
}

/**
 * Wave 3 · 3B — resolve a node's LINKED STYLE CLASS before rendering. When the
 * node's `style.classRef` names a class in the registry, return a shallow copy
 * whose `props.style` is the class style merged BENEATH the node's own props
 * (classRef stripped). No classRef / unknown class / no registry → the node is
 * returned by IDENTITY, so existing trees + the flagship stay byte-identical.
 * Applied at the single per-node entry so every downstream `node.props.style`
 * read (~80 emit sites) transparently sees the merged style.
 */
function applyStyleClass(
  node: BuilderNode,
  classes: BuilderStyleClassRegistry,
): BuilderNode {
  if (!("props" in node)) return node;
  const style = (node.props as { style?: BuilderNodeStyle }).style;
  if (!style?.classRef) return node;
  const resolved = resolveNodeStyleWithClass(style, classes);
  if (resolved === style) return node;
  return {
    ...node,
    props: { ...(node.props as Record<string, unknown>), style: resolved },
  } as BuilderNode;
}

/**
 * Per-node custom-CSS escape hatch. When `node.props.style.customCss` is set,
 * wrap the rendered element in a keyed Fragment that ALSO emits a scope-confined
 * `<style>` keyed to the node's `[data-builder-node-id]`. The scoper
 * (`nodeScopedCss` → `scopeCustomCss`) is the SAME hardened one sections use, so
 * a stray `}` can't break out to page-global rules.
 *
 * ADDITIVE / byte-stable: when there is no `customCss` (the universal case) the
 * element is returned BY IDENTITY — no Fragment, no extra `<style>` — so existing
 * render output is unchanged. The emitted `<style>` carries `data-builder-node-id`
 * so it's traceable, and the Fragment's children are keyed so the node's own
 * `key={node.id}` reconciliation is preserved.
 */
function withNodeCustomCss(node: BuilderNode, element: ReactNode): ReactNode {
  if (!("props" in node)) return element;
  const customCss = (node.props as { style?: BuilderNodeStyle }).style?.customCss;
  const scoped = customCss ? nodeScopedCss(node.id, customCss) : null;
  if (!scoped) return element;
  return (
    <Fragment key={node.id}>
      {element}
      <style
        key={`${node.id}::custom-css`}
        data-builder-node-custom-css={node.id}
        dangerouslySetInnerHTML={{ __html: scoped }}
      />
    </Fragment>
  );
}

/**
 * ABTEST-1 — return a SHALLOW clone of the node with the served variant's
 * `propOverrides` merged over its `props`. Only top-level scalar props are
 * touched; unknown keys are harmless (the node's renderer ignores them). The
 * input node is never mutated, so the stored tree is untouched.
 */
function applyExperimentOverrides(
  node: BuilderNode,
  resolved: ResolvedNodeExperiment,
): BuilderNode {
  const keys = Object.keys(resolved.propOverrides);
  if (keys.length === 0 || !("props" in node)) return node;
  const nextProps = { ...(node.props as Record<string, unknown>) };
  for (const key of keys) {
    nextProps[key] = resolved.propOverrides[key];
  }
  return { ...node, props: nextProps } as BuilderNode;
}

/**
 * ABTEST-1 — clone the node's rendered element to add `data-experiment`,
 * `data-variant`, and `data-experiment-trigger` (click | submit) so the inline
 * experiment runtime can fire the impression once and the conversion on the
 * right DOM event. The attrs land on the node's OWN element (it already carries
 * `data-builder-node-id`), so the runtime binds at the right boundary. Falls
 * back to the element unchanged if it isn't a clonable element (defensive).
 */
function withExperimentAttrs(
  node: BuilderNode,
  element: ReactNode,
  resolved: ResolvedNodeExperiment,
): ReactNode {
  const trigger = experimentConversionTrigger(node.kind);
  if (!trigger || !isValidElement(element)) return element;
  return cloneElement(element as ReactElement, {
    "data-experiment": resolved.experimentId,
    "data-variant": resolved.variantKey,
    "data-experiment-trigger": trigger,
    "data-experiment-kind": node.kind,
  } as Record<string, string>);
}

function renderBuilderNode(
  rawNode: BuilderNode,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  // Cascade order: global token (via var() fallback) ‹ component default ‹
  // style class ‹ node inline. applyStyleClass resolves the class layer under
  // the node's own props; applyComponentStyleDefaults then folds the
  // per-kind default UNDER that result (node-and-class win; an `@inherit`
  // sentinel on a node field lets the default show). Both are identity-returns
  // when there's nothing to merge → byte-stable for trees with no defaults.
  const classed = applyStyleClass(rawNode, options.styleClasses);
  const styled = applyComponentStyleDefaults(classed, options.componentStyleDefaults);
  // ABTEST-1 — single choke point: resolve the served variant for an eligible
  // CTA / form node, merge its prop overrides, then tag the rendered element
  // with data-experiment/-variant so the runtime can fire view + convert. A
  // null resolution (no experiment / no seed / ineligible kind) is a pure
  // pass-through → byte-identical for every node without a live experiment.
  // Only resolve an experiment on a public render (a seed present). Without a
  // seed — the editor canvas, tests, lighter contexts — no experiment is applied
  // or tagged, so output is byte-identical to a node with no experiment.
  const resolved = options.experimentSeed
    ? resolveNodeExperiment(styled, options.experimentSeed)
    : null;
  const node = resolved ? applyExperimentOverrides(styled, resolved) : styled;
  // Tag the node's OWN element with the experiment data-attrs BEFORE the
  // custom-CSS Fragment wrapper, so they land on the element carrying
  // data-builder-node-id (a Fragment can't hold data-* the runtime queries).
  const element = renderBuilderNodeElement(node, options);
  const tagged = resolved ? withExperimentAttrs(node, element, resolved) : element;
  return withNodeCustomCss(node, tagged);
}

function renderBuilderNodeElement(
  node: BuilderNode,
  options: NormalizedBuilderNodeRenderOptions,
): ReactNode {
  switch (node.kind) {
    case "section":
      return null;
    case "section_embed":
      // Tulala component — delegate to the injected renderer (supplied by the
      // server caller, which owns the section registry + tenant context). When
      // no renderer is injected (lighter contexts), render nothing rather than
      // pulling the section registry into this module's bundle.
      return options.renderSectionEmbed
        ? options.renderSectionEmbed(node)
        : null;
    case "container": {
      // REND-1: use the author-chosen semantic landmark tag (default: div).
      // All CSS classes, data-* attrs, and inline styles are preserved
      // regardless of tag — it is a pure drop-in replacement. Trees that
      // omit htmlTag render as <div> (byte-stable for existing trees).
      const ContainerTag = (node.props.htmlTag ?? "div") as "div";
      // Moving background. The attribute is the CSS hook (position/isolation/
      // overflow + lifting the author's children above the layer) and is emitted
      // ONLY when the value actually resolves to something renderable, so a
      // container without one — or with a URL that failed to parse — keeps
      // byte-identical markup.
      const bgMedia = renderBackgroundMediaLayer(node.props.backgroundMedia, node.id);
      return (
        <ContainerTag
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          data-bn-bg-media={
            hasRenderableBackgroundMedia(node.props.backgroundMedia) ? "" : undefined
          }
          data-builder-layout={node.props.layout}
          data-builder-tablet-layout={node.props.responsive?.tablet?.layout}
          data-builder-mobile-layout={node.props.responsive?.mobile?.layout}
          data-builder-display={node.props.display}
          data-builder-tablet-display={node.props.responsive?.tablet?.display}
          data-builder-mobile-display={node.props.responsive?.mobile?.display}
          {...customTierLayoutAttrs(node.props.responsive)}
          data-builder-data-source={node.props.dataBinding?.sourceKey}
          data-builder-data-mode={node.props.dataBinding?.mode}
          data-builder-data-max-items={node.props.dataBinding?.maxItems}
          className="site-builder-node site-builder-node--container"
          style={containerStyle(node)}
        >
          {bgMedia}
          {renderDataBoundContainerChildren(node, options)}
        </ContainerTag>
      );
    }
    case "split":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          data-builder-collapse-mobile={node.props.collapseOnMobile === false ? "false" : "true"}
          className="site-builder-node site-builder-node--split"
          style={splitStyle(node)}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "accordion":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--accordion"
          style={inlineNodeStyle(node.props.style, CONTAINER_STYLE, {
            display: "grid",
            gap: GAP_BY_SIZE.m,
          })}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "accordion_item": {
      const titleResolved = resolveNodeLocalizedText(
        node,
        "title",
        node.props.title,
        options.contentLocale,
      );
      const titleCue = localeFallbackCue(
        titleResolved.isFallback,
        options.contentLocale,
      );
      return (
        <details
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          {...titleCue.attrs}
          className="site-builder-node site-builder-node--accordion-item"
          open
          style={inlineNodeStyle(node.props.style, {
            border: "1px solid rgba(18, 18, 18, 0.14)",
            borderRadius: "0",
            padding: "1rem",
          })}
        >
          <summary style={{ cursor: "pointer", fontWeight: 700, ...titleCue.style }}>
            {titleResolved.value}
          </summary>
          <div style={{ display: "grid", gap: GAP_BY_SIZE.s, paddingTop: "0.75rem" }}>
            {renderChildren(node, options)}
          </div>
        </details>
      );
    }
    case "tabs": {
      const panels = nodeChildren(node).filter((child) => child.kind === "tab_panel");
      const activePanel =
        panels.find((panel) => panel.id === node.props.defaultTabId) ?? panels[0] ?? null;
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--tabs"
          style={inlineNodeStyle(node.props.style, CONTAINER_STYLE, {
            display: "grid",
            gap: GAP_BY_SIZE.m,
          })}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {panels.map((panel) => {
              const panelTitle = resolveNodeLocalizedText(
                panel,
                "title",
                panel.props.title,
                options.contentLocale,
              );
              const panelCue = localeFallbackCue(
                panelTitle.isFallback,
                options.contentLocale,
              );
              return (
                <span
                  key={`${panel.id}:tab`}
                  data-builder-node-id={panel.id}
                  data-builder-node-kind={panel.kind}
                  {...panelCue.attrs}
                  style={{
                    border: "1px solid rgba(18, 18, 18, 0.14)",
                    borderRadius: "0",
                    padding: "0.45rem 0.75rem",
                    fontSize: "0.875rem",
                    fontWeight: panel.id === activePanel?.id ? 700 : 500,
                    ...panelCue.style,
                  }}
                >
                  {panelTitle.value}
                </span>
              );
            })}
          </div>
          {activePanel ? (
            <BuilderNodeView
              key={activePanel.id}
              node={activePanel}
              options={options}
            />
          ) : null}
        </div>
      );
    }
    case "tab_panel":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--tab-panel"
          style={inlineNodeStyle(node.props.style, { display: "grid", gap: GAP_BY_SIZE.s })}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "carousel": {
      if ((node.props.variant ?? "rail") === "hero") {
        const overlay = node.props.overlay ?? {};
        const scrimOn = overlay.scrim !== false;
        const grainOn = node.props.grain !== false;
        const kenBurns = node.props.kenBurns ?? true;
        const heightMode = node.props.heightMode ?? "viewport";
        const transition = node.props.transition ?? "crossfade";
        const align = node.props.contentAlign ?? "bl";
        const mode = node.props.contentMode ?? "per-slide";
        const ctl = node.props.controls ?? {};
        const sc = node.props.sharedContent;
        // Per-slide scrim attrs (over bg, under freeform content). Mirrors the
        // carousel-level scrim defaults so shared + per-slide look consistent.
        const scrimTone = overlay.scrim === false ? "none" : overlay.tone ?? "dark";
        const scrimVignette = overlay.vignette !== false ? "true" : undefined;
        const heroSlides = nodeChildren(node)
          .filter((child) => shouldRenderNode(child, options))
          .map((child, index) => {
            const isActive = index === 0;
            const activeAttr = isActive ? "" : undefined;
            // SSR a11y: hide every non-first slide from AT + the tab order at
            // first paint, exactly matching what the client crossfade effect
            // converges to (active = slide 0). Without this, the pre-hydration
            // markup exposes all slides — and their focusable CTAs — to screen
            // readers / Tab. `inert` (boolean → bare attr in React 19) also drops
            // focusable descendants out of the a11y tree, so aria-hidden never
            // wraps a focusable node (WCAG 4.1.2). The client effect mirrors this
            // (setAttribute("inert","") / aria-hidden="true"), so there is no
            // hydration mismatch.
            const inactiveAttrs = isActive
              ? {}
              : { "aria-hidden": true as const, inert: true as const };
            // Image-only slide → the eager <img> IS the Ken-Burns background layer.
            if (child.kind === "image") {
              const img = {
                ...child,
                props: {
                  ...child.props,
                  priority: true,
                  style: {
                    ...(child.props.style ?? {}),
                    // Spec §1: focus the full-bleed crop at center 28% so heads /
                    // faces stay in frame instead of the centred default.
                    objectPosition:
                      child.props.style?.objectPosition ?? "center 28%",
                  },
                },
              };
              return (
                <div
                  key={`${node.id}:slide:${child.id}`}
                  className="site-bn-hero__slide"
                  data-active={activeAttr}
                  {...inactiveAttrs}
                >
                  <div className="site-bn-hero__slide-bg">
                    {renderBuilderNode(img, options)}
                  </div>
                  {mode === "per-slide" ? (
                    <div
                      className="site-bn-hero__slide-scrim"
                      data-tone={scrimTone}
                      data-vignette={scrimVignette}
                    />
                  ) : null}
                </div>
              );
            }
            // Freeform slide (container / split / card / …): lift its background to
            // the Ken-Burns layer, then render the node with the background stripped
            // as a STATIC content layer — so the zoom never scales the copy.
            const childStyle: BuilderNodeStyleValue =
              (child.props as { style?: BuilderNodeStyleValue }).style ?? {};
            const bgStyle: CSSProperties = {};
            if (childStyle.backgroundImage) {
              bgStyle.backgroundImage = childStyle.backgroundImage;
              bgStyle.backgroundSize = childStyle.backgroundSize ?? "cover";
              bgStyle.backgroundPosition =
                childStyle.backgroundPosition ?? "center 28%";
              bgStyle.backgroundRepeat = childStyle.backgroundRepeat ?? "no-repeat";
            }
            if (childStyle.backgroundColor) {
              bgStyle.backgroundColor = childStyle.backgroundColor;
            }
            // Spread over the BuilderNode union loses the discriminated-union
            // narrowing, so assert back to BuilderNode (structure is unchanged
            // apart from the stripped background, which renderBuilderNode handles).
            const contentChild = {
              ...child,
              props: {
                ...child.props,
                style: {
                  ...childStyle,
                  backgroundImage: undefined,
                  backgroundColor: undefined,
                  backgroundSize: undefined,
                  backgroundPosition: undefined,
                  backgroundRepeat: undefined,
                },
              },
            } as BuilderNode;
            // Hero LCP: for the FIRST slide only, if its background is a single
            // url(...) image, paint it as a real eager + fetchpriority="high"
            // <img> (preloadable, alt-bearing for SEO/AT) instead of a late CSS
            // background. Slides 2-N keep the CSS-background path untouched.
            const eagerBgUrl =
              index === 0
                ? singleBackgroundImageUrl(childStyle.backgroundImage)
                : null;
            const eagerBgImg = eagerBgUrl ? (
              (() => {
                const responsive = builderImageSrcSet(eagerBgUrl, "100vw");
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={eagerBgUrl}
                    alt={deriveHeroSlideAlt(child, "Impronta talent")}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    {...(responsive
                      ? { srcSet: responsive.srcSet, sizes: responsive.sizes }
                      : {})}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition:
                        (childStyle.backgroundPosition as
                          | string
                          | undefined) ?? "center 28%",
                    }}
                  />
                );
              })()
            ) : null;
            return (
              <div
                key={`${node.id}:slide:${child.id}`}
                className="site-bn-hero__slide"
                data-active={activeAttr}
                {...inactiveAttrs}
              >
                <div
                  className="site-bn-hero__slide-bg"
                  style={
                    eagerBgImg
                      ? // The <img> carries the photo; keep only a non-image
                        // backdrop (e.g. backgroundColor) on the layer.
                        childStyle.backgroundColor
                        ? { backgroundColor: childStyle.backgroundColor }
                        : undefined
                      : Object.keys(bgStyle).length > 0
                        ? bgStyle
                        : undefined
                  }
                >
                  {eagerBgImg}
                </div>
                <div
                  className="site-bn-hero__slide-scrim"
                  data-tone={scrimTone}
                  data-vignette={scrimVignette}
                />
                <div className="site-bn-hero__slide-content">
                  {renderBuilderNode(contentChild, options)}
                </div>
              </div>
            );
          });
        const sharedBlock =
          mode === "shared" && sc ? (
            <div className="site-bn-hero__inner" data-align={align}>
              {sc.eyebrow ? (
                <span className="site-bn-hero__eyebrow">{sc.eyebrow}</span>
              ) : null}
              {sc.headingLead || sc.headingAccent ? (
                <h1 className="site-bn-hero__heading">
                  {sc.headingLead}
                  {sc.headingAccent ? (
                    <>
                      {sc.headingLead ? " " : ""}
                      <em className="site-bn-hero__accent">{sc.headingAccent}</em>
                    </>
                  ) : null}
                </h1>
              ) : null}
              {sc.sub ? <p className="site-bn-hero__sub">{sc.sub}</p> : null}
              {sc.primaryCta?.label || sc.secondaryCta?.label ? (
                <div className="site-bn-hero__cta">
                  {sc.primaryCta?.label ? (
                    <a
                      className="site-bn-hero__btn site-bn-hero__btn--primary"
                      href={sc.primaryCta.href || "#"}
                    >
                      {sc.primaryCta.label}
                    </a>
                  ) : null}
                  {sc.secondaryCta?.label ? (
                    <a
                      className="site-bn-hero__btn site-bn-hero__btn--secondary"
                      href={sc.secondaryCta.href || "#"}
                    >
                      {sc.secondaryCta.label}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null;
        return (
          <div
            key={node.id}
            data-builder-node-id={node.id}
            data-builder-node-kind={node.kind}
            data-builder-carousel-variant="hero"
            data-bn-height-mode={heightMode}
            data-bn-transition={transition}
            data-bn-kenburns={kenBurns ? "true" : "false"}
            data-bn-content-mode={mode}
            data-bn-content-align={align}
            {...builderNodeStyleAttrs(node.props.style)}
            className="site-builder-node site-builder-node--carousel"
            style={inlineNodeStyle(
              node.props.style,
              builderNodeStyleVars({
                "--bn-hero-min-h":
                  heightMode === "fixed" && node.props.minHeightPx
                    ? `${node.props.minHeightPx}px`
                    : undefined,
                "--bn-transition-ms": node.props.transitionMs
                  ? `${node.props.transitionMs}ms`
                  : undefined,
                "--bn-kenburns-amount": node.props.kenBurnsAmount,
              }),
            )}
          >
            <BuilderNodeCarouselTrack
              nodeId={node.id}
              variant="hero"
              slideCount={heroSlides.length}
              autoplayMs={node.props.autoplayMs}
              loop={node.props.loop}
              pauseOnHover={node.props.pauseOnHover}
              controls={{
                dots: ctl.dots ?? true,
                arrows: ctl.arrows ?? false,
                progress: ctl.progress ?? false,
                counter: ctl.counter ?? true,
                scrollCue: ctl.scrollCue ?? true,
              }}
            >
              {heroSlides}
            </BuilderNodeCarouselTrack>
            {scrimOn ? (
              <div
                className="site-bn-hero__scrim"
                data-vignette={overlay.vignette !== false ? "true" : undefined}
                data-tone={overlay.tone ?? "dark"}
                style={
                  typeof overlay.opacity === "number"
                    ? { opacity: overlay.opacity }
                    : undefined
                }
                aria-hidden
              />
            ) : null}
            {grainOn ? (
              // Film-grain noise as a real inline <svg> (feTurbulence) rather than
              // a data:image/svg+xml background URI — identical texture, and it
              // keeps the always-shipped renderer stylesheet free of a literal
              // `data:image` token (which would otherwise be indistinguishable
              // from a leaked image src to substring-based checks).
              <div className="site-bn-hero__grain" aria-hidden>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={160}
                  height={160}
                  preserveAspectRatio="none"
                >
                  <filter id={`${node.id}-grain`}>
                    <feTurbulence
                      type="fractalNoise"
                      baseFrequency={0.85}
                      numOctaves={2}
                      stitchTiles="stitch"
                    />
                  </filter>
                  <rect
                    width="100%"
                    height="100%"
                    filter={`url(#${node.id}-grain)`}
                    opacity={0.5}
                  />
                </svg>
              </div>
            ) : null}
            {sharedBlock}
          </div>
        );
      }
      const carouselVars = carouselSlideVars(node.props);
      const carouselItems = nodeChildren(node)
        .filter((child) => shouldRenderNode(child, options))
        .map((child, index) => (
          <div
            key={`${node.id}:slide:${child.id}`}
            id={`${node.id}-slide-${index + 1}`}
            className="site-builder-node--carousel-slide"
          >
            <BuilderNodeView key={child.id} node={child} options={options} />
          </div>
        ));
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          data-builder-carousel-loop={node.props.loop ? "true" : undefined}
          data-builder-carousel-autoplay-ms={node.props.autoplayMs}
          className="site-builder-node site-builder-node--carousel"
          style={inlineNodeStyle(node.props.style, builderNodeStyleVars({
              // Per-device slide counts. `carouselSlideVars` returns the exact
              // two values this used to compute inline when no `responsive`
              // bucket is set, and `undefined` for the mobile var (which
              // `builderNodeStyleVars` drops) — so a stored carousel emits a
              // character-identical style attribute.
              "--bn-slide-width": carouselVars.slideWidth,
              "--bn-tablet-slides": carouselVars.tabletSlides,
              "--bn-mobile-slide-width": carouselVars.mobileSlideWidth,
            }))}
        >
          <BuilderNodeCarouselTrack
            nodeId={node.id}
            showArrows={node.props.showArrows}
            showDots={node.props.showDots}
          >
            {carouselItems}
          </BuilderNodeCarouselTrack>
        </div>
      );
    }
    case "masonry":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--masonry"
          style={inlineNodeStyle(node.props.style, builderNodeStyleVars({
              "--bn-columns": node.props.columns ?? 3,
              "--bn-gap": GAP_BY_SIZE[node.props.gap ?? "m"],
            }))}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "card":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-card-variant={node.props.variant ?? "elevated"}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--card"
          style={cardStyle(node)}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "cta_group":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-cta-layout={node.props.layout ?? "row"}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--cta-group"
          style={ctaGroupStyle(node)}
        >
          {renderChildren(node, options)}
        </div>
      );
    case "heading": {
      const Tag = `h${node.props.level}` as "h1" | "h2" | "h3" | "h4";
      const resolved = resolveNodeStringProp(
        node,
        "text",
        node.props.text,
        options.repeatItem,
        options.contentLocale,
      );
      const cue = localeFallbackCue(resolved.isFallback, options.contentLocale);
      return (
        <Tag
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          {...cue.attrs}
          className="site-builder-node site-builder-node--heading"
          suppressHydrationWarning
          style={inlineNodeStyle(node.props.style, MARGIN_ZERO, { lineHeight: 1.05, ...cue.style })}
        >
          {renderInlineRich(resolved.value)}
        </Tag>
      );
    }
    case "paragraph": {
      const resolved = resolveNodeStringProp(
        node,
        "text",
        node.props.text,
        options.repeatItem,
        options.contentLocale,
      );
      const cue = localeFallbackCue(resolved.isFallback, options.contentLocale);
      return (
        <p
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          {...cue.attrs}
          className="site-builder-node site-builder-node--paragraph"
          suppressHydrationWarning
          style={inlineNodeStyle(node.props.style, MARGIN_ZERO, {
            lineHeight: 1.65,
            // AIQ-4 — theme-adaptive soft body color. On the light theme (ink
            // #121212) this is byte-equivalent to the old rgba(18,18,18,0.72);
            // on dark themes it becomes soft LIGHT ink instead of near-black-on-
            // dark (default paragraphs were rendering invisible on noir).
            color: "color-mix(in oklab, var(--token-color-ink, #121212) 72%, transparent)",
            ...cue.style,
          })}
        >
          {renderInlineRich(resolved.value)}
        </p>
      );
    }
    case "button": {
      const resolvedLabel = resolveNodeStringProp(
        node,
        "label",
        node.props.label,
        options.repeatItem,
        options.contentLocale,
      );
      const href = renderButtonHref(
        resolveNodeStringProp(node, "href", node.props.href, options.repeatItem),
        options.publicPathPrefix,
      );
      const cue = localeFallbackCue(resolvedLabel.isFallback, options.contentLocale);
      return (
        <a
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...buttonStateAttrs(node)}
          {...builderNodeStyleAttrs(node.props.style)}
          {...cue.attrs}
          className={`site-builder-node site-builder-node--button site-builder-node--button-${node.props.tone ?? "primary"}`}
          href={href}
          style={inlineNodeStyle(node.props.style, cue.style)}
        >
          {resolvedLabel.value}
        </a>
      );
    }
    case "image": {
      // Compose media-library resolution (Lane B) with field-binding (Lane A):
      // mediaId → publicUrl is the base src/alt; a {{field}} binding overrides it
      // per repeat item when present. Final src is validated either way.
      const mediaAsset =
        node.props.mediaId && options.dataSources.mediaAssets
          ? options.dataSources.mediaAssets.find(
              (asset) => asset.id === node.props.mediaId,
            )
          : null;
      const baseSrc = mediaAsset?.publicUrl ?? node.props.src ?? "";
      const baseAlt = node.props.alt?.trim()
        ? node.props.alt
        : (mediaAsset?.alt ?? "");
      const src = renderImageSrc(
        resolveNodeStringProp(node, "src", baseSrc, options.repeatItem),
      );
      // `alt` is localizable but not on-page TEXT, so it resolves through the
      // overlay (for the correct-language alt) WITHOUT the 40%-opacity cue.
      const alt = resolveNodeStringProp(
        node,
        "alt",
        baseAlt,
        options.repeatItem,
        options.contentLocale,
      ).value;
      if (!src || !isSafeBuilderImageSrc(src)) return null;
      // `priority` images are the LCP / full-bleed hero slides → request a
      // full-viewport-width variant so they are not served the half-width default.
      const imageOpt = builderImageSrcSet(
        src,
        node.props.priority ? "100vw" : undefined,
      );
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-media-id={node.props.mediaId}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--image"
          src={src}
          {...(imageOpt
            ? { srcSet: imageOpt.srcSet, sizes: imageOpt.sizes }
            : {})}
          alt={alt}
          // `priority` images (e.g. the LCP hero) load eagerly with a high fetch
          // priority so they are not deferred by the lazy loader; all others stay
          // lazy. React maps `fetchPriority` → the `fetchpriority` HTML attribute.
          loading={node.props.priority ? "eager" : "lazy"}
          {...(node.props.priority ? { fetchPriority: "high" as const } : {})}
          decoding="async"
          style={inlineNodeStyle(node.props.style, {
            display: "block",
            width: "100%",
            maxWidth: "100%",
            objectFit: node.props.style?.objectFit ?? "cover",
            objectPosition: node.props.style?.objectPosition ?? "center",
            aspectRatio:
              node.props.style?.aspectRatioFree ??
              NODE_ASPECT_RATIO[node.props.style?.aspectRatio ?? "auto"],
          })}
        />
      );
    }
    case "video":
      return (
        <video
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--video"
          src={node.props.src}
          poster={node.props.poster}
          autoPlay={node.props.autoplay ?? false}
          muted={node.props.muted ?? node.props.autoplay ?? false}
          loop={node.props.loop ?? false}
          controls={node.props.controls ?? true}
          playsInline
          preload="metadata"
          style={inlineNodeStyle(node.props.style, {
            objectFit: node.props.style?.objectFit ?? "cover",
            objectPosition: node.props.style?.objectPosition ?? "center",
            aspectRatio:
              node.props.style?.aspectRatioFree ??
              NODE_ASPECT_RATIO[node.props.style?.aspectRatio ?? "auto"],
          })}
        />
      );
    case "embed": {
      // `title` is the iframe accessible name (not on-page text) → localized,
      // no opacity cue.
      const embedTitle = resolveNodeLocalizedText(
        node,
        "title",
        node.props.title ?? "",
        options.contentLocale,
      ).value;
      return (
        <iframe
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-embed-provider={node.props.provider ?? "url"}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--embed"
          src={node.props.src}
          title={embedTitle || "Embedded content"}
          loading="lazy"
          sandbox="allow-forms allow-popups allow-presentation allow-scripts"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen={node.props.allowFullScreen ?? true}
          style={inlineNodeStyle(node.props.style, {
            aspectRatio:
              node.props.style?.aspectRatioFree ??
              NODE_ASPECT_RATIO[node.props.style?.aspectRatio ?? "16:9"],
          })}
        />
      );
    }
    case "social_feed": {
      // Connected source reads the cache the cron fills; falls back to authored
      // items when the account is not connected yet or the cache is empty, so
      // switching the toggle can never blank a live page.
      const connected =
        node.props.source === "connected"
          ? (options.dataSources?.socialFeeds?.[node.props.provider ?? "instagram"] ??
             [])
          : [];
      const feedItems =
        connected.length > 0
          ? connected.map((item) => ({ ...item }))
          : (node.props.items ?? []);
      if (feedItems.length === 0) {
        // Same rule as social_post: an empty block must be visible while
        // authoring and publish nothing.
        if (!options.contentLocale?.editorPreview) return null;
        return (
          <div
            key={node.id}
            data-builder-node-id={node.id}
            data-builder-node-kind={node.kind}
            {...builderNodeStyleAttrs(node.props.style)}
            className="site-builder-node site-builder-node--social-feed"
            style={inlineNodeStyle(node.props.style, {
              display: "grid",
              placeItems: "center",
              minHeight: 240,
              padding: 24,
              border: "1px dashed rgba(24,24,27,0.28)",
              borderRadius: 12,
              textAlign: "center",
              color: "rgba(24,24,27,0.60)",
              fontSize: 13,
              lineHeight: 1.5,
            })}
          >
            <span>
              {node.props.source === "connected"
                ? "Connect Instagram or TikTok in Settings, Integrations, and your latest posts appear here."
                : "Add posts in the Content panel: pick images or videos, then link each one to its Instagram or TikTok post."}
            </span>
          </div>
        );
      }
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--social-feed"
          style={inlineNodeStyle(node.props.style)}
        >
          <SocialFeedWidget
            nodeId={node.id}
            layout={node.props.layout ?? "grid"}
            provider={node.props.provider ?? "instagram"}
            handle={node.props.handle}
            columns={node.props.columns ?? 3}
            initialCount={node.props.initialCount ?? 6}
            gap={node.props.gap ?? "sm"}
            aspect={node.props.aspect ?? "square"}
            hover={node.props.hover ?? "zoom-caption"}
            lightbox={node.props.lightbox ?? true}
            loadMore={node.props.loadMore ?? "button"}
            autoplayVideos={node.props.autoplayVideos ?? true}
            items={feedItems}
          />
        </div>
      );
    }
    case "social_post": {
      // Renders the provider's OWN blockquote, which their embed.js upgrades to
      // a full post in-place. No oEmbed API call, no token — see
      // lib/social-embed/social-post-url.ts for why that matters.
      //
      // The url is re-parsed at RENDER time rather than trusted from props: the
      // schema validates on write, but published trees can predate a rule change
      // or arrive from an import, and this string goes into public markup.
      const parsed = parseSocialPostUrl(node.props.url);
      if (!parsed) {
        // A freshly inserted block has no URL yet. Rendering null would make it
        // INVISIBLE on the canvas — inserted, unselectable, apparently a no-op.
        // Show a placeholder while authoring; publish nothing.
        if (!options.contentLocale?.editorPreview) return null;
        const providerLabel =
          node.props.provider === "tiktok" ? "TikTok" : "Instagram";
        return (
          <div
            key={node.id}
            data-builder-node-id={node.id}
            data-builder-node-kind={node.kind}
            data-social-post-empty=""
            {...builderNodeStyleAttrs(node.props.style)}
            className="site-builder-node site-builder-node--social-post"
            style={inlineNodeStyle(node.props.style, {
              display: "grid",
              placeItems: "center",
              minHeight: 220,
              padding: 24,
              border: "1px dashed rgba(24,24,27,0.28)",
              borderRadius: 12,
              textAlign: "center",
              color: "rgba(24,24,27,0.60)",
              fontSize: 13,
              lineHeight: 1.5,
            })}
          >
            <span>
              {`Paste a ${providerLabel} ${
                node.props.provider === "tiktok" ? "video" : "post or reel"
              } URL in the Content panel to show it here.`}
            </span>
          </div>
        );
      }
      const caption = resolveNodeLocalizedText(
        node,
        "caption",
        node.props.caption ?? "",
        options.contentLocale,
      ).value;
      const common = {
        key: node.id,
        "data-builder-node-id": node.id,
        "data-builder-node-kind": node.kind,
        "data-social-post-provider": parsed.provider,
        ...builderNodeStyleAttrs(node.props.style),
      };
      // The <script> is emitted beside the blockquote instead of in <head>:
      // both providers' embed.js scan for un-hydrated blockquotes on load AND
      // expose a re-scan hook, so a per-block tag keeps the block
      // self-contained (it works when inserted into an already-loaded page).
      return (
        <div
          {...common}
          className="site-builder-node site-builder-node--social-post"
          style={inlineNodeStyle(node.props.style)}
        >
          {caption ? (
            <p className="site-builder-node--social-post__caption">{caption}</p>
          ) : null}
          {parsed.provider === "instagram" ? (
            <blockquote
              className="instagram-media"
              data-instgrm-permalink={parsed.canonicalUrl}
              data-instgrm-version="14"
              style={{ maxWidth: "100%", width: "100%", margin: 0 }}
            >
              <a href={parsed.canonicalUrl} rel="noopener noreferrer" target="_blank">
                View this post on Instagram
              </a>
            </blockquote>
          ) : (
            <blockquote
              className="tiktok-embed"
              cite={parsed.canonicalUrl}
              data-video-id={parsed.id}
              style={{ maxWidth: "100%", width: "100%", margin: 0 }}
            >
              <a
                href={parsed.canonicalUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {parsed.handle ? `@${parsed.handle}` : "View on TikTok"}
              </a>
            </blockquote>
          )}
          <script async src={SOCIAL_POST_EMBED_SCRIPTS[parsed.provider]} />
        </div>
      );
    }
    case "icon": {
      const icon = getBuilderIconDefinition(node.props.icon);
      const decorative = node.props.decorative ?? !node.props.label;
      // `label` is the icon's accessible name (not on-page text) → localized,
      // no opacity cue.
      const iconLabel = resolveNodeLocalizedText(
        node,
        "label",
        node.props.label ?? "",
        options.contentLocale,
      ).value;
      return (
        <span
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-icon={icon.name}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--icon"
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : iconLabel || icon.name}
          aria-hidden={decorative ? true : undefined}
          style={inlineNodeStyle(node.props.style, {
            // Inspector Reset P3: an exact typed/dragged size wins over the
            // S/M/L/XL token when present (D9 item 2 — presets are shortcuts).
            fontSize: node.props.sizeFree || ICON_SIZE[node.props.size ?? "md"],
          })}
        >
          <svg
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {icon.paths.map((path) => (
              <path key={path} d={path} />
            ))}
            {icon.circles?.map((circle) => (
              <circle
                key={`${circle.cx}-${circle.cy}-${circle.r}`}
                cx={circle.cx}
                cy={circle.cy}
                r={circle.r}
              />
            ))}
            {icon.polygons?.map((points) => (
              <polygon key={points} points={points} />
            ))}
          </svg>
        </span>
      );
    }
    case "pricing_table":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--pricing-table"
          style={pricingTableStyle(node)}
        >
          {node.props.tiers.map((tier) => (
            <article
              key={tier.id}
              className="site-builder-node--pricing-tier"
              data-builder-pricing-highlighted={tier.highlighted ? "true" : undefined}
            >
              <header className="site-builder-node--pricing-tier-header">
                <h3 className="site-builder-node--pricing-tier-title">
                  {renderInlineRich(tier.name)}
                </h3>
                {tier.description ? (
                  <p className="site-builder-node--pricing-tier-description">
                    {renderInlineRich(tier.description)}
                  </p>
                ) : null}
              </header>
              <div className="site-builder-node--pricing-price">
                <strong>{tier.price}</strong>
                {tier.period ? (
                  <span className="site-builder-node--pricing-period">
                    / {tier.period}
                  </span>
                ) : null}
              </div>
              {(tier.features?.length ?? 0) > 0 ? (
                <ul className="site-builder-node--pricing-features">
                  {(tier.features ?? []).map((feature) => {
                    const included = feature.included !== false;
                    return (
                      <li
                        key={feature.label}
                        className="site-builder-node--pricing-feature"
                        data-builder-feature-included={included ? "true" : "false"}
                      >
                        <span
                          className="site-builder-node--pricing-feature-mark"
                          aria-hidden="true"
                        >
                          {included ? "✓" : "×"}
                        </span>
                        <span>{renderInlineRich(feature.label)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {tier.ctaLabel && tier.ctaHref ? (
                <a
                  className="site-builder-node--pricing-cta"
                  href={prefixPublicHref(tier.ctaHref, options.publicPathPrefix)}
                >
                  {renderInlineRich(tier.ctaLabel)}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      );
    case "rich_text": {
      const resolved = resolveNodeStringProp(
        node,
        "text",
        node.props.text,
        options.repeatItem,
        options.contentLocale,
      );
      const cue = localeFallbackCue(resolved.isFallback, options.contentLocale);
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          {...cue.attrs}
          className="site-builder-node site-builder-node--rich-text"
          style={inlineNodeStyle(node.props.style, MARGIN_ZERO, {
            lineHeight: 1.65,
            // AIQ-4 — theme-adaptive soft body color. On the light theme (ink
            // #121212) this is byte-equivalent to the old rgba(18,18,18,0.72);
            // on dark themes it becomes soft LIGHT ink instead of near-black-on-
            // dark (default paragraphs were rendering invisible on noir).
            color: "color-mix(in oklab, var(--token-color-ink, #121212) 72%, transparent)",
            whiteSpace: "pre-wrap",
            ...cue.style,
          })}
        >
          {renderInlineRich(sanitizeBuilderRichText(resolved.value))}
        </div>
      );
    }
    case "code":
      // SECURITY: author HTML is NEVER inlined into the page DOM. It is mounted
      // inside an opaque-origin sandboxed iframe (sandbox="allow-scripts" only)
      // by BuilderNodeCodeFrame — see that file for the full threat model. No
      // DOM-level sanitizer is used (none is sound on this shared-apex origin).
      return (
        <BuilderNodeCodeFrame
          key={node.id}
          nodeId={node.id}
          html={node.props.html}
          minHeight={node.props.minHeight}
          className="site-builder-node site-builder-node--code"
          dataAttrs={builderNodeStyleAttrs(node.props.style)}
          style={inlineNodeStyle(node.props.style)}
        />
      );
    case "divider":
      return (
        <hr
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          data-builder-divider-tone={node.props.tone ?? "default"}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--divider"
          style={inlineNodeStyle(node.props.style)}
        />
      );
    case "spacer":
      return (
        <div
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(node.props.style)}
          className="site-builder-node site-builder-node--spacer"
          aria-hidden="true"
          style={inlineNodeStyle(node.props.style, {
            // Inspector Reset P3: an exact typed/dragged height wins over the
            // S/M/L token when present (D9 item 2 — presets are shortcuts).
            height: node.props.sizeFree || SPACER_BY_SIZE[node.props.size],
          })}
        />
      );
    case "form": {
      const formProps = node.props;
      const fields = formProps.fields ?? [];
      const honeypotName = formProps.honeypotName?.trim() || "website";
      // Tenant-resolved captcha (see `captcha` in the options doc above).
      const formCaptchaProvider =
        options.captcha && options.captcha.provider !== "none"
          ? options.captcha.provider
          : null;
      const formCaptchaSiteKey = options.captcha?.siteKey ?? null;
      const formCaptchaHl = hcaptchaLocale(options.visitorLocale);
      const formCaptchaLanguage = turnstileLocale(options.visitorLocale);
      const isInternal =
        !formProps.action || formProps.action.trim().toLowerCase() === "internal";
      const method =
        formProps.method === "get" || formProps.method === "post"
          ? formProps.method
          : "post";
      // Internal submissions hit the existing endpoint, which reads FormData and
      // requires `__tulala_section` to be a real cms_sections row id. When that
      // id is missing we still render the form, but point the action at the
      // endpoint so authoring stays unblocked (the endpoint 400s a blank section
      // — the inspector warns the operator to set one).
      const action = isInternal
        ? prefixPublicHref("/api/cms/forms/submit", options.publicPathPrefix)
        : prefixPublicHref(formProps.action!.trim(), options.publicPathPrefix);
      return (
        <form
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(formProps.style)}
          className="site-builder-node site-builder-node--form"
          method={method}
          action={action}
          style={inlineNodeStyle(formProps.style, {
            display: "grid",
            gap: GAP_BY_SIZE.m,
          })}
        >
          {isInternal && method === "post" && formProps.sectionId ? (
            <input type="hidden" name="__tulala_section" value={formProps.sectionId} />
          ) : null}
          {isInternal && method === "post" ? (
            <input type="hidden" name="__tulala_honeypot" value={honeypotName} />
          ) : null}
          {/* Honeypot — visually hidden, off the tab order. A real visitor never
              fills it; a bot that does gets the submission flagged as spam. */}
          <div
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
          >
            <label>
              Leave this field empty
              <input
                type="text"
                name={honeypotName}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>
          {fields.map((field) => {
            const fieldId = `${node.id}-${field.id}`;
            if (field.type === "submit") {
              return (
                <button
                  key={field.id}
                  type="submit"
                  className="site-builder-node site-builder-node--button site-builder-node--button-primary"
                >
                  {/* A top-level `submitLabel` prop (which an A/B experiment's
                      propOverrides can target) wins over the submit field's own
                      label; falls back to it when unset → byte-stable for trees
                      that don't set submitLabel. */}
                  {formProps.submitLabel ?? field.label}
                </button>
              );
            }
            return (
              <div key={field.id} style={{ display: "grid", gap: "0.35rem" }}>
                <label htmlFor={fieldId} style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                  {field.label}
                  {field.required ? <span aria-hidden="true"> *</span> : null}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    id={fieldId}
                    name={field.name}
                    placeholder={field.placeholder}
                    required={field.required ?? false}
                    rows={4}
                  />
                ) : field.type === "select" ? (
                  <select
                    id={fieldId}
                    name={field.name}
                    required={field.required ?? false}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {field.placeholder ?? "Choose…"}
                    </option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.type === "radio" ? (
                  <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                    {(field.options ?? []).map((opt) => (
                      <label
                        key={opt}
                        style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}
                      >
                        <input
                          type="radio"
                          name={field.name}
                          value={opt}
                          required={field.required ?? false}
                        />
                        {opt}
                      </label>
                    ))}
                  </fieldset>
                ) : field.type === "checkbox" ? (
                  <label style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                    <input
                      id={fieldId}
                      type="checkbox"
                      name={field.name}
                      value="yes"
                      required={field.required ?? false}
                    />
                    {field.placeholder ?? field.label}
                  </label>
                ) : (
                  <input
                    id={fieldId}
                    name={field.name}
                    type={field.type}
                    placeholder={field.placeholder}
                    required={field.required ?? false}
                  />
                )}
              </div>
            );
          })}
          {/* Captcha widget. Rendered off the TENANT's resolved provider — the
              same signal /api/cms/forms/submit enforces on — so a configured
              captcha can never demand a token this form does not produce.
              Markup mirrors the contact_form section component exactly. */}
          {formCaptchaProvider === "hcaptcha" && formCaptchaSiteKey ? (
            <>
              <div
                className="h-captcha"
                data-sitekey={formCaptchaSiteKey}
                data-hl={formCaptchaHl}
                data-callback="__tulalaCaptchaDone"
              />
              <script src="https://js.hcaptcha.com/1/api.js" async defer />
            </>
          ) : null}
          {formCaptchaProvider === "turnstile" && formCaptchaSiteKey ? (
            <>
              <div
                className="cf-turnstile"
                data-sitekey={formCaptchaSiteKey}
                data-language={formCaptchaLanguage}
              />
              <script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                async
                defer
              />
            </>
          ) : null}
        </form>
      );
    }
    case "nav": {
      const navProps = node.props;
      const navBrand = resolveNodeLocalizedText(
        node,
        "brand",
        navProps.brand ?? "",
        options.contentLocale,
      );
      const navBrandCue = localeFallbackCue(
        navBrand.isFallback,
        options.contentLocale,
      );
      const collapseAt = navProps.collapseAt ?? "mobile";
      const submenuVariant = navProps.submenuVariant ?? "dropdown";
      const mobileMenuVariant = navProps.mobileMenuVariant ?? "dropdown";
      const menuLabel = navProps.menuLabel?.trim() || "Menu";
      const navAriaLabel = navProps.ariaLabel?.trim() || "Primary";
      const menuId = `${node.id}-menu`;
      // A4 follow-up — when bound to a collection nav source (cms_page /
      // cms_posts) AND the SHELL/server caller supplied resolved records, auto-
      // populate the top-level links from those records (always flat — bound
      // links carry no submenu). With no binding or no resolved records the
      // static authored `links[]` render exactly as before (byte-identical).
      const boundNavLinks = navProps.dataBinding
        ? navLinksFromRecords(
            collectionRecordsForSource(
              navProps.dataBinding.sourceKey,
              options.dataSources,
            ),
            navProps.dataBinding.maxItems,
          )
        : [];
      const links: BuilderNavLink[] =
        boundNavLinks.length > 0 ? boundNavLinks : navProps.links ?? [];
      // A3 — render one link row item. A link with NO children emits the EXACT
      // pre-A3 `<li><a>…</a></li>` markup (byte-identical). A link WITH children
      // wraps in a CSS-only disclosure: desktop = a hover/focus dropdown (or a
      // wider multi-column "mega" panel), mobile = the children nest inline. The
      // `aria-haspopup`/`group` semantics live on the parent <li>; the panel is
      // a real <ul> in the a11y tree (never display:none-into-nothing on focus).
      const renderNavLinks = (variant: "inline" | "menu") =>
        links.map((link) => {
          const children = link.children ?? [];
          const linkAnchor = (
            <a href={prefixPublicHref(link.href, options.publicPathPrefix)}>
              {link.label}
            </a>
          );
          if (children.length === 0) {
            return <li key={`${node.id}:${variant}:${link.id}`}>{linkAnchor}</li>;
          }
          const subId = `${node.id}-sub-${link.id}-${variant}`;
          return (
            <li
              key={`${node.id}:${variant}:${link.id}`}
              className="site-builder-node--nav-has-sub"
              data-bn-submenu={submenuVariant}
            >
              {linkAnchor}
              <button
                type="button"
                className="site-builder-node--nav-sub-toggle"
                aria-haspopup="true"
                aria-controls={subId}
                aria-label={`${link.label} submenu`}
                tabIndex={-1}
              >
                <span className="site-builder-node--nav-caret" aria-hidden="true" />
              </button>
              <ul
                id={subId}
                className="site-builder-node--nav-submenu"
                data-bn-submenu={submenuVariant}
              >
                {children.map((child) => (
                  <li key={`${node.id}:${variant}:${link.id}:${child.id}`}>
                    <a href={prefixPublicHref(child.href, options.publicPathPrefix)}>
                      {child.label}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          );
        });
      return (
        <nav
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(navProps.style)}
          data-bn-collapse={collapseAt}
          data-bn-submenu={submenuVariant}
          data-bn-mobile-menu={mobileMenuVariant}
          aria-label={navAriaLabel}
          className="site-builder-node site-builder-node--nav"
          // The menu's colours were documented as "overridable via the
          // --bn-nav-menu-* custom properties" but NOTHING could author them,
          // so every mobile drawer on every site was the same white card --
          // glaring on a dark theme. These props are that authoring path.
          style={{
            ...inlineNodeStyle(navProps.style),
            ...(navProps.menuBackground
              ? { ["--bn-nav-menu-bg" as string]: navProps.menuBackground }
              : {}),
            ...(navProps.menuTextColor
              ? { ["--bn-nav-menu-color" as string]: navProps.menuTextColor }
              : {}),
            ...(navProps.menuBorderColor
              ? { ["--bn-nav-menu-border" as string]: navProps.menuBorderColor }
              : {}),
          } as React.CSSProperties}
        >
          {navBrand.value ? (
            <a
              className="site-builder-node--nav-brand"
              href={prefixPublicHref(navProps.brandHref ?? "/", options.publicPathPrefix)}
              {...navBrandCue.attrs}
              style={navBrandCue.style}
            >
              {navBrand.value}
            </a>
          ) : null}
          <ul className="site-builder-node--nav-links">{renderNavLinks("inline")}</ul>
          {/*
            Mobile disclosure — native <details>/<summary>, CSS-only, no client
            JS. <summary> is focusable + Enter/Space operable, and the platform
            announces its expanded/collapsed state to assistive tech natively, so
            we wire aria-controls (→ the menu) but deliberately OMIT a static
            aria-expanded: it can't update without JS and would lie once toggled.
            Both link sets render in full markup (never visibility:hidden-into-
            nothing), so the links stay reachable at the mobile breakpoint.
          */}
          <details className="site-builder-node--nav-disclosure">
            <summary
              className="site-builder-node--nav-toggle"
              aria-label={menuLabel}
              aria-controls={menuId}
            >
              <span className="site-builder-node--nav-burger" aria-hidden="true" />
            </summary>
            <ul id={menuId} className="site-builder-node--nav-menu">
              {renderNavLinks("menu")}
            </ul>
          </details>
        </nav>
      );
    }
    case "social_links": {
      const socialProps = node.props;
      const size = socialProps.size ?? "md";
      const shape = socialProps.shape ?? "circle";
      const ariaLabel = socialProps.ariaLabel?.trim() || "Social links";
      // A4 — when bound to `workspace_social_links` AND the SHELL/server caller
      // supplied resolved tenant links, render those; otherwise fall back to the
      // static authored links. Either way a missing/invalid href is dropped so
      // the row never emits a dead `<a href>`.
      const boundRecords =
        socialProps.dataBinding
          ? collectionRecordsForSource(
              normalizeSocialSourceKey(socialProps.dataBinding.sourceKey),
              options.dataSources,
            )
          : null;
      const resolved: ReadonlyArray<{
        key: string;
        platform: string;
        href: string;
        label?: string;
      }> =
        boundRecords && boundRecords.length > 0
          ? boundRecords
              .map((record, index) => ({
                key: `bound-${index}`,
                platform: String(record.platform ?? ""),
                href: String(record.href ?? ""),
                label:
                  typeof record.label === "string" ? record.label : undefined,
              }))
              .filter((link) => link.href.length > 0)
          : (socialProps.links ?? [])
              .filter((link) => link.href.trim().length > 0)
              .map((link) => ({
                key: link.id,
                platform: link.platform,
                href: link.href,
                label: link.label,
              }));
      // An empty social row (no links, no bound data) renders nothing rather
      // than an empty <ul> — keeps the shell clean when nothing is configured.
      if (resolved.length === 0) return null;
      return (
        <ul
          key={node.id}
          data-builder-node-id={node.id}
          data-builder-node-kind={node.kind}
          {...builderNodeStyleAttrs(socialProps.style)}
          data-bn-size={size}
          data-bn-shape={shape}
          aria-label={ariaLabel}
          className="site-builder-node site-builder-node--social"
          style={inlineNodeStyle(socialProps.style)}
        >
          {resolved.map((link) => {
            const accessibleLabel =
              link.label?.trim() || socialPlatformLabel(link.platform);
            return (
              <li key={`${node.id}:${link.key}`}>
                <a
                  className="site-builder-node--social-link"
                  href={socialLinkHref(link.platform, link.href)}
                  aria-label={accessibleLabel}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <SocialGlyph platform={link.platform} />
                </a>
              </li>
            );
          })}
        </ul>
      );
    }
    default:
      return null;
  }
}

/**
 * Memoized per-node boundary (Sub-step A of the client-render refactor).
 *
 * This is a PURE restructure for memoization — it renders EXACTLY what
 * `renderBuilderNode(node, options)` returns, with no wrapper element, so the
 * emitted DOM (`data-*` attributes, nesting, React keys) is byte-identical to
 * the un-memoized path. A component's returned root element keeps its own
 * `key={node.id}`; the `key` placed on `<BuilderNodeView>` drives React list
 * reconciliation, which `node.id` already did before. SSR output is unchanged
 * because `memo` is transparent to `renderToStaticMarkup`.
 *
 * The comparator skips re-render only when BOTH the node reference and the
 * single shared `options` reference are unchanged — so any edit that produces a
 * new node (immutable tree updates) repaints exactly that node's subtree.
 *
 * PERF (A3) — since the per-node granularity pass, this boundary is ALSO
 * emitted for every child inside `renderChildren` (and the data-bound /
 * instance / carousel / tabs child paths), not just top-level nodes. Those
 * call sites reference this const before its declaration in file order; that
 * is safe because the reference is evaluated lazily at render time, never
 * during module evaluation (no TDZ).
 */
const BuilderNodeView = memo(
  function BuilderNodeView({
    node,
    options,
  }: {
    node: BuilderNode;
    options: NormalizedBuilderNodeRenderOptions;
  }): ReactNode {
    return renderBuilderNode(node, options);
  },
  (prev, next) =>
    Object.is(prev.node, next.node) && Object.is(prev.options, next.options),
);

/** Shared default for `renderBuilderNodes()` called with no options — a single
 * frozen reference so the omitted-options path also hits the normalize cache
 * instead of allocating a fresh `{}` (and therefore a fresh normalized object)
 * on every render. */
const EMPTY_RENDER_OPTIONS: BuilderNodeRenderOptions = Object.freeze({});

/**
 * PERF (A2) — normalized-options identity cache.
 *
 * `BuilderNodeView` is memoized on `Object.is(prev.options, next.options)`, but
 * `renderBuilderNodes` used to build a FRESH `normalizedOptions` literal on
 * every call. That made the comparator's options half always false, so every
 * top-level node rebuilt its whole vdom on every commit — O(page) per
 * keystroke — throwing away the carefully memoized options object that
 * `ClientBuilderCanvas` passes in.
 *
 * Normalization is a pure function of the caller's options object, so the
 * result is cached in a `WeakMap` keyed by that object. A caller that keeps a
 * stable options reference (the canvas `useMemo`, the shared nested-options
 * helper in `freeform-page-blocks.tsx`) now gets the SAME normalized reference
 * across renders and the memo finally bails on unchanged subtrees. A caller
 * that builds a new options object still gets a fresh normalize — identical
 * output, no staleness. (Callers must not mutate an options object in place
 * after passing it; nothing in the repo does.)
 */
const normalizedOptionsCache = new WeakMap<
  BuilderNodeRenderOptions,
  NormalizedBuilderNodeRenderOptions
>();

function normalizeBuilderNodeRenderOptions(
  options: BuilderNodeRenderOptions,
): NormalizedBuilderNodeRenderOptions {
  const cached = normalizedOptionsCache.get(options);
  if (cached) return cached;
  const normalized: NormalizedBuilderNodeRenderOptions = {
    publicPathPrefix: options.publicPathPrefix ?? "",
    // Absent in lighter contexts (tests, tenant-less previews) → the `form`
    // node renders no widget, exactly as before this option existed.
    captcha: options.captcha ?? null,
    mode: options.mode ?? "freeform",
    dataSources: options.dataSources ?? {},
    includeRendererStyles: options.includeRendererStyles ?? true,
    includeFontLinks: options.includeFontLinks ?? true,
    components: options.components ?? {},
    styleClasses: options.styleClasses ?? {},
    visibilityContext: options.visibilityContext,
    renderSectionEmbed: options.renderSectionEmbed ?? null,
    animateLayout: options.animateLayout ?? false,
    componentStyleDefaults: options.componentStyleDefaults ?? {},
    contentLocale: options.contentLocale,
    // Falls back to the per-element translation locale when a caller set that
    // but not this, so the two can never disagree about the visitor's language.
    visitorLocale: options.visitorLocale ?? options.contentLocale?.locale,
    experimentSeed: options.experimentSeed,
    experimentTenantId: options.experimentTenantId,
    experimentSurface: options.experimentSurface,
    repeatItem: null,
    repeatDepth: 0,
  };
  normalizedOptionsCache.set(options, normalized);
  return normalized;
}

export function renderBuilderNodes(
  nodes: ReadonlyArray<BuilderNode>,
  options: BuilderNodeRenderOptions = EMPTY_RENDER_OPTIONS,
): ReactNode {
  const normalizedOptions = normalizeBuilderNodeRenderOptions(options);
  const nodeViews = nodes
    .filter((node) => shouldRenderNode(node, normalizedOptions))
    // HYGIENE-1 Q5 — Prune top-level data-bound repeater sections whose resolved
    // collection is empty AND have no static fallback children. This prevents
    // empty "Selected work" / "Services" sections from rendering over nothing.
    // The predicate is conservative: it only fires when the source is known and
    // definitely empty; unknown sources and sections with manual content are kept.
    // The editor canvas passes no dataSources → pruning is inert in edit mode.
    .filter(
      (node) =>
        !isRenderableEmptySection(node, normalizedOptions.dataSources),
    )
    .map((node) => (
      <BuilderNodeView key={node.id} node={node} options={normalizedOptions} />
    ));
  if (nodeViews.length === 0) return null;
  // W3-T1 — editor-only: wrap the block list in the FLIP motion primitive. The
  // wrapper is `display: contents` (no box, overlay-safe) and only emitted when
  // the editor canvas opts in, so the server / published markup is unchanged.
  const renderedNodes: ReactNode = normalizedOptions.animateLayout ? (
    <BuilderNodeLayoutMotion key="site-builder-node-layout-motion">
      {nodeViews}
    </BuilderNodeLayoutMotion>
  ) : (
    nodeViews
  );
  const fontLinks = normalizedOptions.includeFontLinks ? (
    <BuilderNodeFontLinks
      key="site-builder-node-fonts"
      nodes={nodes}
      components={normalizedOptions.components}
    />
  ) : null;
  const headNodes = [
    fontLinks,
    normalizedOptions.includeRendererStyles ? (
      <BuilderNodeRendererStyles key="site-builder-node-styles" />
    ) : null,
    // Reveal-on-view runtime — only when the sheet is included AND some node
    // opts in, so pages without a reveal interaction stay byte-identical.
    normalizedOptions.includeRendererStyles && hasRevealOnViewNode(nodes) ? (
      <BuilderNodeRevealRuntime key="site-builder-node-reveal" />
    ) : null,
    // ABTEST-1 — experiment view/convert runtime. Injected ONLY when a visitor
    // seed is present (public render, not the editor canvas / tests) AND some
    // eligible CTA / form node carries a live 2-arm experiment, so pages with no
    // experiment stay byte-identical (no extra script).
    normalizedOptions.experimentSeed &&
    hasLiveExperimentNode(nodes, normalizedOptions.experimentSeed) ? (
      <BuilderNodeExperimentRuntime
        key="site-builder-node-experiment"
        tenantId={normalizedOptions.experimentTenantId ?? null}
        surface={normalizedOptions.experimentSurface ?? null}
      />
    ) : null,
  ].filter(Boolean);
  if (headNodes.length === 0) return renderedNodes;
  // `renderedNodes` is an array on the byte-stable (non-animate) path and a
  // single `<BuilderNodeLayoutMotion>` element when motion is on; `concat`
  // flattens an array and appends a lone element, so the non-animate output
  // stays exactly `[...headNodes, ...nodeViews]` as before.
  return ([] as ReactNode[]).concat(headNodes, renderedNodes);
}

/**
 * True when any node in the tree opts into the reveal-on-view interaction. Used
 * to gate the inline IntersectionObserver runtime so non-reveal pages emit no
 * extra script (back-compat / byte-stability). Walks every node-style carrier —
 * the node's own `style` plus the breakpoint layers — since a reveal can be set
 * per-viewport.
 */
function hasRevealOnViewNode(nodes: ReadonlyArray<BuilderNode>): boolean {
  const styleReveals = (style: BuilderNodeStyle | undefined): boolean => {
    if (!style) return false;
    if (style.revealOnView && style.revealOnView !== "none") return true;
    const t = style.responsive?.tablet?.revealOnView;
    const m = style.responsive?.mobile?.revealOnView;
    return (
      (t !== undefined && t !== "none") || (m !== undefined && m !== "none")
    );
  };
  const visit = (node: BuilderNode): boolean => {
    const style = "props" in node ? (node.props as { style?: BuilderNodeStyle }).style : undefined;
    if (styleReveals(style)) return true;
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (visit(child)) return true;
      }
    }
    return false;
  };
  return nodes.some(visit);
}

export function BuilderNodeRevealRuntime(): ReactNode {
  return (
    <script
      data-builder-node-reveal-runtime=""
      dangerouslySetInnerHTML={{ __html: BUILDER_NODE_REVEAL_SCRIPT }}
    />
  );
}

/**
 * ABTEST-1 — true when any node in the tree is a LIVE experiment under the given
 * seed: an eligible CTA / form kind whose `experiment` resolves to a served
 * variant. Mirrors the per-node resolution gate exactly (so the runtime is only
 * injected when at least one `[data-experiment]` element is actually emitted).
 * Walks children too, since an experiment node can be nested.
 */
function hasLiveExperimentNode(
  nodes: ReadonlyArray<BuilderNode>,
  seed: string | null | undefined,
): boolean {
  const visit = (node: BuilderNode): boolean => {
    if (resolveNodeExperiment(node, seed)) return true;
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (visit(child)) return true;
      }
    }
    return false;
  };
  return nodes.some(visit);
}

export function BuilderNodeExperimentRuntime({
  tenantId,
  surface,
}: {
  tenantId: string | null;
  surface: string | null;
}): ReactNode {
  return (
    <script
      data-builder-node-experiment-runtime=""
      {...(tenantId ? { "data-tenant-id": tenantId } : {})}
      {...(surface ? { "data-surface": surface } : {})}
      dangerouslySetInnerHTML={{ __html: BUILDER_NODE_EXPERIMENT_SCRIPT }}
    />
  );
}

export function collectBuilderImageMediaIds(
  nodes: ReadonlyArray<BuilderNode>,
): string[] {
  const ids = new Set<string>();
  const visit = (node: BuilderNode) => {
    if (node.kind === "image" && node.props.mediaId) {
      ids.add(node.props.mediaId);
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return [...ids];
}

export function BuilderNodeFontLinks({
  nodes,
  components,
}: {
  nodes: ReadonlyArray<BuilderNode>;
  components?: ComponentDefinitions;
}): ReactNode {
  const href = buildGoogleFontsHrefForFamilies(
    collectBuilderNodeFontFamilies(nodes, components),
  );
  if (!href) return null;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={href} data-builder-node-fonts="" />
    </>
  );
}

/**
 * The single shared `<style>` that carries the renderer stylesheet for every
 * public render path. By default (no `kinds`) it emits the FULL sheet — the Lab
 * editor canvas and any un-migrated caller keep today's behavior byte-for-byte.
 *
 * REND-2 — a PUBLIC-RENDER optimization: when a caller passes the set of
 * node-kinds present on the page (via `collectPresentNodeKinds`), the sheet is
 * scoped to the base rules plus only those kinds' rules. `buildScopedRendererCss`
 * falls back to the full sheet on any uncertainty, so the emitted sheet is always
 * a superset of what the present kinds need. The single-sheet-per-page invariant
 * (render-perf-budget.test.ts) is unchanged — this only shrinks the one sheet.
 */
export function BuilderNodeRendererStyles({
  kinds,
}: {
  kinds?: ReadonlySet<BuilderNodeKind> | null;
} = {}): ReactNode {
  const css = buildScopedRendererCss(BUILDER_NODE_RENDERER_CSS, kinds);
  return (
    <style
      data-builder-node-renderer-styles=""
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}

export { buildScopedRendererCss, collectPresentNodeKinds };

export function hasRenderableBuilderNodes(
  nodes: ReadonlyArray<BuilderNode>,
  options: Pick<BuilderNodeRenderOptions, "mode"> = {},
): boolean {
  const mode = options.mode ?? "freeform";
  // Structural check only — no per-request visibility context here, so an
  // undefined context makes the visibility rule a no-op (everything counts).
  return nodes.some((node) => {
    if (!shouldRenderNode(node, { mode, visibilityContext: undefined })) {
      return false;
    }
    if (hasRenderableChildren(node)) {
      return true;
    }
    return node.kind !== "section";
  });
}
