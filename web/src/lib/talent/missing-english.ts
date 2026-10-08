/**
 * TUL-361: "Add English". The pure half. No IO, no React.
 *
 * Talent-entered content that the public English site reads from a per-language
 * map but that was only ever written in the talent's own language:
 *   - photo captions     media_assets.metadata.caption_i18n.en
 *   - service titles     talent_offerings.title_i18n.en
 *   - service categories talent_offerings.category_i18n.en
 *   - ticker items       marquee node props.i18n.en["items.N.text"]
 *
 * `collectMissingEnglish` lists every such field that has own-language text and
 * no English. `withEnglish*` build the stored value for ONE accepted English
 * text: they only ever add the `en` key, never overwrite a non-empty `en`
 * (they return null instead) and never touch the primary language or any other
 * key. The English text itself is a SUGGESTION the talent reviews; nothing here
 * translates anything.
 */
import { platformCategoryLabel } from "./category-label-fallback";
import { normalizePhotoCaption } from "@/lib/site-admin/media/photo-caption-edit";

export type MissingEnglishKind = "photo_caption" | "service_title" | "service_category" | "ticker_item";

export type MissingEnglishField = {
  kind: MissingEnglishKind;
  /** Row id (photo / offering) or the marquee node id. */
  id: string;
  /** Stable key inside the row: "" for rows with one field, "items.N.text" for tickers. */
  path: string;
  /** The text in the talent's own language. */
  source: string;
};

export type MissingEnglishOffering = {
  id: string;
  title: string | null;
  category: string | null;
  title_i18n: unknown;
  category_i18n: unknown;
};
export type MissingEnglishPhoto = { id: string; metadata: unknown };
export type MissingEnglishMarquee = {
  /** Node id. */
  id: string;
  items: ReadonlyArray<{ text?: unknown }>;
  /** props.i18n: { en: { "items.0.text": "..." } } */
  i18n: unknown;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const lc = (v: string): string => v.trim().toLowerCase().slice(0, 2);

/** A stored jsonb map as strings only; null when it is not a plain map of strings (never rewritten). */
function readStringMap(raw: unknown): Record<string, string> | null {
  if (raw === null || raw === undefined) return {};
  if (!isObj(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") return null;
    out[k] = v;
  }
  return out;
}

function primaryText(map: Record<string, string> | null, plain: unknown, primary: string): string {
  return clean(map?.[primary]) || clean(plain);
}

/** Every field with own-language text and no English, in a stable order. */
export function collectMissingEnglish(input: {
  /** The talent's own (primary) language. English primary means nothing to add. */
  primary: string;
  offerings: readonly MissingEnglishOffering[];
  photos: readonly MissingEnglishPhoto[];
  marquees?: readonly MissingEnglishMarquee[];
}): MissingEnglishField[] {
  const primary = lc(input.primary);
  if (!primary || primary === "en") return [];
  const out: MissingEnglishField[] = [];

  for (const p of input.photos) {
    const meta = isObj(p.metadata) ? p.metadata : {};
    const map = readStringMap(meta.caption_i18n);
    if (map === null) continue;
    const source = clean(meta.caption) || clean(map[primary]);
    if (source && !clean(map.en)) out.push({ kind: "photo_caption", id: p.id, path: "", source });
  }

  for (const o of input.offerings) {
    const titleMap = readStringMap(o.title_i18n);
    const title = primaryText(titleMap, o.title, primary);
    if (titleMap && title && !clean(titleMap.en)) out.push({ kind: "service_title", id: o.id, path: "", source: title });

    const catMap = readStringMap(o.category_i18n);
    const category = primaryText(catMap, o.category, primary);
    // A standard trade category already has platform English; leave it alone.
    if (catMap && category && !clean(catMap.en) && platformCategoryLabel(category, "en") === null) {
      out.push({ kind: "service_category", id: o.id, path: "", source: category });
    }
  }

  for (const m of input.marquees ?? []) {
    const overlay = isObj(m.i18n) && isObj(m.i18n.en) ? (m.i18n.en as Record<string, unknown>) : {};
    m.items.forEach((item, i) => {
      const path = `items.${i}.text`;
      const source = clean(item?.text);
      if (source && !clean(overlay[path])) out.push({ kind: "ticker_item", id: m.id, path, source });
    });
  }
  return out;
}

/** Cap per kind, matching what the editors accept. */
export function clampEnglish(kind: MissingEnglishKind, text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (kind === "photo_caption") return normalizePhotoCaption(t);
  if (kind === "service_category") return t.slice(0, 80).trim();
  return t.slice(0, 120).trim();
}

/**
 * The new i18n map with `en` added, or null when nothing should be written:
 * empty text, a non-empty `en` already stored, or a stored value that is not a
 * plain text map. Every other key is carried through untouched.
 */
export function withEnglishMap(raw: unknown, text: string): Record<string, string> | null {
  const en = text.trim();
  if (!en) return null;
  const map = readStringMap(raw);
  if (map === null) return null;
  if (clean(map.en)) return null;
  return { ...map, en };
}

/** Photo metadata with `caption_i18n.en` added; every other key untouched. Null when nothing should be written. */
export function withEnglishCaption(metadata: unknown, text: string): Record<string, unknown> | null {
  const meta: Record<string, unknown> = isObj(metadata) ? { ...metadata } : {};
  const next = withEnglishMap(meta.caption_i18n, text);
  if (!next) return null;
  meta.caption_i18n = next;
  return meta;
}
