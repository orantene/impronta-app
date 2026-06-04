import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { PublicHeader } from "@/components/public-header";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { slugPathFromParams } from "@/lib/cms/paths";
import { getRequestLocale } from "@/i18n/request-locale";
import type { Locale } from "@/i18n/config";
import { buildPublicLocaleAlternates } from "@/lib/seo/locale-alternates";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { loadPageForRender } from "@/lib/site-admin/server/page-reads";
import { BlocksRenderer } from "@/components/page-builder/blocks";
import type { PageBlock, PageTheme } from "@/components/page-builder/blocks";
import {
  jsonLdDocumentToScript,
  type JsonLdDocument,
} from "@/lib/site-admin/cms-seo";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * P4-SEO — operator-authored schema.org JSON-LD for a published CMS page.
 * Read once (scoped to tenant/locale/slug) and emitted as a structured-data
 * script in whichever render branch matches. Returns null when none is set.
 */
async function loadPageJsonLdScript(
  supabase: SupabaseClient,
  tenantId: string,
  locale: string,
  slugPath: string,
): Promise<string> {
  const { data } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
    .select("json_ld")
    .eq("locale", locale)
    .eq("slug", slugPath)
    .maybeSingle<{ json_ld: JsonLdDocument | null }>();
  return jsonLdDocumentToScript(data?.json_ld ?? null);
}

function JsonLdScript({ script }: { script: string }) {
  if (!script) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}

type CmsPagePublic = {
  title: string;
  body: string;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  canonical_url: string | null;
  locale: string;
  slug: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug: slugParam } = await params;
  const slugPath = slugPathFromParams(slugParam);
  if (!slugPath) return { title: "Not found" };

  const locale = await getRequestLocale();
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { title: "Not found" };

  const publicScope = await getPublicTenantScope();
  if (!publicScope) return { title: "Not found" };

  const { data } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select(
      "title,meta_title,meta_description,og_title,og_description,og_image_url,noindex,canonical_url,locale,slug",
    )
    .eq("locale", locale)
    .eq("slug", slugPath)
    .maybeSingle();

  const page = data as CmsPagePublic | null;
  if (!page) return { title: "Not found" };

  const pathnameEn = `/p/${slugPath}`;
  const alt = buildPublicLocaleAlternates(locale as Locale, pathnameEn);
  const title = page.meta_title?.trim() || page.title;
  const description = page.meta_description?.trim() || undefined;
  const openGraph = {
    title: page.og_title?.trim() || title,
    description: page.og_description?.trim() || description,
    ...(page.og_image_url ? { images: [{ url: page.og_image_url }] } : {}),
  };

  const canonical = page.canonical_url?.trim();
  const altLinks = alt.alternates ?? {};

  return {
    metadataBase: alt.metadataBase,
    title,
    description,
    robots: page.noindex ? { index: false, follow: true } : undefined,
    alternates: {
      canonical: canonical || altLinks.canonical,
      languages: altLinks.languages,
    },
    openGraph,
  };
}

export default async function CmsPublicPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug: slugParam } = await params;
  const slugPath = slugPathFromParams(slugParam);
  if (!slugPath) notFound();

  const locale = await getRequestLocale();
  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();

  const publicScope = await getPublicTenantScope();
  if (!publicScope) notFound();

  // P4-SEO — one structured-data read shared by every render branch below.
  const jsonLdScript = await loadPageJsonLdScript(
    supabase,
    publicScope.tenantId,
    locale,
    slugPath,
  );

  // Phase C — workspace_pages check. Agency hosts can publish pages via the
  // page builder. Check workspace_pages first when on an agency host.
  if (publicScope && slugPath) {
    const { data: wpPage } = await supabase
      .from("workspace_pages")
      .select("id, title, blocks, theme")
      .eq("tenant_id", publicScope.tenantId)
      .eq("slug", slugPath)
      .eq("status", "published")
      .maybeSingle();
    if (wpPage) {
      const theme = (wpPage.theme ?? {}) as PageTheme;
      return (
        <main
          style={{
            minHeight: "100vh",
            backgroundColor: theme.backgroundColor ?? "#fff",
            color: theme.fontColor ?? "inherit",
            fontFamily: theme.fontFamily ?? "inherit",
          }}
        >
          <JsonLdScript script={jsonLdScript} />
          <BlocksRenderer
            blocks={(wpPage.blocks ?? []) as PageBlock[]}
            tenantId={publicScope.tenantId}
          />
        </main>
      );
    }
  }

  // Phase 7 — section-composed snapshot (draft-first while edit/preview).
  // Empty slot arrays still render through HomepageCmsSections so brand-new
  // draft pages do not fall through to `cms_public_pages_for_tenant` (published-only).
  const sectionPage = await loadPageForRender(publicScope.tenantId, locale as Locale, slugPath);
  if (sectionPage?.snapshot) {
    return (
      <>
        <JsonLdScript script={jsonLdScript} />
        <PublicHeader />
        <main className="w-full flex-1">
          <HomepageCmsSections
            snapshot={sectionPage.snapshot}
            tenantId={publicScope.tenantId}
            locale={locale}
          />
        </main>
        <footer className="border-t border-border px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            <PublicCmsFooterNav locale={locale} />
          </div>
        </footer>
      </>
    );
  }

  const { data } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select("title,body,template_key")
    .eq("locale", locale)
    .eq("slug", slugPath)
    .maybeSingle();

  if (!data) notFound();

  return (
    <>
      <JsonLdScript script={jsonLdScript} />
      <PublicHeader />
      <main className="w-full flex-1 px-4 py-16 sm:px-6 lg:px-8">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-normal tracking-wide text-foreground">{data.title}</h1>
          <div className="prose prose-neutral mt-8 max-w-none dark:prose-invert">
            {data.body ? (
              <div className="whitespace-pre-wrap text-muted-foreground">{data.body}</div>
            ) : (
              <p className="text-muted-foreground">No body content yet.</p>
            )}
          </div>
        </article>
      </main>
      <footer className="border-t border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center text-sm text-muted-foreground">
          <PublicCmsFooterNav locale={locale} />
        </div>
      </footer>
    </>
  );
}
