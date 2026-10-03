"use client";

/**
 * P3 browse gallery + Wave 3 redesign: full-height preview cards, one filter
 * row (trade chips + Filters sheet), suggested ribbon. Tag soup removed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GALLERY_CATEGORY_CHIPS,
  GALLERY_PROFESSIONS,
  suggestedDesignsForTrade,
  visibleGalleryDesigns,
  type GalleryCategoryChip,
  type GallerySearchResult,
  type GalleryStyleTag,
} from "@/lib/talent-site/theme-catalog/gallery-meta";
import { useThemePreview } from "@/components/talent/site/theme-gallery/useThemePreview";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";
import {
  DEFAULT_GALLERY_BROWSE_STATE,
  deriveGalleryView,
  fill,
  galleryTagCounts,
  gallerySearchSuggestions,
  isFilterActive,
  loadGalleryBrowseState,
  removeQueryTerm,
  resetFilters,
  saveGalleryBrowseState,
  type GalleryBrowseState,
} from "./gallery-browse-state";
import { GalleryDesignCard } from "./GalleryDesignCard";
import { GalleryFiltersSheet } from "./GalleryFiltersSheet";

export type GalleryExploreOptions = { demoKey?: string; fromQuery?: string; tab?: "apps" };

type Props = {
  locale: MaisonSetupLocale;
  talentProfileId: string;
  onExplore: (designSlug: string, opts?: GalleryExploreOptions) => void;
  /** Talent's primary trade label, for "Suggested from your profile". */
  primaryTypeLabel?: string | null;
  /** Set when opened from a live site (Change design). */
  liveAddress?: string;
  onBackToMyWebsite?: () => void;
};

const CHIP_LABEL: Record<GalleryCategoryChip, string> = {
  beauty: "Beauty",
  models: "Models",
  music: "Music",
  food: "Food",
  fitness: "Fitness",
  wellness: "Wellness",
  creative: "Creative",
  events: "Events",
  home_local: "Home & local",
  tech: "Tech",
};

const PILL =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] sm:min-h-10";

export function GalleryBrowseScreen({
  locale,
  talentProfileId,
  onExplore,
  primaryTypeLabel,
  liveAddress,
  onBackToMyWebsite,
}: Props) {
  const t = (k: string, vars?: Record<string, string | number>) =>
    vars ? fill(maisonSetupT(locale, k), vars) : maisonSetupT(locale, k);
  const preview = useThemePreview({ talentProfileId, locale });
  const [state, setState] = useState<GalleryBrowseState>(DEFAULT_GALLERY_BROWSE_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [pendingStyle, setPendingStyle] = useState<GalleryStyleTag | null>(null);
  const restoredScroll = useRef(false);

  useEffect(() => {
    const saved = loadGalleryBrowseState();
    setState(saved);
    setDraft(saved.query);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveGalleryBrowseState(state);
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated || restoredScroll.current) return;
    restoredScroll.current = true;
    if (state.scrollY > 0 && typeof window !== "undefined") {
      const y = state.scrollY;
      window.requestAnimationFrame(() => {
        const box = document.querySelector<HTMLElement>("[data-maison-setup-overlay]");
        if (box) box.scrollTop = y;
        else window.scrollTo(0, y);
      });
    }
  }, [hydrated, state.scrollY]);

  const view = useMemo(() => deriveGalleryView(state), [state]);
  const counts = useMemo(() => galleryTagCounts(view.countsBase), [view.countsBase]);
  const suggested = useMemo(() => suggestedDesignsForTrade(primaryTypeLabel), [primaryTypeLabel]);
  const typeahead = useMemo(
    () => (searchFocused && draft !== state.query ? gallerySearchSuggestions(draft, locale) : []),
    [searchFocused, draft, state.query, locale],
  );

  const active = isFilterActive(state);
  const filtersOn = Boolean(state.style) || state.tags.length > 0;
  const searching = view.terms.length > 0;
  const multi = view.terms.length >= 2;
  const { output } = view;

  const update = (patch: Partial<GalleryBrowseState>) => setState((s) => ({ ...s, ...patch }));
  const applyQuery = (q: string) => {
    setDraft(q);
    update({ query: q });
    setSearchFocused(false);
  };
  const reset = () => {
    setDraft("");
    setFiltersOpen(false);
    setState((s) => resetFilters(s));
  };
  const explore = (r: GallerySearchResult, tab?: "apps") => {
    const scrollY =
      typeof window !== "undefined"
        ? (document.querySelector<HTMLElement>("[data-maison-setup-overlay]")?.scrollTop ?? window.scrollY)
        : 0;
    const next = { ...state, lastViewed: r.design.slug, scrollY };
    setState(next);
    saveGalleryBrowseState(next);
    const demoKey = searching || state.chip ? r.featuredDemo?.key : undefined;
    onExplore(r.design.slug, {
      ...(demoKey ? { demoKey } : {}),
      ...(state.query.trim() ? { fromQuery: state.query.trim() } : {}),
      ...(tab ? { tab } : {}),
    });
  };

  const resultLine = (() => {
    if (!active || output.themeCount === 0) return null;
    const n = output.demoCount;
    const m = output.themeCount;
    if (searching) {
      const head =
        m === 1 ? (n === 1 ? t("1 demo in 1 theme") : t("{n} demos in 1 theme", { n })) : t("{n} demos in {m} themes", { n, m });
      const quoted = view.terms.map((q) => `“${q}”`).join(t(" or "));
      return (
        <>
          <b className="font-semibold text-admin-ink">{head}</b> {t("for")} {quoted}
          {multi && !state.combined ? t(" · matching either") : ""}
        </>
      );
    }
    return <b className="font-semibold text-admin-ink">{m === 1 ? t("1 theme · {n} demos", { n }) : t("{m} themes · {n} demos", { m, n })}</b>;
  })();

  const renderCard = (r: GallerySearchResult) => (
    <GalleryDesignCard
      key={r.design.slug}
      result={r}
      locale={locale}
      preview={preview}
      suggested={suggested.includes(r.design.slug)}
      lastViewed={state.lastViewed === r.design.slug}
      matching={searching || Boolean(state.chip)}
      onExplore={() => explore(r)}
      onOpenApps={() => explore(r, "apps")}
    />
  );

  const grid = (list: GallerySearchResult[]) => (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">{list.map(renderCard)}</div>
  );

  return (
    <div data-gallery-browse="" data-gallery-wave3="" className="flex flex-col gap-4">
      {liveAddress ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-admin-border-soft bg-white px-3.5 py-3">
          <span className="min-w-0 flex-1 text-[14px] text-admin-ink">
            {t("Changing the design of {address}. The live site stays as it is until you publish.", { address: liveAddress })}
          </span>
          {onBackToMyWebsite ? (
            <button
              type="button"
              onClick={onBackToMyWebsite}
              className="grid h-11 w-11 place-items-center text-[18px] text-admin-ink"
              aria-label={t("Back to My website")}
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : null}

      <div>
        <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-admin-ink md:text-[30px]">
          {t("Find your website style")}
        </h2>
        <p className="mt-1 text-[14.5px] text-admin-ink-muted md:text-[16px]">
          {t("Explore designs, then see them with your photos and services.")}
        </p>
      </div>

      <form
        role="search"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          applyQuery(draft);
        }}
      >
        <div className="flex h-12 items-center gap-2.5 rounded-xl border border-admin-border-soft bg-white px-3.5 focus-within:border-admin-ink">
          <span className="text-admin-ink-dim" aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
            placeholder={t("Search a profession or theme")}
            aria-label={t("Search a profession or theme")}
            enterKeyHint="search"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-admin-ink outline-none placeholder:text-admin-ink-dim"
          />
          {draft ? (
            <button
              type="button"
              aria-label={t("Clear search")}
              onClick={() => applyQuery("")}
              className="grid h-11 w-11 shrink-0 place-items-center text-admin-ink-muted"
            >
              ✕
            </button>
          ) : null}
        </div>
        {typeahead.length ? (
          <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-admin-border-soft bg-white shadow-lg">
            {typeahead.map((s, i) => (
              <li key={`${s.kind}-${s.label}-${i}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyQuery(multi ? `${view.terms.slice(0, -1).join(", ")}, ${s.query}` : s.query)}
                  className="flex min-h-[52px] w-full items-center gap-3 border-b border-admin-border-soft px-3.5 text-left last:border-b-0"
                >
                  <span className="text-admin-ink-dim" aria-hidden>
                    ⌕
                  </span>
                  <span className="flex-1">
                    <span className="block text-[15.5px] font-semibold text-admin-ink">
                      {s.kind === "synonym" ? t(locale === "es" ? "{x} (English)" : "{x} (Spanish)", { x: s.label }) : s.label}
                    </span>
                    <span className="text-[13px] text-admin-ink-muted">
                      {s.kind === "synonym"
                        ? t("same results as {x}", { x: s.sameAs ?? "" })
                        : s.themes === 1
                          ? t("{n} demos · 1 theme", { n: s.demos })
                          : t("{n} demos · {m} themes", { n: s.demos, m: s.themes })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {/* Wave 3: one filter row — trade chips + Filters */}
      <div className="relative flex flex-col gap-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {multi
            ? view.terms.map((term, i) => (
                <span key={`${term}-${i}`} className={`${PILL} bg-admin-ink pr-1 font-semibold text-white`}>
                  {term}
                  <button
                    type="button"
                    aria-label={t("Remove {x}", { x: term })}
                    onClick={() => applyQuery(removeQueryTerm(state.query, i))}
                    className="grid h-9 w-9 place-items-center"
                  >
                    ✕
                  </button>
                </span>
              ))
            : [null, ...GALLERY_CATEGORY_CHIPS].map((c) => {
                const on = state.chip === c;
                return (
                  <button
                    key={c ?? "all"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => update({ chip: c })}
                    className={`${PILL} ${
                      on
                        ? "bg-admin-ink font-semibold text-white"
                        : "border border-admin-border-soft bg-white font-medium text-admin-ink"
                    }`}
                  >
                    {c ? t(CHIP_LABEL[c]) : t("All")}
                  </button>
                );
              })}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            data-testid="gallery-filters-button"
            onClick={() => {
              setPendingTags(state.tags);
              setPendingStyle(state.style);
              setFiltersOpen((o) => !o);
            }}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] sm:min-h-10 ${
              filtersOn ? "border-admin-ink font-semibold text-admin-ink" : "border-admin-border-soft bg-white font-medium text-admin-ink"
            }`}
          >
            {t("Filters")}
            {filtersOn ? (
              <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-admin-ink px-1 text-[11px] text-white">
                {(state.style ? 1 : 0) + state.tags.length}
              </span>
            ) : null}
          </button>
          {multi ? (
            <button
              type="button"
              role="switch"
              aria-checked={state.combined}
              onClick={() => update({ combined: !state.combined })}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border bg-white px-3 text-[14px] font-semibold text-admin-ink sm:min-h-10 ${
                state.combined ? "border-admin-ink" : "border-admin-border-soft"
              }`}
            >
              <span className={`relative h-[18px] w-[30px] rounded-full ${state.combined ? "bg-admin-ink" : "bg-admin-border-soft"}`}>
                <span
                  className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white ${state.combined ? "right-0.5" : "left-0.5"}`}
                />
              </span>
              {t("Combined talents")}
            </button>
          ) : null}
          {active ? (
            <button
              type="button"
              onClick={reset}
              className="min-h-11 px-1 text-[14px] font-semibold text-admin-ink underline-offset-2 hover:underline"
            >
              {t("Reset filters")}
            </button>
          ) : null}
        </div>
        {filtersOpen ? (
          <GalleryFiltersSheet
            locale={locale}
            state={state}
            counts={counts}
            pendingTags={pendingTags}
            pendingStyle={pendingStyle}
            onPendingTags={setPendingTags}
            onPendingStyle={setPendingStyle}
            onApply={() => {
              update({ tags: pendingTags, style: pendingStyle });
              setFiltersOpen(false);
            }}
            onClose={() => setFiltersOpen(false)}
            t={t}
          />
        ) : null}
      </div>

      {resultLine ? <p className="text-[14px] text-admin-ink-muted">{resultLine}</p> : null}

      {output.themeCount === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-admin-border-soft bg-white px-5 py-8 text-center sm:p-10">
          <h3 className="text-[20px] font-semibold text-admin-ink">
            {searching
              ? t("No demos for “{q}” with these filters", { q: state.query.trim() })
              : t("No themes with these filters")}
          </h3>
          <p className="max-w-[46ch] text-[14.5px] text-admin-ink-muted">
            {t("Every theme works for any profession. Try a nearby word, or reset the filters to see all {n} themes.", {
              n: visibleGalleryDesigns().length,
            })}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {output.suggestionsWhenEmpty.map((s) => (
              <button
                key={s.label.en}
                type="button"
                onClick={() => {
                  setState((prev) => ({ ...resetFilters(prev) }));
                  applyQuery(GALLERY_PROFESSIONS[s.profession].label[locale]);
                }}
                className={`${PILL} border border-admin-border-soft bg-white font-medium text-admin-ink`}
              >
                {s.label[locale]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-1 min-h-12 rounded-xl bg-admin-ink px-5 text-[15px] font-semibold text-white"
          >
            {t("Reset filters")}
          </button>
        </div>
      ) : (
        <>
          {grid(view.top)}
          {view.rest.length ? (
            <>
              <h3 className="mt-1.5 text-[16px] font-semibold text-admin-ink">{t("Also matches one of them")}</h3>
              {grid(view.rest)}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
