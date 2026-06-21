/**
 * admin-site-pages-picker.ts — PURE shapes + mapping for the editor's All Pages
 * picker. Split out of the `"use server"` `admin-site-pages.ts` so the type
 * exports and the row→item mapper live in a normal module (a `"use server"`
 * file should only export async actions) and so the mapping is unit-testable.
 */

export type PagePickerItem = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  /** Locale of this row. The homepage exists per-locale (en/es) under the same
   *  empty slug, so the picker MUST surface locale or the rows read as dupes. */
  locale: string;
  /** 'homepage' | 'directory' | 'site_shell' | null. Drives the role badge and
   *  lets the picker hide the site shell (the frame is edited from the header). */
  systemTemplateKey: string | null;
};

export type PagePickerAvailability = {
  canCreatePages: boolean;
  createPageHint: string | null;
};

/** Raw `cms_pages` row the picker query selects. */
export type PickerPageRow = {
  id: string;
  title: string;
  slug: string;
  status: PagePickerItem["status"];
  locale: string;
  system_template_key: string | null;
};

/**
 * Map raw rows → picker items, dropping the site shell. The shell is the shared
 * header/footer FRAME (edited from the header), not a page, so it must never
 * appear in the All Pages list. Homepage + directory stay — they are real pages
 * that carry a role. Filtering in JS avoids the null-vs-value PostgREST `.neq`
 * gotcha that would otherwise drop normal (system_template_key IS NULL) pages.
 */
export function toPickerItems(rows: ReadonlyArray<PickerPageRow>): PagePickerItem[] {
  return rows
    .filter((p) => p.system_template_key !== "site_shell")
    .map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      locale: p.locale,
      systemTemplateKey: p.system_template_key ?? null,
    }));
}
