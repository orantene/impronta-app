/**
 * Public reader for public.changelog_entries (TUL-1394).
 *
 * The table is written only by the Notion sync (PR #4154) and is public-read by
 * RLS, so the cookie-less anon client is enough. No Notion call is made at
 * request time. Everything that decides how a row looks (locale pick, dates,
 * launch flag, share text) is a pure function here so it can be tested.
 */
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/server/safe-error";

export type ChangelogLocale = "en" | "es";

export type ChangelogRow = {
  notion_page_id: string;
  status: "published" | "paused";
  kind: string;
  release_date: string | null;
  tier: number | null;
  badge: string | null;
  title_en: string;
  title_es: string;
  summary_en: string;
  summary_es: string;
  body_en_html: string;
  body_es_html: string;
  audience: string[];
  plans: string[];
  categories: string[];
  help_url: string | null;
  cover_image_url: string | null;
  published_at: string | null;
};

export type ChangelogEntryView = {
  id: string;
  kind: string;
  badge: string | null;
  tier: number | null;
  title: string;
  summary: string;
  bodyHtml: string;
  audience: string[];
  plans: string[];
  categories: string[];
  helpUrl: string | null;
  coverImageUrl: string | null;
  /** ISO date used for display and sorting (published_at, else release_date). */
  date: string | null;
  /** True when the requested language had no title and the other one was used. */
  fellBack: boolean;
};

const COLUMNS =
  "notion_page_id,status,kind,release_date,tier,badge,title_en,title_es,summary_en,summary_es,body_en_html,body_es_html,audience,plans,categories,help_url,cover_image_url,published_at";

/**
 * The launch switch. Off until the public launch: while off, the pages carry
 * noindex and stay out of the sitemap. Only the exact value "1" turns it on
 * ("true", "yes" and anything else stay off, which is the safe direction).
 * The pages and feeds do not read this directly: they read `isChangelogLive`
 * below, which also refuses to go public with placeholder copy (TUL-1586).
 */
export function isChangelogPublicLaunch(env: Record<string, string | undefined> = process.env): boolean {
  return (env.CHANGELOG_PUBLIC_LAUNCH ?? "").trim() === "1";
}

/**
 * Markers that must never reach a public page. Specific on purpose: a real entry
 * about "placeholders in forms" must not block the launch forever.
 */
const PLACEHOLDER_COPY = /needs oran sign-?off|requiere visto bueno|placeholder copy|texto provisional|\[placeholder\]/i;
/** Case-sensitive and colon-terminated: "todo" is an everyday Spanish word. */
const TODO_MARKER = /\bTODO:/;

export type LaunchBlock = "flag_off" | "no_launch_edition" | "placeholder_copy";

export type ChangelogLaunchState =
  | { live: true; edition: ChangelogRow }
  | { live: false; reason: LaunchBlock; offenders: string[] };

export function hasPlaceholderCopy(row: ChangelogRow): boolean {
  const text = [row.title_en, row.title_es, row.summary_en, row.summary_es, row.body_en_html, row.body_es_html].join("\n");
  return PLACEHOLDER_COPY.test(text) || TODO_MARKER.test(text);
}

/** The newest published Edition (Notion Kind "Edition") that has a title in both languages. */
export function pickLaunchEdition(rows: readonly ChangelogRow[]): ChangelogRow | null {
  const when = (r: ChangelogRow) => Date.parse(r.published_at ?? r.release_date ?? "") || 0;
  const editions = rows
    .filter((r) => r.status === "published" && r.kind === "Edition" && r.title_en.trim() !== "" && r.title_es.trim() !== "")
    .sort((a, b) => when(b) - when(a));
  return editions[0] ?? null;
}

/**
 * Fails closed. The changelog goes public only when the flag is "1" AND no
 * published entry carries placeholder copy AND a Launch Edition is published.
 * Any other combination behaves exactly like flag off.
 */
export function changelogLaunchState(flagOn: boolean, rows: readonly ChangelogRow[]): ChangelogLaunchState {
  if (!flagOn) return { live: false, reason: "flag_off", offenders: [] };
  const offenders = rows.filter(hasPlaceholderCopy).map((r) => r.notion_page_id);
  if (offenders.length > 0) return { live: false, reason: "placeholder_copy", offenders };
  const edition = pickLaunchEdition(rows);
  if (!edition) return { live: false, reason: "no_launch_edition", offenders: [] };
  return { live: true, edition };
}

const loggedBlocks = new Set<string>();

/** Reads the table only when the flag is on, so a flag-off site pays nothing. */
export async function getChangelogLaunchState(env: Record<string, string | undefined> = process.env): Promise<ChangelogLaunchState> {
  if (!isChangelogPublicLaunch(env)) return { live: false, reason: "flag_off", offenders: [] };
  const state = changelogLaunchState(true, await loadChangelogRows());
  if (!state.live && !loggedBlocks.has(state.reason)) {
    loggedBlocks.add(state.reason);
    logServerError(
      "changelog.launch-guard",
      `CHANGELOG_PUBLIC_LAUNCH is on but the changelog stays OFF: ${state.reason}${state.offenders.length ? ` (${state.offenders.join(", ")})` : ""}`,
    );
  }
  return state;
}

export async function isChangelogLive(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  return (await getChangelogLaunchState(env)).live;
}

/** Only https image URLs from the changelog bucket or other https hosts reach an <img>. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https:\/\//i.test(url) ? url : null;
}

export function toEntryView(row: ChangelogRow, locale: ChangelogLocale): ChangelogEntryView {
  const wantEs = locale === "es";
  const title = (wantEs ? row.title_es : row.title_en).trim();
  const other = (wantEs ? row.title_en : row.title_es).trim();
  const fellBack = title === "" && other !== "";
  const pick = (own: string, alt: string) => (own.trim() !== "" ? own : fellBack ? alt : own);
  return {
    id: row.notion_page_id,
    kind: row.kind,
    badge: row.badge,
    tier: row.tier,
    title: fellBack ? other : title,
    summary: pick(wantEs ? row.summary_es : row.summary_en, wantEs ? row.summary_en : row.summary_es),
    bodyHtml: pick(wantEs ? row.body_es_html : row.body_en_html, wantEs ? row.body_en_html : row.body_es_html),
    audience: row.audience ?? [],
    plans: row.plans ?? [],
    categories: row.categories ?? [],
    helpUrl: row.help_url,
    coverImageUrl: safeImageUrl(row.cover_image_url),
    date: row.published_at ?? row.release_date,
    fellBack,
  };
}

/** Newest first; undated entries last. Entries with no title in either language are dropped. */
export function viewEntries(rows: readonly ChangelogRow[], locale: ChangelogLocale): ChangelogEntryView[] {
  return rows
    .filter((r) => (r.title_en + r.title_es).trim() !== "")
    .map((r) => toEntryView(r, locale))
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));
}

export function filterByCategory(entries: readonly ChangelogEntryView[], category: string | null): ChangelogEntryView[] {
  if (!category) return [...entries];
  return entries.filter((e) => e.categories.includes(category));
}

export function categoriesOf(entries: readonly ChangelogEntryView[]): string[] {
  return [...new Set(entries.flatMap((e) => e.categories))].sort((a, b) => a.localeCompare(b));
}

/** Short text an agency can paste to tell its clients about the change. */
export function shareText(entry: Pick<ChangelogEntryView, "title" | "summary">, locale: ChangelogLocale, url: string): string {
  const lead = locale === "es" ? "Novedad en Tulala" : "New in Tulala";
  return `${lead}: ${entry.title}. ${entry.summary} ${url}`.replace(/\s+/g, " ").trim();
}

export function formatEntryDate(iso: string | null, locale: ChangelogLocale): string {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(t));
}

export async function loadChangelogRows(): Promise<ChangelogRow[]> {
  const db = createPublicSupabaseClient();
  if (!db) return [];
  const { data, error } = await db
    .from("changelog_entries")
    .select(COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) {
    logServerError("changelog.public-read", error);
    return [];
  }
  return (data ?? []) as ChangelogRow[];
}

export async function loadChangelogRow(id: string): Promise<ChangelogRow | null> {
  const db = createPublicSupabaseClient();
  if (!db) return null;
  const { data, error } = await db
    .from("changelog_entries")
    .select(COLUMNS)
    .eq("notion_page_id", id)
    .eq("status", "published")
    .maybeSingle();
  if (error) {
    logServerError("changelog.public-read.one", error);
    return null;
  }
  return (data as ChangelogRow | null) ?? null;
}
