/**
 * TUL-1272 #1 (C1): service content fields (slug, slug history, summary, SEO, OG image,
 * presentation, page link, service type, tags) on `talent_offerings`.
 *
 * The migration is HELD (`supabase/migrations/_pending_pm/20261231415800_service_content_fields.sql`),
 * so everything here works without the columns: a row that lacks a key reads as empty content,
 * and `effectiveServiceContent` derives every value the page paints today. Nothing changes on a
 * site until the migration is applied AND a row stores a value.
 *
 * Pure (no DB, no server-only). `database.types.ts` is regenerated elsewhere, so the row shape
 * is a local shim (`ServiceContentRowShim`), not the generated type.
 */
import { serviceMetaText, serviceSlug } from "./service-page";

export const SERVICE_PRESENTATION_MODES = ["own_page", "quick_view", "expand", "book_direct"] as const;
export type ServicePresentationMode = (typeof SERVICE_PRESENTATION_MODES)[number];

/** Column names in migration order. The probe and the loader select exactly these. */
export const SERVICE_CONTENT_COLUMNS = [
  "slug",
  "slug_history",
  "summary",
  "seo_title",
  "seo_description",
  "og_media_id",
  "presentation",
  "page_id",
  "service_type",
  "tags",
] as const;

/** Local type shim for the new columns (all optional: absent before the migration). */
export type ServiceContentRowShim = Partial<{
  slug: string | null;
  slug_history: string[] | null;
  summary: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_media_id: string | null;
  presentation: string | null;
  page_id: string | null;
  service_type: string | null;
  tags: string[] | null;
}>;

export type ServiceContentFields = {
  /** Custom slug; null = the derived `servicio-<title>-<id8>` slug. */
  slug: string | null;
  slugHistory: string[];
  summary: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogMediaId: string | null;
  /** null = the presentation resolver (C2) decides. */
  presentation: ServicePresentationMode | null;
  pageId: string | null;
  serviceType: string | null;
  tags: string[];
};

export const EMPTY_SERVICE_CONTENT: ServiceContentFields = Object.freeze({
  slug: null,
  slugHistory: [],
  summary: null,
  seoTitle: null,
  seoDescription: null,
  ogMediaId: null,
  presentation: null,
  pageId: null,
  serviceType: null,
  tags: [],
}) as ServiceContentFields;

/** Same shape the migration's slug check enforces. */
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUMMARY_MAX = 160;

/** Lower-cased, trimmed slug when it has the stored shape, else null. */
export function normalizeStoredServiceSlug(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return s.length > 0 && s.length <= 96 && SLUG_SHAPE.test(s) ? s : null;
}

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function uuid(v: unknown): string | null {
  return typeof v === "string" && UUID.test(v.trim()) ? v.trim().toLowerCase() : null;
}

function uniq(list: string[]): string[] {
  return [...new Set(list)];
}

function warnDropped(field: string, value: unknown): void {
  if (process.env.NODE_ENV !== "production" && value != null) {
    console.warn(`[service-content] dropped invalid ${field}:`, value);
  }
}

/**
 * Tolerant read of the content columns from any offering row. A key that is missing (column not
 * there yet) or holds a bad value falls back to the empty default; it never throws.
 */
export function serviceContentFromRow(row: unknown): ServiceContentFields {
  if (!row || typeof row !== "object") return EMPTY_SERVICE_CONTENT;
  const r = row as ServiceContentRowShim;
  const slug = normalizeStoredServiceSlug(r.slug);
  if (r.slug != null && !slug) warnDropped("slug", r.slug);
  const history = Array.isArray(r.slug_history)
    ? uniq(r.slug_history.map(normalizeStoredServiceSlug).filter((s): s is string => s !== null && s !== slug))
    : [];
  const presentation = (SERVICE_PRESENTATION_MODES as readonly string[]).includes(r.presentation ?? "")
    ? (r.presentation as ServicePresentationMode)
    : null;
  if (r.presentation != null && !presentation) warnDropped("presentation", r.presentation);
  const tags = Array.isArray(r.tags)
    ? uniq(r.tags.map((t) => (typeof t === "string" ? t.trim().toLowerCase() : "")).filter(Boolean))
    : [];
  return {
    slug,
    slugHistory: history,
    summary: text(r.summary),
    seoTitle: text(r.seo_title),
    seoDescription: text(r.seo_description),
    ogMediaId: uuid(r.og_media_id),
    presentation,
    pageId: uuid(r.page_id),
    serviceType: text(r.service_type),
    tags,
  };
}

export type EffectiveServiceContent = Omit<ServiceContentFields, "slug" | "seoTitle" | "seoDescription"> & {
  slug: string;
  seoTitle: string;
  seoDescription: string;
};

function clip(t: string, max: number): string {
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

/**
 * The values a surface paints: stored content when set, otherwise today's derivations
 * (derived slug, `serviceMetaText` title/description, summary = description clipped to 160).
 */
export function effectiveServiceContent(
  o: { id: string; title: string; description?: string | null },
  stored: ServiceContentFields | null | undefined,
  ctx: { talentName: string | null; city?: string | null; locale?: string },
): EffectiveServiceContent {
  const c = stored ?? EMPTY_SERVICE_CONTENT;
  const meta = serviceMetaText({ title: o.title, description: o.description ?? null }, ctx.talentName, {
    city: ctx.city,
    locale: ctx.locale,
  });
  const desc = o.description?.replace(/\s+/g, " ").trim();
  const summary = c.summary ?? (desc ? clip(desc, SUMMARY_MAX) : null);
  return {
    ...c,
    slug: c.slug ?? serviceSlug(o),
    summary,
    seoTitle: c.seoTitle ?? meta.title,
    seoDescription: c.seoDescription ?? (c.summary ? clip(c.summary, SUMMARY_MAX) : meta.description),
  };
}
