import "server-only";

/**
 * asset-usage.server.ts — where a workspace's media is IN USE (TUL-1637 and its follow-up).
 *
 * Deleting a library asset is a soft delete (`deleted_at`), so nothing cascades: a photo that a
 * page, a post, a service, an event or a talent profile still points at would silently turn into
 * a broken image. This answers the question for a set of asset ids, and fails CLOSED: if a lookup
 * errors, or a scan is cut short, the delete is refused as "could not check", never waved through
 * as unused.
 *
 * Rows that name an asset by id are matched by id in SQL (ids are uuids, so no tenant filter is
 * needed to prove "in use"). Page sections and posts keep images inside JSON, so those are paged
 * through, a page at a time, and matched by id or storage path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { listProtectedBrandAssetIds } from "@/lib/site-admin/server/brand-library";

/** Rows read per round trip when scanning JSON content. */
export const ASSET_USAGE_PAGE_SIZE = 1000;
/** Pages scanned per table before giving up: 25,000 rows. Beyond it the answer is incomplete, so we refuse. */
export const ASSET_USAGE_MAX_PAGES = 25;

export type AssetUsageKind = "brand" | "pages" | "posts" | "services" | "events" | "talent";
const KINDS: readonly AssetUsageKind[] = ["brand", "pages", "posts", "services", "events", "talent"];

export type AssetUsage = Record<AssetUsageKind, string[]> & {
  /** Lookups that failed or were cut short: treated as in use. */
  unchecked: boolean;
};

/** A named place that uses an image: a site page, a service or a product. */
export type AssetUsagePlace = {
  assetId: string;
  kind: "page" | "service" | "product";
  id: string;
  /** Display name; empty when the row has none (the UI shows a localized fallback). */
  name: string;
  /** Admin link target, relative to the workspace host. */
  href: string;
};

export type AssetUsageResult = AssetUsage & {
  /** Every id that must not be deleted, for any reason above. */
  blocked: string[];
  /** Pages, services and products that use the images, by name. */
  places: AssetUsagePlace[];
};

/** Kinds the owner may knowingly delete anyway. Brand, posts, events and talent never are. */
const OVERRIDABLE: readonly AssetUsageKind[] = ["pages", "services"];

type Ref = { assetId: string; kind: "page" | "service"; id: string };

type TargetRow = {
  id: string;
  storage_path: string | null;
  public_url?: string | null;
  owner_talent_profile_id?: string | null;
  variant_kind?: string | null;
};

type Found = { ids: Set<string>; complete: boolean; refs: Ref[] };
type DbError = { code?: string; message?: string } | null;

/** A table or column the database does not have yet means "nothing there references it". */
function isMissingRelation(error: DbError): boolean {
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST205";
}

const empty = (complete = true): Found => ({ ids: new Set(), complete, refs: [] });

/** Rows of `table` whose `column` holds one of the asset ids. */
async function byIdColumn(admin: SupabaseClient, table: string, column: string, ids: string[]): Promise<Found> {
  const res = await admin.from(table).select(column).in(column, ids);
  if (res.error) {
    if (isMissingRelation(res.error)) return empty();
    logServerError(`media.assetUsage.${table}`, res.error);
    return empty(false);
  }
  const out = empty();
  for (const row of (res.data ?? []) as unknown as Record<string, string | null>[]) {
    const v = row[column];
    if (v) out.ids.add(v);
  }
  return out;
}

/**
 * Page through one tenant table that keeps images inside JSON, matching each target by id or
 * storage path as it goes. Complete only when the last page came back short.
 */
async function scanJson(
  admin: SupabaseClient,
  table: string,
  columns: string,
  tenantId: string,
  targets: TargetRow[],
  opts: { skipArchived?: boolean; pageRef?: boolean } = {},
): Promise<Found> {
  const out = empty();
  for (let page = 0; page < ASSET_USAGE_MAX_PAGES; page++) {
    const from = page * ASSET_USAGE_PAGE_SIZE;
    let q = admin.from(table).select(`id, ${columns}`).eq("tenant_id", tenantId);
    if (opts.skipArchived) q = q.neq("status", "archived");
    const res = await q.order("id").range(from, from + ASSET_USAGE_PAGE_SIZE - 1);
    if (res.error) {
      if (isMissingRelation(res.error)) return empty();
      logServerError(`media.assetUsage.${table}`, res.error);
      return empty(false);
    }
    const rows = (res.data ?? []) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      const hay = JSON.stringify(row);
      for (const t of targets) {
        if (hay.includes(t.id) || (t.storage_path ? hay.includes(t.storage_path) : false)) {
          out.ids.add(t.id);
          const pageId = opts.pageRef ? (row as { page_id?: unknown }).page_id : null;
          if (typeof pageId === "string") out.refs.push({ assetId: t.id, kind: "page", id: pageId });
        }
      }
    }
    if (rows.length < ASSET_USAGE_PAGE_SIZE) return out;
  }
  return empty(false);
}

/** Pages whose share image is one of the assets. */
async function pageShareUsage(admin: SupabaseClient, tenantId: string, ids: string[]): Promise<Found> {
  const res = await admin.from("cms_pages").select("id, og_image_media_asset_id").eq("tenant_id", tenantId).in("og_image_media_asset_id", ids);
  if (res.error) {
    if (isMissingRelation(res.error)) return empty();
    logServerError("media.assetUsage.cms_pages", res.error);
    return empty(false);
  }
  const out = empty();
  for (const r of (res.data ?? []) as unknown as { id: string; og_image_media_asset_id: string | null }[]) {
    if (!r.og_image_media_asset_id) continue;
    out.ids.add(r.og_image_media_asset_id);
    out.refs.push({ assetId: r.og_image_media_asset_id, kind: "page", id: r.id });
  }
  return out;
}

async function merge(...parts: Promise<Found>[]): Promise<Found> {
  const out = empty();
  for (const p of await Promise.all(parts)) {
    p.ids.forEach((id) => out.ids.add(id));
    out.refs.push(...p.refs);
    if (!p.complete) out.complete = false;
  }
  return out;
}

async function serviceUsage(admin: SupabaseClient, tenantId: string, assetIds: string[]): Promise<Found> {
  const out = empty();
  const links = await admin.from("talent_offering_media").select("offering_id, media_asset_id").in("media_asset_id", assetIds);
  if (links.error || !links.data) {
    logServerError("media.assetUsage.serviceLinks", links.error);
    return empty(false);
  }
  const rows = links.data as { offering_id: string; media_asset_id: string }[];
  if (rows.length > 0) {
    // The link table has no tenant column: count only offerings that belong to this workspace.
    const offerings = await admin.from("talent_offerings").select("id").eq("tenant_id", tenantId).in("id", [...new Set(rows.map((r) => r.offering_id))]);
    if (offerings.error || !offerings.data) {
      logServerError("media.assetUsage.offerings", offerings.error);
      return empty(false);
    }
    const mine = new Set((offerings.data as { id: string }[]).map((o) => o.id));
    for (const r of rows) {
      if (!mine.has(r.offering_id)) continue;
      out.ids.add(r.media_asset_id);
      out.refs.push({ assetId: r.media_asset_id, kind: "service", id: r.offering_id });
    }
  }
  return merge(Promise.resolve(out), byIdColumn(admin, "talent_addon_groups", "media_asset_id", assetIds));
}

/** The talent's live hero and card photo ARE the asset row; avatars and roster covers point at it. */
async function talentUsage(admin: SupabaseClient, targets: TargetRow[]): Promise<Found> {
  const own = empty();
  for (const t of targets) {
    if (t.owner_talent_profile_id && (t.variant_kind === "hero" || t.variant_kind === "card")) own.ids.add(t.id);
  }
  const urls = targets.map((t) => t.public_url).filter((u): u is string => typeof u === "string" && u.length > 0);
  const avatars: Promise<Found> = urls.length
    ? (async () => {
        const res = await admin.from("profiles").select("avatar_url").in("avatar_url", urls);
        if (res.error) {
          if (isMissingRelation(res.error)) return empty();
          logServerError("media.assetUsage.avatars", res.error);
          return empty(false);
        }
        const hit = new Set((res.data as { avatar_url: string }[] | null)?.map((r) => r.avatar_url) ?? []);
        const f = empty();
        for (const t of targets) if (t.public_url && hit.has(t.public_url)) f.ids.add(t.id);
        return f;
      })()
    : Promise.resolve(empty());
  return merge(Promise.resolve(own), avatars, byIdColumn(admin, "agency_talent_overlays", "cover_media_asset_id", targets.map((t) => t.id)));
}

export async function findAssetUsage(admin: SupabaseClient, tenantId: string, assetIds: string[]): Promise<AssetUsageResult> {
  const none = (): AssetUsage => ({ brand: [], pages: [], posts: [], services: [], events: [], talent: [], unchecked: false });
  const wanted = [...new Set(assetIds.filter(Boolean))];
  if (wanted.length === 0) return { ...none(), blocked: [], places: [] };

  const targetsRes = await admin
    .from("media_assets")
    .select("id, storage_path, public_url, owner_talent_profile_id, variant_kind")
    .eq("tenant_id", tenantId)
    .in("id", wanted);
  if (targetsRes.error || !targetsRes.data) {
    logServerError("media.assetUsage.targets", targetsRes.error);
    return { ...none(), unchecked: true, blocked: wanted, places: [] };
  }
  const targets = targetsRes.data as TargetRow[];
  const ids = targets.map((t) => t.id);
  if (ids.length === 0) return { ...none(), blocked: [], places: [] };

  const [wordmarkOrFavicon, brandExtras, pages, posts, services, events, talent] = await Promise.all([
    listProtectedBrandAssetIds(admin, tenantId, ids),
    merge(
      byIdColumn(admin, "agency_branding", "logo_dark_media_asset_id", ids),
      byIdColumn(admin, "agency_branding", "og_image_media_asset_id", ids),
      byIdColumn(admin, "agency_business_identity", "seo_default_share_image_media_asset_id", ids),
    ),
    merge(
      scanJson(admin, "cms_sections", "page_id, props_jsonb", tenantId, targets, { skipArchived: true, pageRef: true }),
      pageShareUsage(admin, tenantId, ids),
    ),
    scanJson(admin, "cms_posts", "cover_image_url, body_blocks", tenantId, targets),
    serviceUsage(admin, tenantId, ids),
    merge(byIdColumn(admin, "events", "cover_media_id", ids), byIdColumn(admin, "event_schedule_items", "cover_media_id", ids)),
    talentUsage(admin, targets),
  ]);

  const usage = none();
  usage.brand = [...new Set([...wordmarkOrFavicon, ...brandExtras.ids])];
  usage.pages = [...pages.ids];
  usage.posts = [...posts.ids];
  usage.services = [...services.ids];
  usage.events = [...events.ids];
  usage.talent = [...talent.ids];
  usage.unchecked = ![brandExtras, pages, posts, services, events, talent].every((f) => f.complete);

  const blocked = new Set<string>(KINDS.flatMap((k) => usage[k]));
  // A lookup we could not finish cannot clear anything: every asset stays blocked.
  if (usage.unchecked) for (const id of ids) blocked.add(id);
  const refs = [...pages.refs, ...services.refs];
  const places = usage.unchecked ? [] : await resolvePlaces(admin, tenantId, refs);
  return { ...usage, blocked: [...blocked], places };
}

/** Look up the display name of each page / service that uses an image. A failed lookup leaves the name empty. */
async function resolvePlaces(admin: SupabaseClient, tenantId: string, refs: Ref[]): Promise<AssetUsagePlace[]> {
  const pageIds = [...new Set(refs.filter((r) => r.kind === "page").map((r) => r.id))];
  const offeringIds = [...new Set(refs.filter((r) => r.kind === "service").map((r) => r.id))];
  const pageNames = new Map<string, string>();
  const offerings = new Map<string, { name: string; product: boolean }>();
  if (pageIds.length > 0) {
    const res = await admin.from("cms_pages").select("id, title").eq("tenant_id", tenantId).in("id", pageIds);
    if (res.error) logServerError("media.assetUsage.pageNames", res.error);
    for (const r of (res.data ?? []) as { id: string; title: string | null }[]) pageNames.set(r.id, r.title ?? "");
  }
  if (offeringIds.length > 0) {
    const res = await admin.from("talent_offerings").select("id, title, kind").eq("tenant_id", tenantId).in("id", offeringIds);
    if (res.error) logServerError("media.assetUsage.offeringNames", res.error);
    for (const r of (res.data ?? []) as { id: string; title: string | null; kind?: string | null }[]) {
      offerings.set(r.id, { name: r.title ?? "", product: r.kind === "product" });
    }
  }
  const seen = new Set<string>();
  const out: AssetUsagePlace[] = [];
  for (const r of refs) {
    const key = `${r.assetId}:${r.kind}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.kind === "page") {
      out.push({ assetId: r.assetId, kind: "page", id: r.id, name: pageNames.get(r.id) ?? "", href: `/admin/site-settings/content/pages/${r.id}` });
    } else {
      const o = offerings.get(r.id);
      out.push({ assetId: r.assetId, kind: o?.product ? "product" : "service", id: r.id, name: o?.name ?? "", href: "/admin/catalog" });
    }
  }
  return out;
}

/** Ids still blocked once the owner's "delete anyway" choice is applied. Brand, posts, events and talent never lift. */
export function assetIdsStillBlocked(usage: AssetUsageResult, allowInUse: boolean): string[] {
  if (usage.unchecked || !allowInUse) return usage.blocked;
  const hard = new Set<string>(KINDS.filter((k) => !OVERRIDABLE.includes(k)).flatMap((k) => usage[k]));
  return [...hard];
}

export type AssetDeleteGuard = {
  error: string;
  /** What the UI needs for the second confirm. */
  usage: { canOverride: boolean; places: AssetUsagePlace[] };
};

/**
 * The server-side gate for a media delete. Returns null when the delete may go ahead. `allowInUse`
 * is the owner's explicit "delete anyway": it lifts page and service/product uses only, and is
 * re-checked here against fresh usage, so a client flag alone never frees a wordmark or favicon.
 */
export async function guardAssetDelete(
  admin: SupabaseClient,
  tenantId: string,
  ids: string[],
  opts: { allowInUse?: boolean; locale?: UsageLocale } = {},
): Promise<AssetDeleteGuard | null> {
  const usage = await findAssetUsage(admin, tenantId, ids);
  if (usage.blocked.length === 0) return null;
  const locale = opts.locale ?? "en";
  const still = assetIdsStillBlocked(usage, opts.allowInUse === true);
  if (still.length === 0) return null;
  const hardOnly = opts.allowInUse === true && !usage.unchecked;
  const shown: AssetUsageResult = hardOnly ? { ...usage, pages: [], services: [], blocked: still, places: [] } : usage;
  const canOverride = !usage.unchecked && assetIdsStillBlocked(usage, true).length === 0;
  return { error: describeAssetUsageRefusal(shown, locale), usage: { canOverride, places: hardOnly ? [] : usage.places } };
}

export type UsageLocale = "en" | "es";

const WHERE: Record<UsageLocale, Record<AssetUsageKind, string>> = {
  en: {
    brand: "as your wordmark, favicon or share image (Settings → Brand identity)",
    pages: "on your site pages",
    posts: "in your posts",
    services: "as a service or product photo",
    events: "on an event",
    talent: "as a talent's hero, card or profile picture, or a roster cover",
  },
  es: {
    brand: "como tu logotipo, favicon o imagen para compartir (Ajustes → Identidad de marca)",
    pages: "en las páginas de tu sitio",
    posts: "en tus publicaciones",
    services: "como foto de un servicio o producto",
    events: "en un evento",
    talent: "como foto principal, de tarjeta o de perfil de un talento, o portada del equipo",
  },
};

/** The refusal shown when a delete is blocked. Plain words, says where and what to do, EN or ES. */
export function describeAssetUsageRefusal(usage: AssetUsageResult, locale: UsageLocale = "en"): string {
  if (usage.unchecked) {
    return locale === "es"
      ? "No pudimos comprobar si estas imágenes están en uso. No se eliminó nada. Inténtalo de nuevo en un momento."
      : "We could not check whether these images are in use. Nothing was deleted. Try again in a moment.";
  }
  const allPlaces = usage.places ?? [];
  const named = allPlaces.filter((p) => p.name).slice(0, 5);
  const more = allPlaces.length - named.length;
  const list = named.map((p) => `"${p.name}"`).join(", ");
  const names = named.length === 0 ? "" : locale === "es" ? ` Usadas en: ${list}${more > 0 ? ` y ${more} más` : ""}.` : ` Used by: ${list}${more > 0 ? ` and ${more} more` : ""}.`;
  const where = KINDS.filter((k) => usage[k].length > 0).map((k) => `${usage[k].length} ${WHERE[locale][k]}`);
  return locale === "es"
    ? `No se eliminó nada: ${usage.blocked.length} imagen(es) seleccionada(s) están en uso (${where.join("; ")}). Reemplázalas allí primero.${names}`
    : `Nothing was deleted: ${usage.blocked.length} selected image(s) are in use (${where.join("; ")}). Replace them there first.${names}`;
}
