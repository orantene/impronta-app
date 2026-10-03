"use client";

/**
 * Wave 3: one "Filters" sheet for style + layout tags (replaces two filter menus).
 */
import {
  GALLERY_FEATURE_TAGS,
  GALLERY_STYLE_TAGS,
  type GalleryStyleTag,
} from "@/lib/talent-site/theme-catalog/gallery-meta";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";
import type { GalleryBrowseState } from "./gallery-browse-state";
import { deriveGalleryView } from "./gallery-browse-state";

type Counts = {
  styleTags: Record<string, number>;
  featureTags: Record<string, number>;
};

export function GalleryFiltersSheet({
  locale,
  state,
  counts,
  pendingTags,
  pendingStyle,
  onPendingTags,
  onPendingStyle,
  onApply,
  onClose,
  t,
}: {
  locale: MaisonSetupLocale;
  state: GalleryBrowseState;
  counts: Counts;
  pendingTags: string[];
  pendingStyle: GalleryStyleTag | null;
  onPendingTags: (tags: string[]) => void;
  onPendingStyle: (style: GalleryStyleTag | null) => void;
  onApply: () => void;
  onClose: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const pendingCount = deriveGalleryView({
    ...state,
    tags: pendingTags,
    style: pendingStyle,
  }).output.themeCount;

  const tagRow = (tag: string, count: number) => {
    const on = pendingTags.includes(tag);
    return (
      <button
        key={tag}
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => onPendingTags(on ? pendingTags.filter((x) => x !== tag) : [...pendingTags, tag])}
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

  return (
    <>
      <button
        type="button"
        aria-label={maisonSetupT(locale, "Close")}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-admin-ink/20"
      />
      <div
        role="dialog"
        aria-label={maisonSetupT(locale, "Filters")}
        data-testid="gallery-filters-sheet"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-auto rounded-t-2xl bg-white px-4 pb-4 pt-3 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:rounded-2xl"
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-admin-ink">{maisonSetupT(locale, "Filters")}</h3>
          <button
            type="button"
            aria-label={maisonSetupT(locale, "Close")}
            onClick={onClose}
            className="grid h-11 w-11 place-items-center text-[18px] text-admin-ink"
          >
            ✕
          </button>
        </div>

        <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">
          {t("Visual style")}
        </div>
        {[null, ...GALLERY_STYLE_TAGS].map((s) => (
          <button
            key={s ?? "any"}
            type="button"
            role="radio"
            aria-checked={pendingStyle === s}
            onClick={() => onPendingStyle(s as GalleryStyleTag | null)}
            className={`flex min-h-11 w-full items-center justify-between border-b border-admin-border-soft text-left text-[14.5px] text-admin-ink ${
              pendingStyle === s ? "font-semibold" : ""
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span
                className={`inline-grid h-5 w-5 place-items-center rounded-full border ${
                  pendingStyle === s ? "border-admin-ink bg-admin-ink text-[10px] text-white" : "border-admin-border-soft"
                }`}
                aria-hidden
              >
                {pendingStyle === s ? "✓" : ""}
              </span>
              {s ? t(s) : t("Any")}
            </span>
            {s ? <span className="text-[13px] text-admin-ink-muted">{counts.styleTags[s]}</span> : null}
          </button>
        ))}

        <div className="mb-1 mt-3 text-[12px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">
          {t("Layout and features")}
        </div>
        {GALLERY_FEATURE_TAGS.filter((x) => counts.featureTags[x] > 0).map((x) =>
          tagRow(x, counts.featureTags[x]),
        )}

        <button
          type="button"
          onClick={onApply}
          className="mt-3 min-h-12 w-full rounded-xl bg-admin-ink text-[15px] font-semibold text-white"
        >
          {pendingCount === 1 ? t("Show 1 theme") : t("Show {n} themes", { n: pendingCount })}
        </button>
      </div>
    </>
  );
}
