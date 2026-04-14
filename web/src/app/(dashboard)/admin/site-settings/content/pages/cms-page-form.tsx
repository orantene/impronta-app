"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import type { CmsRevisionListItem } from "@/app/(dashboard)/admin/site-settings/content/cms-revision-actions";
import { CmsPageRevisionsPanel } from "@/components/cms/cms-page-revisions-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";
import { Textarea } from "@/components/ui/textarea";
import { buildPublicPathname } from "@/lib/cms/paths";
import { normalizeHeroJson, type CmsPageSnapshot } from "@/lib/cms/revision-snapshots";
import type { Locale } from "@/i18n/config";

import { deleteCmsPage, saveCmsPage, type CmsPageRow } from "./actions";

const TEMPLATES = [
  { value: "standard_page", label: "Standard page" },
  { value: "landing_page", label: "Landing page" },
  { value: "route_backed_meta_only", label: "Route-backed (meta only)" },
  { value: "blog_post", label: "Blog post" },
  { value: "blog_index", label: "Blog index" },
] as const;

type Props = {
  initial: CmsPageRow | null;
  revisions: CmsRevisionListItem[];
};

export function CmsPageForm({ initial, revisions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [locale, setLocale] = useState<Locale>((initial?.locale as Locale) ?? "en");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [templateKey, setTemplateKey] = useState(initial?.template_key ?? "standard_page");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [body, setBody] = useState(initial?.body ?? "");
  const [metaTitle, setMetaTitle] = useState(initial?.meta_title ?? "");
  const [metaDescription, setMetaDescription] = useState(initial?.meta_description ?? "");
  const [ogTitle, setOgTitle] = useState(initial?.og_title ?? "");
  const [ogDescription, setOgDescription] = useState(initial?.og_description ?? "");
  const [ogImageUrl, setOgImageUrl] = useState(initial?.og_image_url ?? "");
  const [noindex, setNoindex] = useState(initial?.noindex ?? false);
  const [includeInSitemap, setIncludeInSitemap] = useState(initial?.include_in_sitemap ?? true);
  const [canonicalUrl, setCanonicalUrl] = useState(initial?.canonical_url ?? "");
  const [createSlugRedirect, setCreateSlugRedirect] = useState(true);
  const [hero, setHero] = useState<Record<string, unknown>>(() =>
    normalizeHeroJson(initial?.hero),
  );
  const [restoreUrlMismatchHint, setRestoreUrlMismatchHint] = useState<{
    fromPath: string;
    toPath: string;
  } | null>(null);

  const initialSlug = initial?.slug ?? "";
  const initialLocale = (initial?.locale as Locale) ?? "en";
  const publicPathChanged =
    slug.trim() !== initialSlug || locale !== initialLocale;
  const showRedirectHint =
    Boolean(initial?.id) &&
    status === "published" &&
    publicPathChanged &&
    initial?.status === "published";

  const previewUrl = useMemo(() => buildPublicPathname(locale, slug), [locale, slug]);

  const applySnapshot = useCallback((s: CmsPageSnapshot) => {
    setLocale(s.locale);
    setSlug(s.slug);
    setTemplateKey(s.template_key);
    setTitle(s.title);
    setStatus(s.status);
    setBody(s.body);
    setHero(s.hero);
    setMetaTitle(s.meta_title ?? "");
    setMetaDescription(s.meta_description ?? "");
    setOgTitle(s.og_title ?? "");
    setOgDescription(s.og_description ?? "");
    setOgImageUrl(s.og_image_url ?? "");
    setNoindex(s.noindex);
    setIncludeInSitemap(s.include_in_sitemap);
    setCanonicalUrl(s.canonical_url ?? "");
    setCreateSlugRedirect(true);
  }, []);

  useEffect(() => {
    if (!restoreUrlMismatchHint) return;
    if (buildPublicPathname(locale, slug) === buildPublicPathname(initialLocale, initialSlug)) {
      setRestoreUrlMismatchHint(null);
    }
  }, [locale, slug, initialLocale, initialSlug, restoreUrlMismatchHint]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveCmsPage({
        id: initial?.id,
        locale,
        slug,
        template_key: templateKey,
        title,
        status,
        body,
        hero,
        meta_title: metaTitle || null,
        meta_description: metaDescription || null,
        og_title: ogTitle || null,
        og_description: ogDescription || null,
        og_image_url: ogImageUrl || null,
        noindex,
        include_in_sitemap: includeInSitemap,
        canonical_url: canonicalUrl || null,
        create_slug_redirect: createSlugRedirect,
        previous_slug_path: initialSlug || null,
        previous_locale: initial?.id ? initialLocale : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!initial?.id) {
        router.replace(`/admin/site-settings/content/pages/${res.id}`);
      } else {
        router.refresh();
      }
    });
  }

  function remove() {
    if (!initial?.id) return;
    if (!window.confirm("Delete this page? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCmsPage(initial.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/admin/site-settings/content/pages");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {restoreUrlMismatchHint ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium text-foreground">Restored revision uses a different public URL</p>
          <p className="mt-1 text-muted-foreground">
            Live page: <span className="font-mono text-foreground">{restoreUrlMismatchHint.fromPath}</span>
            {" → "}
            restored target: <span className="font-mono text-foreground">{restoreUrlMismatchHint.toPath}</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Saving as <strong>published</strong> will change the live URL. Use the redirect checkbox below to add a
            301 from the old URL — do not skip this if the old URL is in use.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-8"
            onClick={() => setRestoreUrlMismatchHint(null)}
          >
            Dismiss notice
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cms-title">Title</Label>
          <Input
            id="cms-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cms-slug">Slug path</Label>
          <Input
            id="cms-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="about or legal/privacy"
            required
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Public URL: <span className="font-mono text-foreground">{previewUrl || "—"}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="cms-locale">Locale</Label>
          <select
            id="cms-locale"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cms-template">Template</Label>
          <select
            id="cms-template"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value)}
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cms-status">Status</Label>
          <select
            id="cms-status"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {showRedirectHint ? (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
          <input
            id="cms-redirect"
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-input"
            checked={createSlugRedirect}
            onChange={(e) => setCreateSlugRedirect(e.target.checked)}
          />
          <div className="space-y-1">
            <Label htmlFor="cms-redirect" className="font-medium text-foreground">
              Create 301 redirect from previous public URL
            </Label>
            <p className="text-xs text-muted-foreground">
              From <span className="font-mono">{buildPublicPathname(initialLocale, initialSlug)}</span> to{" "}
              <span className="font-mono">{previewUrl}</span>
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="cms-body">Body</Label>
        <Textarea
          id="cms-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 p-4">
        <SectionHeader
          title="Metadata & SEO"
          subtitle="Search and social previews for this page."
          className="!flex-col !items-stretch !gap-1 sm:!flex-col"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cms-meta-title">Meta title</Label>
            <Input id="cms-meta-title" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cms-canonical">Canonical URL (optional)</Label>
            <Input
              id="cms-canonical"
              value={canonicalUrl}
              onChange={(e) => setCanonicalUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cms-meta-desc">Meta description</Label>
          <Textarea
            id="cms-meta-desc"
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cms-og-title">OG title</Label>
            <Input id="cms-og-title" value={ogTitle} onChange={(e) => setOgTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cms-og-image">OG image URL</Label>
            <Input id="cms-og-image" value={ogImageUrl} onChange={(e) => setOgImageUrl(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cms-og-desc">OG description</Label>
          <Textarea
            id="cms-og-desc"
            value={ogDescription}
            onChange={(e) => setOgDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={noindex}
              onChange={(e) => setNoindex(e.target.checked)}
            />
            Noindex
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={includeInSitemap}
              onChange={(e) => setIncludeInSitemap(e.target.checked)}
            />
            Include in sitemap
          </label>
        </div>
      </div>

      {initial?.id ? (
        <CmsPageRevisionsPanel
          pageId={initial.id}
          liveSlug={initialSlug}
          liveLocale={initialLocale}
          items={revisions}
          applySnapshot={applySnapshot}
          onPublicUrlMismatch={setRestoreUrlMismatchHint}
        />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {initial?.id ? (
          <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
