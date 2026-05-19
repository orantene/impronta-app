import { Suspense, type CSSProperties } from "react";

import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { createTranslator, getMessageStringArray } from "@/i18n/messages";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { HeroSearch, type HeroSearchCopy } from "@/components/home/hero-search";

import type { SectionComponentProps } from "../types";
import type { DirectoryV1 } from "./schema";
import { loadDirectorySectionTalents } from "./fetch";
import { DirectoryCard } from "./DirectoryCard";
import { DirectoryCardActions } from "./DirectoryCardActions";

/**
 * Public render — the canonical Atelier shell.
 *
 * Editorial gallery: premium heading, the REAL AI search (HeroSearch,
 * the same component the team already shipped — interpret + URL sync),
 * and a Portrait/Editorial grid fed by the Discover path (CDP-0 Path A),
 * cool-not-warm. Filter sidebar / save-state / infinite scroll =
 * Phase 2b (needs the section↔searchParams reactivity seam). Trust badge
 * deferred (Amendment A2).
 */
export async function DirectoryComponent({
  props,
  locale,
  publicPathPrefix,
}: SectionComponentProps<DirectoryV1>) {
  const loc: Locale = isLocale(locale) ? locale : defaultLocale;
  const prefix = publicPathPrefix ?? "";

  const [{ items, total }, aiFlags] = await Promise.all([
    loadDirectorySectionTalents(props, { locale: loc, publicPathPrefix: prefix }),
    getAiFeatureFlags(),
  ]);

  const t = createTranslator(loc);
  const ui = buildDirectoryUiCopy(t);
  const aiEnabled = aiFlags.ai_master_enabled && aiFlags.ai_search_enabled;
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

  const gridStyle = {
    "--dir-cols-m": props.columnsMobile,
    "--dir-cols-t": props.columnsTablet,
    "--dir-cols-d": props.columnsDesktop,
  } as unknown as CSSProperties;

  const gap =
    props.density === "compact" ? "gap-x-4 gap-y-6" : "gap-x-5 gap-y-9";

  const showCard = {
    showName: props.showName,
    showTalentType: props.showTalentType,
    showLocation: props.showLocation,
    showAvailability: props.showAvailability,
    showBadges: props.showBadges,
  };

  return (
    <section
      data-section="directory"
      data-template={props.template}
      data-card-style={props.cardStyle}
      className={
        props.background === "cool_ground"
          ? "w-full bg-[var(--impronta-surface)]/25 px-4 py-12 sm:px-6 sm:py-16"
          : props.background === "subtle"
            ? "w-full bg-foreground/[0.015] px-4 py-12 sm:px-6 sm:py-16"
            : "w-full px-4 py-12 sm:px-6 sm:py-16"
      }
    >
      <div className={boxed ? "mx-auto w-full max-w-7xl" : "w-full"}>
        {props.showHeading &&
        (props.eyebrow || props.headline || props.copy) ? (
          <header
            className={`mb-9 flex max-w-2xl flex-col gap-3 ${headAlign}`}
          >
            {props.eyebrow ? (
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--impronta-muted)]">
                {props.eyebrow}
              </span>
            ) : null}
            {props.headline ? (
              <h2 className="font-display text-3xl font-medium tracking-wide text-foreground sm:text-4xl">
                {props.headline}
              </h2>
            ) : null}
            {props.copy ? (
              <p className="text-[15px] leading-relaxed text-[var(--impronta-muted)]">
                {props.copy}
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

        {items.length === 0 ? (
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
          <>
            {props.showResultCount ? (
              <p className="mb-5 text-xs uppercase tracking-[0.16em] text-[var(--impronta-muted)]">
                {total}{" "}
                {props.entityLabel === "talent"
                  ? total === 1
                    ? "talent"
                    : "talent"
                  : props.entityLabel}
              </p>
            ) : null}
            <div
              className={`grid ${gap} [grid-template-columns:repeat(var(--dir-cols-m),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--dir-cols-t),minmax(0,1fr))] lg:[grid-template-columns:repeat(var(--dir-cols-d),minmax(0,1fr))]`}
              style={gridStyle}
            >
              {items.map((data, i) => (
                <div key={data.id} className="relative">
                  <DirectoryCard
                    data={data}
                    style={
                      props.cardStyle === "editorial" ? "editorial" : "portrait"
                    }
                    show={showCard}
                    nameFallback={props.nameFallback}
                    aspect={props.cardAspect}
                    index={i}
                    priority={i < props.columnsDesktop}
                  />
                  {props.showSave || props.showAddToInquiry ? (
                    <div className="absolute right-2.5 top-2.5 z-10">
                      <DirectoryCardActions
                        talentId={data.id}
                        showSave={props.showSave}
                        inquiry={
                          props.showAddToInquiry && data.profileCode
                            ? ui.inquiry
                            : undefined
                        }
                        talent={
                          props.showAddToInquiry && data.profileCode
                            ? {
                                id: data.id,
                                profileCode: data.profileCode,
                                displayName: data.name,
                              }
                            : undefined
                        }
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
