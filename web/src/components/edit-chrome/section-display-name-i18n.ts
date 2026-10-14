import { cleanSectionName } from "@/lib/site-admin/clean-section-name";
import {
  resolveSectionHeadlineFromProps,
  sectionDisplayName,
} from "@/lib/site-admin/section-display-name";

type T = (s: string) => string;
type Loc = "en" | "es";

const NAME_SEPARATOR = " — ";
/** Seeder suffix on default section names ("Hero — new"). */
const SEEDER_SUFFIX_ES: Readonly<Record<string, string>> = { new: "nuevo" };

/** Same rule as `sectionDisplayName`: a headline this long wins over the stored name. */
const MIN_HEADLINE = 3;

function humanizeTypeKey(key: string | null | undefined): string {
  if (!key) return "Section";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Translate a seeded section name ("Hero — new", "Featured professionals —
 * new") at the editor-chrome render boundary. The stored name is English
 * (cleaned by `cleanSectionName`); the type label comes from the registry
 * catalog, so each part is translated on its own. Unknown names pass through.
 */
export function localizeSeededSectionName(name: string, t: T, locale: Loc): string {
  const whole = t(name);
  if (whole !== name) return whole;
  const at = name.indexOf(NAME_SEPARATOR);
  if (at < 0) return name;
  const head = name.slice(0, at);
  const tail = name.slice(at + NAME_SEPARATOR.length);
  const tailT = (locale === "es" && SEEDER_SUFFIX_ES[tail.toLowerCase()]) || t(tail);
  return `${t(head)}${NAME_SEPARATOR}${tailT}`;
}

/**
 * `sectionDisplayName` for the builder chrome (navigator rows, canvas chip):
 * a content headline is the author's own text and is never translated; every
 * fallback (seeded name, type key) goes through the editor catalog.
 */
export function localizedSectionDisplayName(
  args: {
    typeKey: string | null | undefined;
    rawName: string | null | undefined;
    headline?: string | null;
    props?: Record<string, unknown> | null;
  },
  t: T,
  locale: Loc,
): string {
  const headline =
    args.headline?.trim() || resolveSectionHeadlineFromProps(args.typeKey, args.props);
  if (headline.length >= MIN_HEADLINE) return sectionDisplayName(args);
  const cleaned = cleanSectionName(args.rawName) || (args.rawName ?? "").trim();
  if (cleaned) return localizeSeededSectionName(cleaned, t, locale);
  return t(humanizeTypeKey(args.typeKey));
}
