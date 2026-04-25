"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { InspectorContext } from "@/lib/admin/admin-inspector/types";
import { isUuidPathSegment } from "@/lib/admin/admin-inspector/context";
import { Button } from "@/components/ui/button";
import { buildPostPublicPathname, buildPublicPathname } from "@/lib/cms/paths";
import type { Locale } from "@/i18n/config";

type CmsPayload =
  | {
      kind: "page";
      id: string;
      slug: string;
      locale: string;
      status: string;
      title: string;
      meta_title: string | null;
      meta_description: string | null;
      noindex: boolean;
      include_in_sitemap: boolean;
      canonical_url: string | null;
      revision_count: number;
    }
  | {
      kind: "post";
      id: string;
      slug: string;
      locale: string;
      status: string;
      title: string;
      meta_title: string | null;
      meta_description: string | null;
      noindex: boolean;
      revision_count: number;
    };

function parseCmsEditor(pathname: string): { kind: "page" | "post"; segment: string } | null {
  const pagePrefix = "/admin/site-settings/content/pages/";
  const postPrefix = "/admin/site-settings/content/posts/";
  if (pathname.startsWith(pagePrefix)) {
    const seg = pathname.slice(pagePrefix.length);
    if (!seg || seg.includes("/")) return null;
    return { kind: "page", segment: seg };
  }
  if (pathname.startsWith(postPrefix)) {
    const seg = pathname.slice(postPrefix.length);
    if (!seg || seg.includes("/")) return null;
    return { kind: "post", segment: seg };
  }
  return null;
}

export function CmsEditorSeoModule({ ctx }: { ctx: InspectorContext }) {
  const parsed = parseCmsEditor(ctx.pathname);
  const [data, setData] = useState<CmsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const id =
    parsed && parsed.segment !== "new" && isUuidPathSegment(parsed.segment) ? parsed.segment : null;

  useEffect(() => {
    if (!parsed || !id) {
      setData(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/admin/inspector/cms?kind=${parsed.kind}&id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = (await r.json()) as CmsPayload & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, parsed]);

  if (!parsed) return null;

  if (parsed.segment === "new") {
    return (
      <ul className="list-inside list-disc space-y-1 text-xs text-[var(--admin-nav-idle)]">
        <li>Set title and slug before publishing — slug defines the public URL.</li>
        <li>Add meta title and description in the SEO block; keep descriptions under ~160 characters for snippets.</li>
        <li>Enable noindex only for drafts or internal landing tests.</li>
      </ul>
    );
  }

  if (!id) return null;
  if (err) return <p className="text-xs text-destructive">{err}</p>;
  if (!data) return <p className="text-xs text-[var(--admin-nav-idle)]">Loading CMS snapshot…</p>;

  const checks: { ok: boolean; label: string }[] = [
    { ok: Boolean(data.meta_title?.trim()), label: "Meta title set" },
    { ok: Boolean(data.meta_description?.trim()), label: "Meta description set" },
    { ok: !data.noindex || data.status !== "published", label: "Noindex aligned with intent" },
  ];

  const publicPath =
    data.kind === "page"
      ? buildPublicPathname(data.locale as Locale, data.slug)
      : buildPostPublicPathname(data.locale as Locale, data.slug);

  return (
    <div className="space-y-2 text-xs">
      <p className="text-[var(--admin-workspace-fg)]">{data.title}</p>
      <p className="font-mono text-[11px] text-[var(--admin-nav-idle)]">{publicPath}</p>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li
            key={c.label}
            className={c.ok ? "text-foreground" : "text-muted-foreground"}
          >
            {c.ok ? "✓" : "•"} {c.label}
          </li>
        ))}
      </ul>
      {data.kind === "page" && data.status === "published" ? (
        <p className="text-[var(--admin-nav-idle)]">
          Changing locale or slug on a published page can create redirect prompts in the editor — confirm before saving.
        </p>
      ) : null}
    </div>
  );
}

export function CmsRevisionShortcutModule({ ctx }: { ctx: InspectorContext }) {
  const parsed = parseCmsEditor(ctx.pathname);
  if (!parsed || parsed.segment === "new") return null;
  if (!isUuidPathSegment(parsed.segment)) return null;

  return (
    <p className="text-xs text-[var(--admin-nav-idle)]">
      Revisions and restore points live in the editor card on this page — scroll to{" "}
      <span className="text-[var(--admin-workspace-fg)]">Versions</span> inside the form.
    </p>
  );
}

export function CmsSlugRedirectModule({ ctx }: { ctx: InspectorContext }) {
  const parsed = parseCmsEditor(ctx.pathname);
  if (!parsed || parsed.segment === "new") return null;
  if (!isUuidPathSegment(parsed.segment)) return null;

  return (
    <div className="space-y-2 text-xs text-[var(--admin-nav-idle)]">
      <p>If you retire a public URL, add a redirect in Site → Content → Redirects so external links do not 404.</p>
      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-border/60 text-xs">
        <Link href="/admin/site-settings/content/redirects" scroll={false}>
          Open redirects
        </Link>
      </Button>
    </div>
  );
}
