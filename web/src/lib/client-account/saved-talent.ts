/**
 * TUL-1317 slice 1: the client's saved talent for `/account` ("Saved"). Pure shaping.
 * One list per client (`client_favorites`, global, shown in full); a talent is listed only
 * while it passes the same public-directory predicate the directory uses, so a hidden or
 * removed profile never shows up. No ids or tenant data reach the page.
 */
import { CATALOG_PROFILE_COLUMNS, isPublicCatalogProfile, type CatalogProfileRow } from "@/lib/offerings/business-catalog";

export { CATALOG_PROFILE_COLUMNS };

export type SavedTalentRow = {
  added_at: string;
  talent_profile_id: string;
  talent_profiles: (CatalogProfileRow & { display_name: string | null; profile_code: string | null; home_city_text: string | null }) | null;
};

export type SavedTalent = { displayName: string; city: string | null; href: string };

/**
 * `rosterIds`: on an agency or business site only talents on THAT tenant's roster are shown (never
 * promote another tenant's talent on a tenant's site). null = the hub, which shows all.
 */
export function shapeSavedTalent(rows: readonly SavedTalentRow[], appUrl: string, rosterIds: ReadonlySet<string> | null = null): SavedTalent[] {
  const base = appUrl.replace(/\/$/, "");
  return [...rows]
    .sort((a, b) => b.added_at.localeCompare(a.added_at))
    .flatMap((r) => {
      if (rosterIds && !rosterIds.has(r.talent_profile_id)) return [];
      const p = r.talent_profiles;
      if (!p || !isPublicCatalogProfile(p)) return [];
      const code = p.profile_code?.trim();
      if (!code) return [];
      return [{
        displayName: p.display_name?.trim() || code,
        city: p.home_city_text?.trim() || null,
        href: `${base}/t/${encodeURIComponent(code)}`,
      }];
    });
}
