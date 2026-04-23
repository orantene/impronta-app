import type { Metadata } from "next";

import { createTranslator } from "@/i18n/messages";
import { buildPublicLocaleAlternates } from "@/lib/seo/locale-alternates";
import { getPublicHostContext } from "@/lib/saas/scope";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";

type PageKey = "directory" | "models" | "contact";

const TITLE_KEY: Record<PageKey, string> = {
  directory: "public.meta.directoryTitle",
  models: "public.meta.modelsTitle",
  contact: "public.meta.contactTitle",
};

const DESCRIPTION_KEY: Record<PageKey, string> = {
  directory: "public.meta.directoryDescription",
  models: "public.meta.modelsDescription",
  contact: "public.meta.contactDescription",
};

const PATH: Record<PageKey, string> = {
  directory: "/directory",
  models: "/models",
  contact: "/contact",
};

/**
 * Builds a public page's <Metadata> with per-tenant identity layered on top
 * of the i18n defaults. The tenant's published `seo_default_*` overrides win;
 * otherwise we append the tenant brand name to the default title so the tab
 * label carries the agency's identity instead of the platform's.
 */
export async function buildPublicPageMetadata(
  page: PageKey,
  locale: string,
): Promise<Metadata> {
  const t = createTranslator(locale);
  const baseTitle = t(TITLE_KEY[page]);
  const baseDescription = t(DESCRIPTION_KEY[page]);
  const alternates = buildPublicLocaleAlternates(locale, PATH[page]);

  const ctx = await getPublicHostContext();
  if (ctx.kind !== "agency" && ctx.kind !== "hub") {
    return {
      title: baseTitle,
      description: baseDescription,
      ...alternates,
    };
  }

  const identity = await loadPublicIdentity(ctx.tenantId);
  const brandName = identity?.public_name?.trim() || null;

  const title = brandName ? `${baseTitle} · ${brandName}` : baseTitle;

  const description =
    identity?.seo_default_description?.trim() ||
    (brandName ? `${baseDescription} ${brandName}.` : baseDescription);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(brandName ? { siteName: brandName } : {}),
    },
    ...alternates,
  };
}
