import { withLocaleHref } from "@/i18n/pathnames";

/**
 * TUL-861: the empty-slot panel offers two ways forward. "Consultar disponibilidad" opens the
 * chat with the service already attached (the canonical front door, W2-E). "Pedir información"
 * is a plain link to the site's contact page (a form, no chat) in the page language, keeping a
 * `/w/<slug>` workspace prefix when the visitor is on one.
 */
export function requestInfoHref(pathname: string, locale: string): string {
  const m = /^\/(?:(?:es|en)(?=\/|$))?\/?(w\/[a-z0-9][a-z0-9-]*)?/i.exec(pathname);
  const workspace = m?.[1] ? `/${m[1]}` : "";
  return withLocaleHref(`${workspace}/contact`, locale);
}
