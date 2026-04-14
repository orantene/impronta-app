"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import type { CmsRevisionListItem } from "@/app/(dashboard)/admin/site-settings/content/cms-revision-actions";
import { CmsPostRevisionsPanel } from "@/components/cms/cms-post-revisions-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildPostPublicPathname } from "@/lib/cms/paths";
import type { CmsPostSnapshot } from "@/lib/cms/revision-snapshots";
import type { Locale } from "@/i18n/config";

import { deleteCmsPost, saveCmsPost, type CmsPostRow } from "./actions";

type Props = {
  initial: CmsPostRow | null;
  revisions: CmsRevisionListItem[];
};

export function CmsPostForm({ initial, revisions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [locale, setLocale] = useState<Locale>((initial?.locale as Locale) ?? "en");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [metaTitle, setMetaTitle] = useState(initial?.meta_title ?? "");
  const [metaDescription, setMetaDescription] = useState(initial?.meta_description ?? "");
  const [ogImageUrl, setOgImageUrl] = useState(initial?.og_image_url ?? "");
  const [noindex, setNoindex] = useState(initial?.noindex ?? false);
  const [includeInSitemap, setIncludeInSitemap] = useState(
    initial?.include_in_sitemap ?? true,
  );
  const [createSlugRedirect, setCreateSlugRedirect] = useState(true);
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

  const previewUrl = useMemo(() => buildPostPublicPathname(locale, slug), [locale, slug]);

  const applySnapshot = useCallback((s: CmsPostSnapshot) => {
    setLocale(s.locale);
    setSlug(s.slug);
    setTitle(s.title);
    setStatus(s.status);
    setExcerpt(s.excerpt);
    setBody(s.body);
    setMetaTitle(s.meta_title ?? "");
    setMetaDescription(s.meta_description ?? "");
    setOgImageUrl(s.og_image_url ?? "");
    setNoindex(s.noindex);
    setIncludeInSitemap(s.include_in_sitemap);
    setCreateSlugRedirect(true);
  }, []);

  useEffect(() => {
    if (!restoreUrlMismatchHint) return;
    if (buildPostPublicPathname(locale, slug) === buildPostPublicPathname(initialLocale, initialSlug)) {
      setRestoreUrlMismatchHint(null);
    }
  }, [locale, slug, initialLocale, initialSlug, restoreUrlMismatchHint]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveCmsPost({
        id: initial?.id,
        locale,
        slug,
        title,
        status,
        excerpt,
        body,
        meta_title: metaTitle || null,
        meta_description: metaDescription || null,
        og_image_url: ogImageUrl || null,
        noindex,
        include_in_sitemap: includeInSitemap,
        create_slug_redirect: createSlugRedirect,
        previous_slug: initialSlug || null,
        previous_locale: initial?.id ? initialLocale : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!initial?.id) {
        router.replace(`/admin/site-settings/content/posts/${res.id}`);
      } else {
        router.refresh();
      }
    });
  }

  function remove() {
    if (!initial?.id) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCmsPost(initial.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/admin/site-settings/content/posts");
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
            Live post: <span className="font-mono text-foreground">{restoreUrlMismatchHint.fromPath}</span>
            {" → "}
            restored target: <span className="font-mono text-foreground">{restoreUrlMismatchHint.toPath}</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Saving as <strong>published</strong> changes the live URL. Enable the redirect option below to add a 301.
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
          <Label htmlFor="post-title">Title</Label>
          <Input
            id="post-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="post-slug">Slug</Label>
          <Input
            id="post-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Public URL when published: <span className="font-mono">{previewUrl}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="post-locale">Locale</Label>
          <select
            id="post-locale"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="post-status">Status</Label>
          <select
            id="post-status"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            id="post-redirect"
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-input"
            checked={createSlugRedirect}
            onChange={(e) => setCreateSlugRedirect(e.target.checked)}
          />
          <div className="space-y-1">
            <Label htmlFor="post-redirect" className="font-medium text-foreground">
              Create 301 redirect from previous public URL
            </Label>
            <p className="text-xs text-muted-foreground">
              From <span className="font-mono">{buildPostPublicPathname(initialLocale, initialSlug)}</span> to{" "}
              <span className="font-mono">{previewUrl}</span>
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="post-excerpt">Excerpt</Label>
        <Textarea
          id="post-excerpt"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="post-body">Body</Label>
        <Textarea
          id="post-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="font-mono text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="post-meta-title">Meta title</Label>
          <Input
            id="post-meta-title"
            value={metaTitle}
            onChange={(e) => setMetaTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="post-og">OG image URL</Label>
          <Input
            id="post-og"
            value={ogImageUrl}
            onChange={(e) => setOgImageUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="post-meta-desc">Meta description</Label>
        <Textarea
          id="post-meta-desc"
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={noindex}
            onChange={(e) => setNoindex(e.target.checked)}
          />
          No index
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeInSitemap}
            onChange={(e) => setIncludeInSitemap(e.target.checked)}
          />
          Include in sitemap
        </label>
      </div>

      {initial?.id ? (
        <CmsPostRevisionsPanel
          postId={initial.id}
          liveSlug={initialSlug}
          liveLocale={initialLocale}
          items={revisions}
          applySnapshot={applySnapshot}
          onPublicUrlMismatch={setRestoreUrlMismatchHint}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save post"}
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
