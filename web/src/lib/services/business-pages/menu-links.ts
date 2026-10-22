/**
 * Menu item -> business service page link (pure: no DB, no React).
 *
 * A `menu_board` item gets a link only when its offering id has an eligible page row
 * (`loadBusinessServiceRows`). The path is built by the one slug builder in `paths.ts`
 * (`businessServiceSlug` + `businessServicePathWithoutLocale`), then given the tenant's
 * locale prefix (`""` on the default locale of a path-less tenant, `/en` on an
 * ES-default tenant, `/es` on an EN-default one) and the path-based tenant prefix.
 */
import { businessServicePathWithoutLocale, businessServiceSlug } from "./paths";

export type MenuServiceHrefMap = Readonly<Record<string, string>>;

/** offering id -> href, for the rows that have a page. Rows without an id or title are skipped. */
export function buildMenuServiceHrefs(
  rows: ReadonlyArray<{ id: string | number; title?: string | null }>,
  opts: { locale: string; prefix: string },
): MenuServiceHrefMap {
  const prefix = opts.prefix.replace(/\/+$/, "");
  const out: Record<string, string> = {};
  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    out[id] = `${prefix}${businessServicePathWithoutLocale(opts.locale, businessServiceSlug({ id, title: String(row.title ?? "") }))}`;
  }
  return out;
}

/** The href for one menu item, or null (plain text). */
export function menuItemServiceHref(map: MenuServiceHrefMap | undefined, offeringId: string): string | null {
  if (!map) return null;
  return Object.prototype.hasOwnProperty.call(map, offeringId) ? (map[offeringId] ?? null) : null;
}
