"use client";

/**
 * Wave 2: design tags on the Theme detail rail. Localized EN/ES and wired as
 * real gallery filters (tap → browse with that tag selected).
 */
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";
import {
  DEFAULT_GALLERY_BROWSE_STATE,
  GALLERY_BROWSE_STORAGE_KEY,
  loadGalleryBrowseState,
  saveGalleryBrowseState,
} from "./gallery-browse-state";
import { GALLERY_STYLE_TAGS, type GalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";

const isStyle = (t: string) => (GALLERY_STYLE_TAGS as readonly string[]).includes(t);

export function GalleryDesignTags({
  design,
  locale,
  onFilter,
}: {
  design: GalleryDesign;
  locale: MaisonSetupLocale;
  /** After writing browse state; typically navigate back to the gallery. */
  onFilter: () => void;
}) {
  const applyTag = (tag: string) => {
    const current = typeof window === "undefined" ? { ...DEFAULT_GALLERY_BROWSE_STATE } : loadGalleryBrowseState();
    const next = {
      ...current,
      query: "",
      chip: null,
      style: isStyle(tag) ? (tag as (typeof GALLERY_STYLE_TAGS)[number]) : null,
      tags: isStyle(tag) ? [] : [tag],
      combined: false,
      scrollY: 0,
    };
    saveGalleryBrowseState(next);
    // Belt-and-suspenders for tests / environments without sessionStorage hooks.
    try {
      window.sessionStorage?.setItem(GALLERY_BROWSE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    onFilter();
  };

  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-maison-tags="">
      {design.styleTags.map((tag) => (
        <button
          key={`s-${tag}`}
          type="button"
          data-maison-tag-kind="style"
          data-testid={`gallery-tag-${tag}`}
          onClick={() => applyTag(tag)}
          className="rounded-full border border-admin-border-soft px-2 py-0.5 text-[11.5px] text-admin-ink transition hover:border-admin-ink"
        >
          {maisonSetupT(locale, tag)}
        </button>
      ))}
      {design.featureTags.map((tag) => (
        <button
          key={`f-${tag}`}
          type="button"
          data-maison-tag-kind="layout"
          data-testid={`gallery-tag-${tag}`}
          onClick={() => applyTag(tag)}
          className="rounded-full bg-admin-surface-alt px-2 py-0.5 text-[11.5px] text-admin-ink transition hover:bg-admin-border-soft"
        >
          {maisonSetupT(locale, tag)}
        </button>
      ))}
    </div>
  );
}
