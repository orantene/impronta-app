/**
 * Zero-cost alt text suggestion for photos with no alt (TUL-588). Pure, no IO,
 * no AI. Built only from the talent's own data:
 *   "<trade> by <name> in <city>" plus the service or category the photo is
 *   attached to. Spanish and English, no em dashes, never slug-style text.
 *
 * The builder is used twice: the editor shows it as an editable suggestion,
 * and the public renderer uses it instead of an empty alt. Decorative images
 * are not passed through here; they keep alt="".
 *
 * Note for a later AI-vision version (not built): a vision model could read
 * the pixels, but the suggestion here must stay the free default.
 */

export interface AltSuggestContext {
  name?: string | null;
  trade?: string | null;
  city?: string | null;
  /** Service or category the photo is attached to (human title, not a slug). */
  service?: string | null;
}

export const ALT_SUGGEST_MAX_CHARS = 125;

function clean(v: string | null | undefined): string {
  return (v ?? "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

// TODO(TUL-588): converge with the slug-alt guard re-applied in PR #3680 (from #3298) once it lands on main.
/**
 * True for slug or file-id style text: no spaces and separators or digits
 * (`f-hero`, `f-d-knit`, `IMG_1234.jpg`), or a bare filename.
 */
export function looksLikeSlugAlt(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (/\.(jpe?g|png|webp|gif|avif|heic)$/i.test(t)) return true;
  if (/\s/.test(t)) return false;
  return /^[a-z0-9]+([-_][a-z0-9]+)+$/i.test(t) || /^[a-z]*\d{3,}[a-z0-9]*$/i.test(t);
}

/** A usable human value, or "" when empty or slug-like. */
function human(v: string | null | undefined): string {
  const c = clean(v);
  return c && !looksLikeSlugAlt(c) ? c : "";
}

/** Returns "" when there is not enough data (caller falls back further). */
export function buildSuggestedAlt(ctx: AltSuggestContext, locale: string | null | undefined): string {
  const es = (locale ?? "").trim().toLowerCase().startsWith("es");
  const name = human(ctx.name);
  const trade = human(ctx.trade);
  const city = human(ctx.city);
  const service = human(ctx.service);
  if (!name && !trade) return "";

  const by = es ? "por" : "by";
  const inn = es ? "en" : "in";
  let base = trade && name ? `${trade} ${by} ${name}` : name || trade;
  if (city) base += ` ${inn} ${city}`;
  if (service) base += `${es ? ". Servicio: " : ". Service: "}${service}`;
  const out = base.length > ALT_SUGGEST_MAX_CHARS ? base.slice(0, ALT_SUGGEST_MAX_CHARS).trim() : base;
  return out;
}
