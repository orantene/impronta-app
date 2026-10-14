import {
  TALENT_DEMO_HOST_SUFFIX,
  TALENT_SITE_PRIMARY_ROOT,
  isTalentSiteLabel,
  talentSitePublicUrl,
} from "@/lib/talent-site/site-public-url";

/**
 * `tulala.digital/es/alex-trevino-demo` and `/alex-trevino-demo` returned the
 * 404 while `alex-trevino-demo.tulala.digital` works. A demo talent's public
 * address is its `-demo` subdomain, so the apex path form hops there (308).
 * Marketing host only; a tenant host can publish its own page at that slug.
 */
export type DemoSlugApexInput = {
  pathname: string;
  search: string;
  method: string;
  /** `hostContext.kind` from the proxy. */
  hostKind: string;
};

export function marketingDemoSlugRedirect(input: DemoSlugApexInput): string | null {
  if (input.hostKind !== "marketing") return null;
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  const segs = input.pathname.split("/").filter(Boolean);
  if (segs.length === 2 && /^(es|en)$/.test(segs[0] ?? "")) segs.shift();
  if (segs.length !== 1) return null;
  const label = segs[0] ?? "";
  if (!label.endsWith(TALENT_DEMO_HOST_SUFFIX)) return null;
  const slug = label.slice(0, -TALENT_DEMO_HOST_SUFFIX.length);
  if (!slug || !isTalentSiteLabel(label)) return null;
  const url = talentSitePublicUrl(slug, { isDemo: true, root: TALENT_SITE_PRIMARY_ROOT });
  if (!url) return null;
  const search = input.search && input.search !== "?" ? input.search : "";
  return `${url.replace(/\/+$/, "")}/${search}`;
}
