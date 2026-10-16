/**
 * TUL-1085: BreadcrumbList for a talent service page (Home > Service), as a node for the page's
 * JSON-LD `@graph`. Pure. The home crumb is the service URL minus its last path segment, so it
 * keeps the talent's own host and language prefix (`https://j.example/` or `https://j.example/en`).
 */
import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-json-ld";

/** Home URL for a service page canonical, or null when the canonical is not an absolute URL. */
export function serviceHomeUrl(canonicalUrl: string): string | null {
  try {
    const u = new URL(canonicalUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    parts.pop();
    return `${u.origin}${parts.length ? `/${parts.join("/")}` : "/"}`;
  } catch {
    return null;
  }
}

/** A `BreadcrumbList` graph node (no `@context`), or null when there is no home URL or no title. */
export function buildServiceBreadcrumbNode(input: {
  canonicalUrl: string;
  title: string;
  locale: string;
}): Record<string, unknown> | null {
  const home = serviceHomeUrl(input.canonicalUrl);
  if (!home) return null;
  const list = buildBreadcrumbJsonLd([
    { name: input.locale.toLowerCase().startsWith("en") ? "Home" : "Inicio", url: home },
    { name: input.title, url: input.canonicalUrl },
  ]);
  if (!list) return null;
  const { "@context": _context, ...node } = list;
  return { ...node, "@id": `${input.canonicalUrl}#breadcrumb` };
}
