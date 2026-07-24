import { Suspense, cache, type CSSProperties } from "react";
import Image from "next/image";

import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { createTranslator, getMessageStringArray } from "@/i18n/messages";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { loadDirectoryCategoryTree } from "@/lib/directory/directory-category-tree";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getPublicDirectoryFirstPage } from "@/lib/directory/cache";
import {
  directorySurfaceFromTenantId,
  getCachedDirectoryFilterSidebarModel,
} from "@/lib/directory/field-driven-filters";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { resolveGoogleMapsKeyForClient } from "@/lib/integrations/resolve";
import { logServerError } from "@/lib/server/safe-error";
import { getCardKit } from "@/lib/site-admin/presets/card-kits";
import { HeroSearch, type HeroSearchCopy } from "@/components/home/hero-search";

import { nodePresentationInlineStyle } from "../shared/node-presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { DirectoryV1 } from "./schema";
import { normalizeDirectoryProps } from "./normalize";
import { DirectoryBannerTopBar } from "./DirectoryBannerTopBar";
import { DirectoryReactiveResults } from "./DirectoryReactiveResults";
import { resolveDirectoryScopeSeed } from "./scope-seed";

function eyebrowSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "0.68rem",
    md: "0.75rem",
    lg: "0.85rem",
    xl: "0.95rem",
    display: "1.1rem",
  }[size];
}

function headingSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "1.9rem",
    md: "2.35rem",
    lg: "2.85rem",
    xl: "3.4rem",
    display: "clamp(3.5rem, 6vw, 6rem)",
  }[size];
}

function paragraphSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "0.9rem",
    md: "1rem",
    lg: "1.12rem",
    xl: "1.25rem",
    display: "clamp(2rem, 4vw, 4.5rem)",
  }[size];
}

/**
 * P4 — Resolve a per-instance `cardKitOverride` slug to inline `--token-card-*`
 * CSS vars. The kit's `card.*` registry tokens are projected onto the SAME
 * cascade vars the canonical `<TalentCard>` reads (`TALENT_CARD_VARS`), so the
 * cards inside THIS directory instance repaint in the override palette without
 * touching the tenant-wide published Card Design.
 *
 * MUST be inline `style` vars (never a linked class): `publishPageSnapshot`
 * does not bake classes, so a class-based kit would silently drop on publish.
 * Returns `undefined` when the slug is unset / unknown so the instance inherits
 * the tenant's published card palette.
 */
const CARD_KIT_TOKEN_TO_CSS_VAR: Record<string, string> = {
  "card.surface": "--token-card-surface",
  "card.name-color": "--token-card-name-color",
  "card.muted": "--token-card-muted",
};

function resolveCardKitOverrideStyle(
  slug: string | undefined,
): CSSProperties | undefined {
  if (!slug) return undefined;
  const kit = getCardKit(slug);
  if (!kit) return undefined;
  const style: Record<string, string> = {};
  for (const [tokenKey, value] of Object.entries(kit.tokens)) {
    const cssVar = CARD_KIT_TOKEN_TO_CSS_VAR[tokenKey];
    if (cssVar) style[cssVar] = value;
  }
  return Object.keys(style).length > 0
    ? (style as CSSProperties)
    : undefined;
}

/**
 * #6 polish: cache `buildDirectoryUiCopy` per request so nested renders
 * within a single request reuse the built copy table instead of rebuilding
 * it. `React.cache` is request-scoped and keyed on argument identity.
 */
const cachedBuildDirectoryUiCopy = cache(
  (
    t: ReturnType<typeof createTranslator>,
    brand?: string | null,
  ) => buildDirectoryUiCopy(t, brand),
);

/**
 * P1 Option B — Public render of the portable Directory section.
 *
 * Server shell (this file): heading, AI `HeroSearch` band, structured-data
 * hooks, empty state. Server-fetches the unfiltered first page + sidebar
 * model for the section's scope and hands them to a `"use client"` island
 * (`DirectoryReactiveResults`) which reads the live URL via
 * `useSearchParams()` and reconciles via the legacy `DirectoryInfiniteGrid`
 * → public `/api/directory`. Filter / sort / pill / pagination controls are
 * the existing legacy components; portability is delivered by the
 * path-aware `clientDirectoryHref` (auto-detects basePath from pathname),
 * not by editing those controls.
 *
 * B3 — Premium `DirectoryCard` IS now the reactive-grid card. The
 * portable section owns its own `useInfiniteQuery` in
 * `DirectoryReactiveGrid`, fetches `/api/directory` (and `/api/ai/search`
 * when an AI query is live), and renders the canonical card via
 * `DirectoryCardAdapter`. The legacy `DirectoryInfiniteGrid` +
 * `TalentCard` are no longer mounted by this section.
 */
export async function DirectoryComponent({
  props: rawProps,
  locale,
  builderNodeBindings,
}: SectionComponentProps<DirectoryV1>) {
  const props = normalizeDirectoryProps(rawProps);
  const loc: Locale = isLocale(locale) ? locale : defaultLocale;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;

  // Tenant context for the public directory query (scoped by host).
  const publicScope = await getPublicTenantScope();
  const directoryTenantId = publicScope?.tenantId ?? null;
  const surface = directorySurfaceFromTenantId(publicScope?.tenantId ?? null);
  // Map view key: prefer the TENANT's own Google Maps integration key (admin →
  // Settings → Integrations, custom mode) so the tenant's own referrer-restricted
  // key authorizes their custom domain; falls back to the platform key in inherit
  // mode. null → the map panel shows its graceful "unavailable" box.
  const mapApiKey = await resolveGoogleMapsKeyForClient(directoryTenantId);

  // Resolve scope seed: maps by_talent_type keys → taxonomy term UUIDs for
  // the SSR first-page pre-filter, surfaces manual codes for client
  // reconciliation, and sets an honest scopeLimited hint when the requested
  // scope cannot be fully enforced server-side (by_tag, manual).
  const scopeSeed = await resolveDirectoryScopeSeed(
    props,
    directoryTenantId,
    loc,
  );
  const seedTaxonomyTermIds = scopeSeed.termIds;

  const scopeLimitedHint = scopeSeed.scopeLimited
    ? pickLocale(loc, {
        en:
          props.scope === "by_tag"
            ? "This section shows all talent. Tag scope projection lands with the deferred public Discover listing endpoint."
            : "This section shows all talent. Manual pick scope is not yet applied on the public listing.",
        es:
          props.scope === "by_tag"
            ? "Esta sección muestra todos los talentos. El filtro por etiquetas aún no proyecta en este endpoint."
            : "Esta sección muestra todos los talentos. La selección manual aún no se aplica en el listado público.",
      })
    : undefined;

  let initialPage: Awaited<ReturnType<typeof getPublicDirectoryFirstPage>> | null =
    null;
  let sidebar: Awaited<ReturnType<typeof getCachedDirectoryFilterSidebarModel>> = {
    blocks: [],
  };
  let aiFlags: Awaited<ReturnType<typeof getAiFeatureFlags>> | null = null;

  try {
    [initialPage, sidebar, aiFlags] = await Promise.all([
      getPublicDirectoryFirstPage({
        taxonomyTermIds: seedTaxonomyTermIds,
        locale: loc,
        sort: "recommended",
        limit: props.pageSize,
        tenantId: directoryTenantId,
      }),
      getCachedDirectoryFilterSidebarModel(
        loc,
        {
          taxonomyTermIds: seedTaxonomyTermIds,
          locationSlug: "",
          heightMinCm: null,
          heightMaxCm: null,
          ageMin: null,
          ageMax: null,
          query: "",
          fieldFacets: [],
        },
        surface,
      ),
      getAiFeatureFlags(),
    ]);
  } catch (e) {
    logServerError("directory-section/ssr-seed", e);
  }

  const t = createTranslator(loc);
  const ui = cachedBuildDirectoryUiCopy(t);
  const aiEnabled = Boolean(
    aiFlags?.ai_master_enabled && aiFlags.ai_search_enabled,
  );
  const heroCopy: HeroSearchCopy = {
    placeholder:
      props.aiPlaceholder || t("public.home.hero.searchPlaceholder"),
    ariaLabel: t("public.home.hero.searchAria"),
    searchSubmit: t("public.directory.ui.hero.searchSubmit"),
    typedExamples:
      props.aiExamplePrompts.length > 0
        ? props.aiExamplePrompts
        : getMessageStringArray(loc, "public.home.hero.typedExamples"),
    interpreting: t("public.directory.ui.hero.interpreting"),
    interpretErrorTitle: t("public.directory.ui.hero.interpretErrorTitle"),
    interpretError: t("public.directory.ui.hero.interpretError"),
    interpretErrorDirectoryClosed: t(
      "public.directory.ui.hero.interpretErrorDirectoryClosed",
    ),
    interpretErrorAiDisabled: t(
      "public.directory.ui.hero.interpretErrorAiDisabled",
    ),
    interpretErrorService: t("public.directory.ui.hero.interpretErrorService"),
  };

  const boxed = props.containerWidth !== "full";
  const headAlign =
    props.headerAlign === "left" || props.headerAlign === "split"
      ? "items-start text-left"
      : "items-center text-center mx-auto";

  // #6 polish: density + hover knobs propagate as data attributes so card
  // CSS can opt in without DirectoryCard growing hooks (RP-1 / T2 reuse:
  // DirectoryCard stays pure prop-driven).
  const sectionStyle = {
    "--dir-cols-m": props.columnsMobile,
    "--dir-cols-t": props.columnsTablet,
    "--dir-cols-d": props.columnsDesktop,
  } as unknown as CSSProperties;

  // P4 — per-instance card-kit override projected to inline `--token-card-*`
  // vars on the results wrapper (DirectoryReactiveResults). Undefined → the
  // instance inherits the tenant's published card palette.
  const cardKitOverrideStyle = resolveCardKitOverrideStyle(
    props.cardKitOverride,
  );

  const seedItems = initialPage?.items ?? [];
  const hasResults = seedItems.length > 0;
  const seedFailed = initialPage === null;

  const topBarFacet =
    props.topBarMode === "talent_type" && sidebar.topBarFacet
      ? {
          label: sidebar.topBarFacet.label,
          options: sidebar.topBarFacet.options.map((o) => ({
            id: o.id,
            label: o.label,
            ...(o.count !== undefined ? { count: o.count } : {}),
          })),
        }
      : undefined;

  // Two-level parent→child category model for the top bar (parent_category
  // pills that reveal their talent-type children to refine). Empty when not in
  // talent_type top-bar mode or when the roster has no mappable categories;
  // the pill bar falls back to the flat `topBarFacet` options in that case.
  const categoryTree =
    props.topBarMode === "talent_type" && directoryTenantId
      ? await loadDirectoryCategoryTree(
          directoryTenantId,
          pickLocale(loc, { en: "en", es: "es" } as const),
        )
      : [];

  // Full-bleed lifestyle banner: the heading, AI search band and the category
  // quick-link bar all live INSIDE the photo. Empty → the plain header path.
  const heroImage = (props.heroImage ?? "").trim();
  const hasBanner = Boolean(heroImage);

  return (
    <section
      data-section="directory"
      data-template={props.template}
      data-card-style={props.cardStyle}
      data-density={props.density}
      data-hover={props.hoverBehavior}
      className={
        hasBanner
          ? "w-full pb-14 sm:pb-20"
          : props.background === "cool_ground"
            ? "w-full bg-[var(--token-color-surface-raised,var(--impronta-surface))]/25 px-4 py-14 sm:px-6 sm:py-20"
            : props.background === "subtle"
              ? "w-full bg-foreground/[0.015] px-4 py-14 sm:px-6 sm:py-20"
              : "w-full px-4 py-14 sm:px-6 sm:py-20"
      }
      style={sectionStyle}
    >
      {hasBanner ? (
        <div className="relative isolate w-full overflow-hidden">
          <Image
            src={heroImage}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: "50% 62%" }}
          />
          {/* Noir wash + a bottom fade into the page canvas so the banner
              melts into the results instead of ending on a hard line. */}
          <div aria-hidden className="absolute inset-0 bg-black/35" />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.5),rgba(0,0,0,0.12)_42%,var(--background)_98%)]"
          />
          <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-4 pb-10 pt-20 text-center sm:px-6 sm:pb-12 sm:pt-28">
            {props.showHeading &&
            (props.eyebrow || props.headline || props.copy) ? (
              <header className="flex max-w-2xl flex-col items-center gap-4">
                {props.eyebrow ? (
                  <span
                    className="text-[0.7rem] font-medium uppercase text-white/65"
                    data-builder-node-id={nodeIdsByRole?.subheadline}
                    style={{
                      letterSpacing: "var(--site-label-tracking, 0.22em)",
                      ...nodePresentationInlineStyle(
                        props.nodePresentation?.subheadline,
                        eyebrowSize,
                      ),
                    }}
                  >
                    {renderInlineRich(props.eyebrow)}
                  </span>
                ) : null}
                {props.headline ? (
                  <h2
                    className="font-display text-3xl font-medium tracking-wide text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)] sm:text-5xl"
                    data-builder-node-id={nodeIdsByRole?.headline}
                    style={{
                      fontFamily: "var(--site-heading-font, inherit)",
                      ...nodePresentationInlineStyle(
                        props.nodePresentation?.headline,
                        headingSize,
                      ),
                    }}
                  >
                    {renderInlineRich(props.headline)}
                  </h2>
                ) : null}
                {props.copy ? (
                  <p
                    className="text-[15px] leading-relaxed text-white/80"
                    data-builder-node-id={nodeIdsByRole?.copy}
                    style={nodePresentationInlineStyle(
                      props.nodePresentation?.copy,
                      paragraphSize,
                    )}
                  >
                    {renderInlineRich(props.copy)}
                  </p>
                ) : null}
              </header>
            ) : null}

            {props.aiMode !== "off" ? (
              <div className="mt-8 w-full max-w-2xl">
                <Suspense
                  fallback={
                    <div className="h-14 w-full rounded-xl border border-white/15 bg-black/40 sm:h-16" />
                  }
                >
                  <HeroSearch
                    copy={heroCopy}
                    directoryUrlSync
                    initialDirectoryQuery=""
                    aiSearchEnabled={aiEnabled}
                    locale={pickLocale(loc, { en: "en", es: "es" } as const)}
                  />
                </Suspense>
              </div>
            ) : null}

            {props.topBarMode !== "none" && topBarFacet ? (
              <div className="mt-7 w-full">
                <DirectoryBannerTopBar
                  options={topBarFacet.options}
                  categoryTree={categoryTree}
                  allLabel={ui.topBarPills.all}
                  barAriaLabel={topBarFacet.label}
                  overflowCopy={ui.topBarPills}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className={`${boxed ? "mx-auto w-full max-w-7xl" : "w-full"}${
          hasBanner ? " mt-8 px-4 sm:px-6" : ""
        }`}
      >
        {!hasBanner &&
        props.showHeading &&
        (props.eyebrow || props.headline || props.copy) ? (
          <header
            className={`mb-10 flex max-w-2xl flex-col gap-4 border-b border-[var(--token-color-line,rgba(120,120,120,0.18))] pb-7 ${headAlign}`}
          >
            {props.eyebrow ? (
              <span
                className="text-[0.7rem] font-medium uppercase text-[var(--token-color-muted,var(--impronta-muted))]"
                data-builder-node-id={nodeIdsByRole?.subheadline}
                style={{
                  letterSpacing: "var(--site-label-tracking, 0.22em)",
                  ...nodePresentationInlineStyle(
                    props.nodePresentation?.subheadline,
                    eyebrowSize,
                  ),
                }}
              >
                {renderInlineRich(props.eyebrow)}
              </span>
            ) : null}
            {props.headline ? (
              <h2
                className="font-display text-3xl font-medium tracking-wide text-[var(--token-color-ink,var(--foreground))] sm:text-4xl"
                data-builder-node-id={nodeIdsByRole?.headline}
                style={{
                  fontFamily: "var(--site-heading-font, inherit)",
                  ...nodePresentationInlineStyle(
                    props.nodePresentation?.headline,
                    headingSize,
                  ),
                }}
              >
                {renderInlineRich(props.headline)}
              </h2>
            ) : null}
            {props.copy ? (
              <p
                className="text-[15px] leading-relaxed text-[var(--token-color-muted,var(--impronta-muted))]"
                data-builder-node-id={nodeIdsByRole?.copy}
                style={nodePresentationInlineStyle(
                  props.nodePresentation?.copy,
                  paragraphSize,
                )}
              >
                {renderInlineRich(props.copy)}
              </p>
            ) : null}
          </header>
        ) : null}

        {!hasBanner && props.aiMode !== "off" ? (
          <div
            className={`mb-10 w-full max-w-2xl ${
              props.aiPlacement === "above_left" ? "" : "mx-auto"
            }`}
          >
            <Suspense
              fallback={
                <div className="h-14 w-full rounded-xl border border-[var(--token-color-line,var(--border))] bg-[var(--token-color-surface-raised,var(--impronta-surface))]/40 sm:h-16" />
              }
            >
              <HeroSearch
                copy={heroCopy}
                directoryUrlSync
                initialDirectoryQuery=""
                aiSearchEnabled={aiEnabled}
                locale={pickLocale(loc, { en: "en", es: "es" } as const)}
              />
            </Suspense>
          </div>
        ) : null}

        {seedFailed ? (
          <div className="mx-auto max-w-md border-y border-[var(--token-color-line,rgba(120,120,120,0.18))] px-6 py-20 text-center">
            <p className="text-sm text-[var(--token-color-muted,var(--impronta-muted))]">
              {ui.discoverLoadError}
            </p>
          </div>
        ) : !hasResults ? (
          <div className="mx-auto max-w-md border-y border-[var(--token-color-line,rgba(120,120,120,0.18))] px-6 py-20 text-center">
            {props.emptyStateTitle ? (
              <p
                className="font-display text-lg text-[var(--token-color-ink,var(--foreground))]"
                style={{ fontFamily: "var(--site-heading-font, inherit)" }}
              >
                {props.emptyStateTitle}
              </p>
            ) : null}
            <p className="mt-3 text-sm leading-relaxed text-[var(--token-color-muted,var(--impronta-muted))]">
              {props.emptyStateText ||
                "No one matches yet, check back as the roster grows."}
            </p>
          </div>
        ) : (
          <DirectoryReactiveResults
            initialPage={initialPage!}
            locale={pickLocale(loc, { en: "en", es: "es" } as const)}
            ui={ui}
            mapApiKey={mapApiKey}
            topBarFacet={topBarFacet}
            categoryTree={categoryTree}
            sidebarBlocks={sidebar.blocks}
            defaultSort={props.defaultSort}
            showTopBar={props.topBarMode !== "none" && !hasBanner}
            showSidebar={props.sidebarShow}
            showSort={props.sortControlShow}
            showResultCount={props.showResultCount}
            showActiveChips={props.showActiveChips}
            aiSearchEnabled={aiEnabled}
            scopeLimitedHint={scopeLimitedHint}
            cardKitOverrideStyle={cardKitOverrideStyle}
            sidebarPosition={props.sidebarPosition}
            sidebarSticky={props.sidebarSticky}
            scope={props.scope}
            manualProfileCodes={scopeSeed.manualProfileCodes}
            density={props.density}
            hoverBehavior={props.hoverBehavior}
            cardStyle={props.cardStyle}
            cardAspect={props.cardAspect}
            showName={props.showName}
            showTalentType={props.showTalentType}
            showLocation={props.showLocation}
            showAvailability={props.showAvailability}
            showBadges={props.showBadges}
            showSave={props.showSave}
            showAddToInquiry={props.showAddToInquiry}
            cardFieldKeys={props.cardFieldKeys}
            maxFieldLines={props.maxFieldLines}
            nameFallback={props.nameFallback}
            columnsDesktop={props.columnsDesktop}
            columnsTablet={props.columnsTablet}
            columnsMobile={props.columnsMobile}
          />
        )}
      </div>
    </section>
  );
}
