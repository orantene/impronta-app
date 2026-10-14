/**
 * TUL-847 · hero tagline from VISIBLE services only.
 *
 * Onboarding drafts `short_bio` ("Ofrezco limpieza profunda y ...") from the
 * services the person typed. When a service is later hidden, that stored line
 * still names it, and the tagline falls back to `short_bio`. When the line
 * names a hidden service, rebuild the services sentence from the visible ones
 * (or drop the line when none is visible). A line with no hidden mention, or a
 * tagline the talent wrote herself, is never touched. Pure.
 */

export interface ServiceVisibility {
  /** Titles of services a visitor can see, in the visitor's language, in menu order. */
  visible: readonly string[];
  /** Every title (all languages) of services that exist but are hidden. */
  hidden: readonly string[];
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function join(items: readonly string[], and: string): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/** True when the line names a hidden service that no visible service also names. */
export function mentionsHiddenService(line: string, vis: ServiceVisibility): boolean {
  const text = fold(line);
  if (!text) return false;
  const visible = new Set(vis.visible.map(fold));
  return vis.hidden.some((h) => {
    const f = fold(h);
    return f.length >= 3 && !visible.has(f) && text.includes(f);
  });
}

/** The line, with a stale hidden-service mention replaced by a sentence from the visible services. */
export function tagLineFromVisibleServices(line: string, vis: ServiceVisibility, locale: "en" | "es"): string {
  if (!mentionsHiddenService(line, vis)) return line;
  const names = vis.visible.map((v) => v.trim()).filter(Boolean).slice(0, 3).map(lowerFirst);
  if (names.length === 0) return "";
  return locale === "es" ? `Ofrezco ${join(names, "y")}.` : `I offer ${join(names, "and")}.`;
}
