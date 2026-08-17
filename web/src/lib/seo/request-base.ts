/**
 * Kept as the historical import path for `publicRequestSiteBase` (sitemap /
 * robots). The implementation moved to `site-origin.ts`, which is a leaf module
 * so `locale-alternates.ts` can share the same host resolution without forming
 * an import cycle.
 */
export { publicRequestSiteBase } from "@/lib/seo/site-origin";
