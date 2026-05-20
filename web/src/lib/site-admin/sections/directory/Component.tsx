import { Suspense, cache, type CSSProperties } from "react";

import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { createTranslator, getMessageStringArray } from "@/i18n/messages";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getPublicDirectoryFirstPage } from "@/lib/directory/cache";
import {
  directorySurfaceFromTenantId,
  getCachedDirectoryFilterSidebarModel,
} from "@/lib/directory/field-driven-filters";
import { getPublicTenantScope, getPublicHostContext } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { HeroSearch, type HeroSearchCopy } from "@/components/home/hero-search";

import { nodePresentationInlineStyle } from "../shared/node-presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { DirectoryV1 } from "./schema";
import { DirectoryReactiveResults } from "./DirectoryReactiveResults";

function eyebrowSize(size: "sm" | "md" | "lg" | "xl"): string {
  return {
    sm: "0.68rem",
    md: "0.75rem",
    lg: "0.85rem",
    xl: "0.95rem",
  }[size];
}

function headingSize(size: "sm" | "md" | "lg" | "xl"): string {
  return {
    sm: "1.9rem",
    md: "2.35rem",
    lg: "2.85rem",
    xl: "3.4rem",
  }[size];
}

function paragraphSize(size: "sm" | "md" | "lg" | "xl"): string {
  return {
    sm: "0.9rem",
    md: "1rem",
    lg: "1.12rem",
    xl: "1.25rem",
  }[size];
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
  props,
  locale,
  builderNodeBindings,
}: SectionComponentProps<DirectoryV1>) {
  const loc: Locale = isLocale(locale) ? locale : defaultLocale;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;

  // Tenant context for the public directory query (scoped by host).
  const [hostContext, publicScope] = await Promise.all([
    getPublicHostContext(),
    getPublicTenantScope(),
  ]);
  const directoryTenantId =
    hostContext.kind === "agency" ? hostContext.tenantId : null;
  const surface = directorySurfaceFromTenantId(publicScope?.tenantId ?? null);

  // Section-scope → seed taxonomy filter (currently only by_talent_type
  // contributes term ids; by_tag / manual / all leave the seed open). The
  // engine expects term *ids*, not catalog keys, so we cannot pre-filter
  // `by_talent_type` without a key→id resolver. Phase B #3 work — for
  // Phase 1, the seed remains open and the pill bar drives taxonomy
  // filtering reactively.
  const seedTaxonomyTermIds: string[] = [];

  // #6 polish: honest scope-limited hint for `by_tag` with non-empty
  // tagKeys (no fake filtering — Amendment A2 rule).
  const scopeLimitedHint =
    props.scope === "by_tag" && props.tagKeys.length > 0
      ? loc === "es"
        ? "Esta sección muestra todos los talentos disponibles — el filtro por etiquetas aún no proyecta en este endpoint."
        : "This section shows all talent — tag-scope projection lands with the deferred public Discover listing endpoint."
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

  return (
    <section
      data-section="directory"
      data-template={props.template}
      data-card-style={props.cardStyle}
      data-density={props.density}
      data-hover={props.hoverBehavior}
      className={
        props.background === "cool_ground"
          ? "w-full bg-[var(--impronta-surface)]/25 px-4 py-12 sm:px-6 sm:py-16"
          : props.background === "subtle"
            ? "w-full bg-foreground/[0.015] px-4 py-12 sm:px-6 sm:py-16"
            : "w-full px-4 py-12 sm:px-6 sm:py-16"
      }
      style={sectionStyle}
    >
      <div className={boxed ? "mx-auto w-full max-w-7xl" : "w-full"}>
        {props.showHeading &&
        (props.eyebrow || props.headline || props.copy) ? (
          <header
            className={`mb-9 flex max-w-2xl flex-col gap-3 ${headAlign}`}
          >
            {props.eyebrow ? (
              <span
                className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--impronta-muted)]"
                data-builder-node-id={nodeIdsByRole?.subheadline}
                style={nodePresentationInlineStyle(
                  props.nodePresentation?.subheadline,
                  eyebrowSize,
                )}
              >
                {renderInlineRich(props.eyebrow)}
              </span>
            ) : null}
            {props.headline ? (
              <h2
                className="font-display text-3xl font-medium tracking-wide text-foreground sm:text-4xl"
                data-builder-node-id={nodeIdsByRole?.headline}
                style={nodePresentationInlineStyle(
                  props.nodePresentation?.headline,
                  headingSize,
                )}
              >
                {renderInlineRich(props.headline)}
              </h2>
            ) : null}
            {props.copy ? (
              <p
                className="text-[15px] leading-relaxed text-[var(--impronta-muted)]"
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
          <div
            className={`mb-10 w-full max-w-2xl ${
              props.aiPlacement === "above_left" ? "" : "mx-auto"
            }`}
          >
            <Suspense
              fallback={
                <div className="h-14 w-full rounded-xl border border-border bg-[var(--impronta-surface)]/40 sm:h-16" />
              }
            >
              <HeroSearch
                copy={heroCopy}
                directoryUrlSync
                initialDirectoryQuery=""
                aiSearchEnabled={aiEnabled}
                locale={loc === "es" ? "es" : "en"}
              />
            </Suspense>
          </div>
        ) : null}

        {seedFailed ? (
          <div className="rounded-2xl border border-border bg-background/50 px-6 py-20 text-center">
            <p className="mt-2 text-sm text-[var(--impronta-muted)]">
              {ui.discoverLoadError}
            </p>
          </div>
        ) : !hasResults ? (
          <div className="rounded-2xl border border-border bg-background/50 px-6 py-20 text-center">
            {props.emptyStateTitle ? (
              <p className="font-display text-lg text-foreground">
                {props.emptyStateTitle}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-[var(--impronta-muted)]">
              {props.emptyStateText ||
                "No one matches yet — check back as the roster grows."}
            </p>
          </div>
        ) : (
          <DirectoryReactiveResults
            initialPage={initialPage!}
            locale={loc === "es" ? "es" : "en"}
            ui={ui}
            topBarFacet={topBarFacet}
            sidebarBlocks={sidebar.blocks}
            defaultSort={props.defaultSort}
            showTopBar={props.topBarMode !== "none"}
            showSidebar={props.sidebarShow}
            showSort={props.sortControlShow}
            showResultCount={props.showResultCount}
            showActiveChips={props.showActiveChips}
            aiSearchEnabled={aiEnabled}
            scopeLimitedHint={scopeLimitedHint}
            density={props.density}
            hoverBehavior={props.hoverBehavior}
            cardStyle={props.cardStyle}
            cardAspect={props.cardAspect}
            showName={props.showName}
            showTalentType={props.showTalentType}
            showLocation={props.showLocation}
            showAvailability={props.showAvailability}
            showBadges={props.showBadges}
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
