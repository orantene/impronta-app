import { pickHeadshotUrl } from "@/lib/talent-site/media-pick";
import { logServerError } from "@/lib/server/safe-error";
import type { ShareColors } from "./visual-model";

/** Hex-only: a token that is a var() or a named colour is not usable in Satori. */
const HEX = /^#[0-9a-f]{6}$/i;

export type ShareTheme = { colors: Partial<ShareColors>; photoUrl: string | null };

export const EMPTY_SHARE_THEME: ShareTheme = { colors: {}, photoUrl: null };

/** Only our own storage host may be fetched server side by the image renderer. */
export function allowedStoragePhoto(raw: string | null | undefined, storageUrl: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const storage = new URL(storageUrl ?? "https://invalid.invalid");
    return u.protocol === "https:" && u.hostname === storage.hostname ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Site tokens (`talent_sites.design_tokens`) -> share colours. Unusable values are dropped. */
export function colorsFromSiteTokens(tokens: unknown): Partial<ShareColors> {
  if (!tokens || typeof tokens !== "object") return {};
  const t = tokens as Record<string, unknown>;
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = t[k];
      if (typeof v === "string" && HEX.test(v)) return v.toLowerCase();
    }
    return undefined;
  };
  const out: Partial<ShareColors> = {};
  const bg = pick("color.background");
  const ink = pick("color.ink");
  const accent = pick("color.accent", "color.primary");
  if (bg) out.bg = bg;
  if (ink) out.ink = ink;
  if (accent) out.accent = accent;
  return out;
}

type Res<T> = PromiseLike<{ data: T | null; error: unknown }>;
type Chain<T> = {
  eq(col: string, v: string): Chain<T>;
  is(col: string, v: null): Chain<T>;
  in(col: string, v: string[]): Chain<T>;
  order(col: string, o: { ascending: boolean }): Chain<T>;
  limit(n: number): Res<T[]>;
  maybeSingle(): Res<T>;
};

/** The slice of the Supabase client this module needs (typed, so tests can fake it). */
export type ShareThemeClient = {
  from(table: "talent_sites"): { select(cols: string): Chain<{ design_tokens: unknown }> };
  from(table: "media_assets"): { select(cols: string): Chain<{ storage_path: string; variant_kind: string; sort_order: number | null }> };
  storage: { from(bucket: string): { getPublicUrl(path: string): { data: { publicUrl: string } } } };
};

/**
 * The talent's published-site look and profile photo, read-only. A talent with
 * no published site (or any read error) yields the empty theme, so the caller
 * keeps its defaults.
 */
export async function loadShareTheme(
  client: ShareThemeClient,
  profileId: string,
  storageUrl: string | undefined,
): Promise<ShareTheme> {
  const { data: site, error: siteErr } = await client
    .from("talent_sites").select("design_tokens")
    .eq("talent_profile_id", profileId).eq("status", "published").maybeSingle();
  if (siteErr) logServerError("promos.share/theme-site", siteErr);
  const colors = site ? colorsFromSiteTokens(site.design_tokens) : {};

  // A photo only makes sense with a published site (it is the site's own imagery).
  let photoUrl: string | null = null;
  if (site) {
    const { data: rows, error: mediaErr } = await client
      .from("media_assets").select("storage_path, variant_kind, sort_order")
      .eq("owner_talent_profile_id", profileId)
      .in("variant_kind", ["public_watermarked", "gallery", "card", "hero"])
      .eq("approval_state", "approved").is("deleted_at", null)
      .order("sort_order", { ascending: true }).limit(12);
    if (mediaErr) logServerError("promos.share/theme-media", mediaErr);
    const picked = pickHeadshotUrl(
      (rows ?? []).map((r) => ({
        url: client.storage.from("media-public").getPublicUrl(r.storage_path).data.publicUrl,
        variantKind: r.variant_kind,
        sortOrder: r.sort_order,
      })),
    );
    photoUrl = allowedStoragePhoto(picked, storageUrl);
  }
  return { colors, photoUrl };
}
