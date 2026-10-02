"use client";

/**
 * P3 browse gallery (mockup fg_gallery, fg_gallery_music, fg_tags_open,
 * fg_gallery_tag, fg_search_kbd, fg_search_model, fg_search_empty, fg_multi,
 * fg_multi_combined, fg_search_back, fg_live_explore).
 *
 * Only visibleGalleryDesigns() appear (the finished three unless the
 * extra-designs flag is on). Query, filters, scroll and the
 * last opened card live in sessionStorage so Back restores them.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GALLERY_CATEGORY_CHIPS,
  GALLERY_FEATURE_TAGS,
  GALLERY_PROFESSIONS,
  GALLERY_STYLE_TAGS,
  galleryPreviewLookSlug,
  getGalleryDesign,
  suggestedDesignsForTrade,
  visibleGalleryDesigns,
  type GalleryCategoryChip,
  type GallerySearchResult,
  type GalleryStyleTag,
} from "@/lib/talent-site/theme-catalog/gallery-meta";
import { ThemeGalleryPreviewFrame } from "@/components/talent/site/theme-gallery/ThemeGalleryPreviewFrame";
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

import { AppBadge } from "./GalleryAppsUi";
import { appsOnDesign } from "./gallery-apps";

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
  const [openMenu, setOpenMenu] = useState<"style" | "tags" | null>(null);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const restoredScroll = useRef(false);

  // Restore once on mount (sessionStorage is client only).
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
        // Inside the setup overlay the dialog scrolls, never the window.
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
  const pendingCount = useMemo(
    () => deriveGalleryView({ ...state, tags: pendingTags }).output.themeCount,
    [state, pendingTags],
  );

  const active = isFilterActive(state);
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
    setOpenMenu(null);
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

  const styleLabel = (tag: string) => t(tag);
  const suggestedNames = suggested.map((s) => getGalleryDesign(s)?.name ?? s);

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

  const renderCard = (r: GallerySearchResult) => {
    const d = r.design;
    const matching = searching || Boolean(state.chip);
    const demo = r.featuredDemo;
    const demoName = demo ? demo.name[locale] : null;
    const n = matching ? r.matchingDemos.length : d.demos.length;
    const countLabel = matching
      ? n === 1
        ? t("1 matching demo")
        : t("{n} matching demos", { n })
      : n === 1
        ? t("1 demo")
        : t("{n} demos", { n });
    const isLast = state.lastViewed === d.slug;
    const badge = state.combined && multi && r.combinesBoth ? t("Combines both") : suggested.includes(d.slug) ? t("Suggested") : null;
    const cardApps = appsOnDesign(d);
    const allTags = [...d.styleTags, ...d.featureTags];
    const highlighted = new Set<string>([...state.tags, ...(state.style ? [state.style] : [])]);
    return (
      <article
        key={d.slug}
        data-design-slug={d.slug}
        data-maison-theme-card=""
        data-testid={d.slug === "maison" ? "maison-theme-card" : `design-card-${d.slug}`}
        data-last-viewed={isLast ? "" : undefined}
        className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white ${
          isLast ? "border-admin-ink ring-2 ring-admin-ink" : "border-admin-border-soft"
        }`}
      >
        <div className="relative">
        <button
          type="button"
          onClick={() => explore(r)}
          className="relative block w-full text-left"
          aria-label={`${t("Explore")} ${d.name}`}
        >
          <ThemeGalleryPreviewFrame preview={preview} url={preview.src(d.slug, galleryPreviewLookSlug(d, demo?.defaultPalette), demo && demo.status === "built" && demo.source.kind === "demo-talent" ? `${d.slug}:${demo.key}` : null)} locale={locale} title={d.name} virtualWidth={1280} aspectRatio="4 / 3" />
          {badge ? (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-admin-ink shadow-sm">
              {badge}
            </span>
          ) : null}
          {isLast ? (
            <span className={`absolute right-2.5 ${cardApps.length ? "top-11" : "top-2.5"} rounded-full bg-admin-ink px-2.5 py-1 text-[12px] font-semibold text-white`}>
              {t("Last viewed")}
            </span>
          ) : null}
        </button>
        <AppBadge
          apps={cardApps}
          locale={locale}
          testId={`design-app-badge-${d.slug}`}
          onOpen={() => explore(r, "apps")}
          className="absolute right-2.5 top-2.5"
        />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3.5">
          <h3 className="text-[19px] font-semibold text-admin-ink">
            {d.name}
            {searching && demoName ? <span className="font-medium text-admin-ink-muted"> · {demoName}</span> : null}
          </h3>
          <p className="text-[14px] leading-snug text-admin-ink-muted">{d.description[locale]}</p>
          <div className="flex flex-wrap gap-1.5" aria-label={t("Tags")}>
            {allTags.map((tag) => {
              const on = highlighted.has(tag);
              const isStyle = (GALLERY_STYLE_TAGS as readonly string[]).includes(tag);
              return (
                <span
                  key={tag}
                  data-tag-active={on ? "" : undefined}
                  className={`inline-flex h-[26px] items-center whitespace-nowrap rounded-md px-2 text-[12.5px] ${
                    on
                      ? "bg-admin-ink font-bold text-white"
                      : isStyle
                        ? "border border-admin-border-soft font-medium text-admin-ink"
                        : "bg-admin-surface-alt font-medium text-admin-ink"
                  }`}
                >
                  {styleLabel(tag)}
                </span>
              );
            })}
          </div>
          {demoName ? (
            <p className="mt-0.5 text-[13.5px] text-admin-ink">
              <span className="text-admin-ink-muted">{matching ? t("Matching demo:") : t("Featured demo:")}</span>{" "}
              <b className="font-semibold">{demoName}</b>
            </p>
          ) : null}
          <div className="mt-auto flex items-center gap-2 pt-1">
            <span className="whitespace-nowrap rounded-full bg-admin-surface-alt px-2.5 py-1 text-[12.5px] font-semibold text-admin-ink">
              {countLabel}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => explore(r)}
              data-testid={d.slug === "maison" ? "maison-explore-theme" : `design-explore-${d.slug}`}
              className="min-h-11 text-[14px] font-semibold text-admin-ink underline-offset-2 hover:underline"
            >
              {t("Explore theme →")}
            </button>
          </div>
        </div>
      </article>
    );
  };

  const grid = (list: GallerySearchResult[]) => (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">{list.map(renderCard)}</div>
  );

  const menuButton = (kind: "style" | "tags", label: string, on: boolean) => (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={openMenu === kind}
      onClick={() => {
        setPendingTags(state.tags);
        setOpenMenu(openMenu === kind ? null : kind);
      }}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border bg-white px-3 text-[14px] text-admin-ink sm:min-h-10 ${
        on ? "border-admin-ink font-semibold" : "border-admin-border-soft font-medium"
      }`}
    >
      {label} ▾
    </button>
  );

  const tagRow = (tag: string, count: number) => {
    const on = pendingTags.includes(tag);
    return (
      <button
        key={tag}
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => setPendingTags((p) => (on ? p.filter((x) => x !== tag) : [...p, tag]))}
        className="flex min-h-11 w-full items-center gap-2.5 border-b border-admin-border-soft text-left"
      >
        <span
          className={`inline-grid h-5 w-5 place-items-center rounded-md text-[12px] ${
            on ? "bg-admin-ink text-white" : "border-[1.5px] border-admin-border-soft"
          }`}
          aria-hidden
        >
          {on ? "✓" : ""}
        </span>
        <span className="flex-1 text-[14.5px] text-admin-ink">{t(tag)}</span>
        <span className="text-[13px] text-admin-ink-muted">{count}</span>
      </button>
    );
  };

  const menuPanel = openMenu ? (
    <>
      <button
        type="button"
        aria-label={t("Close")}
        onClick={() => setOpenMenu(null)}
        className="fixed inset-0 z-40 cursor-default bg-admin-ink/20"
      />
      <div
        role="dialog"
        aria-label={openMenu === "style" ? t("Visual style") : t("Tags")}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-auto rounded-t-2xl bg-white px-4 pb-4 pt-3 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:rounded-2xl"
      >
        {openMenu === "style" ? (
          <div className="flex flex-col">
            {[null, ...GALLERY_STYLE_TAGS].map((s) => (
              <button
                key={s ?? "any"}
                type="button"
                role="radio"
                aria-checked={state.style === s}
                onClick={() => {
                  update({ style: s as GalleryStyleTag | null });
                  setOpenMenu(null);
                }}
                className={`flex min-h-11 items-center justify-between border-b border-admin-border-soft text-left text-[14.5px] text-admin-ink ${
                  state.style === s ? "font-semibold" : ""
                }`}
              >
                <span>{s ? t(s) : t("Any")}</span>
                {s ? <span className="text-[13px] text-admin-ink-muted">{counts.styleTags[s]}</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{t("Style")}</div>
            {GALLERY_STYLE_TAGS.filter((x) => counts.styleTags[x] > 0).map((x) => tagRow(x, counts.styleTags[x]))}
            <div className="mb-1 mt-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">
              {t("Layout and features")}
            </div>
            {GALLERY_FEATURE_TAGS.filter((x) => counts.featureTags[x] > 0).map((x) => tagRow(x, counts.featureTags[x]))}
            <button
              type="button"
              onClick={() => {
                update({ tags: pendingTags });
                setOpenMenu(null);
              }}
              className="mt-3 min-h-12 w-full rounded-xl bg-admin-ink text-[15px] font-semibold text-white"
            >
              {pendingCount === 1 ? t("Show 1 theme") : t("Show {n} themes", { n: pendingCount })}
            </button>
          </div>
        )}
      </div>
    </>
  ) : null;

  return (
    <div data-gallery-browse="" className="flex flex-col gap-4">
      {liveAddress ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-admin-border-soft bg-white px-3.5 py-3">
          <span className="min-w-0 flex-1 text-[14px] text-admin-ink">
            {t("Changing the design of {address}. The live site stays as it is until you publish.", { address: liveAddress })}
          </span>
          {onBackToMyWebsite ? (
            <button
              type="button"
              onClick={onBackToMyWebsite}
              className="min-h-11 text-[14px] font-semibold text-admin-ink underline-offset-2 hover:underline"
            >
              {t("Back to My website")}
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

      {/* Search */}
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

      {/* Filters */}
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
                      on ? "bg-admin-ink font-semibold text-white" : "border border-admin-border-soft bg-white font-medium text-admin-ink"
                    }`}
                  >
                    {c ? t(CHIP_LABEL[c]) : t("All")}
                  </button>
                );
              })}
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          {menuButton("style", `${t("Visual style")}: ${state.style ? t(state.style) : t("Any")}`, Boolean(state.style))}
          {menuButton(
            "tags",
            `${t("Tags")}: ${state.tags.length === 0 ? t("Any") : state.tags.length === 1 ? t(state.tags[0]!) : state.tags.length}`,
            state.tags.length > 0,
          )}
          {multi ? (
            <button
              type="button"
              role="switch"
              aria-checked={state.combined}
              onClick={() => update({ combined: !state.combined })}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] border bg-white px-3 text-[14px] font-semibold text-admin-ink sm:min-h-10 ${
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
          {menuPanel}
        </div>
      </div>

      {suggestedNames.length ? (
        <p className="text-[13.5px] text-admin-ink-muted">
          {suggestedNames.length >= 2
            ? t("Suggested from your profile: {a} and {b}. Every theme stays open to you.", {
                a: suggestedNames[0]!,
                b: suggestedNames[1]!,
              })
            : t("Suggested from your profile: {a}. Every theme stays open to you.", { a: suggestedNames[0]! })}
        </p>
      ) : null}

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
