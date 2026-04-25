import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Newspaper, Plus } from "lucide-react";

import {
  SetupPage,
  SetupSection,
} from "@/components/admin/setup/setup-page";
import { buildPostPublicPathname } from "@/lib/cms/paths";
import type { Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  updated_at: string;
};

/**
 * /admin/site/setup/posts — editorial posts setup surface.
 *
 * Same chrome + table treatment as `/setup/pages`, scoped to the cms_posts
 * table. Posts feed `/posts/...` (English) and `/es/posts/...` (Spanish).
 */
export default async function SiteSetupPostsPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin?err=no_tenant");

  const tenantId = scope.tenantId;

  const { data, error } = await auth.supabase
    .from("cms_posts")
    .select("id,locale,slug,title,status,updated_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  const rows = (data ?? []) as Row[];
  const drafts = rows.filter((r) => r.status !== "published").length;
  const published = rows.filter((r) => r.status === "published").length;

  return (
    <SetupPage
      eyebrow="SETUP · STEP 3"
      title="Posts"
      icon={Newspaper}
      description={
        <>
          Editorial articles, runway recaps, news. Posts ship at{" "}
          <span className="font-mono">/posts/&hellip;</span> with their own
          index page, RSS feed, and SEO meta. Publish one to test the loop.
        </>
      }
      backHref="/admin/site/setup"
      backLabel="Back to Setup"
      headerExtras={
        <Link
          href="/admin/site-settings/content/posts/new"
          className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(20,20,24,0.16)] bg-white px-2.5 py-1 text-[12px] font-semibold text-foreground/90 transition-colors hover:border-[rgba(201,162,39,0.55)] hover:bg-[rgba(255,253,246,1)]"
        >
          <Plus className="size-3" aria-hidden />
          Write post
        </Link>
      }
    >
      <SetupSection
        label="All posts"
        helper={`${published} published · ${drafts} draft`}
      >
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/[0.05] px-3 py-2 text-[12.5px] text-destructive">
            Couldn&rsquo;t load posts. Try again or open the legacy editor.
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[rgba(20,20,24,0.16)] bg-white px-6 py-12 text-center">
            <Newspaper
              className="mx-auto size-6 text-muted-foreground/70"
              aria-hidden
            />
            <p className="mt-3 text-[14px] font-semibold text-foreground">
              No posts yet
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Posts with a filled-in meta line rank ~3× higher in search.
            </p>
            <Link
              href="/admin/site-settings/content/posts/new"
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              <Plus className="size-3" aria-hidden />
              Write first post
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[rgba(20,20,24,0.10)] bg-white">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[rgba(20,20,24,0.08)] text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Locale</th>
                  <th className="px-4 py-2.5">Slug</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Updated</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[rgba(20,20,24,0.06)] transition-colors last:border-b-0 hover:bg-[rgba(255,253,246,0.6)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/site-settings/content/posts/${r.id}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                      {r.locale}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                      {r.status === "published"
                        ? buildPostPublicPathname(r.locale as Locale, r.slug)
                        : r.slug}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">
                      {new Date(r.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/site-settings/content/posts/${r.id}`}
                        className="inline-flex items-center gap-0.5 text-[12px] font-medium text-foreground/80 hover:text-foreground"
                      >
                        Edit
                        <ArrowUpRight className="size-3" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SetupSection>
    </SetupPage>
  );
}

function StatusPill({ status }: { status: string }) {
  const live = status === "published";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em]"
      style={
        live
          ? {
              backgroundColor: "rgba(20,107,58,0.10)",
              color: "#0e4a26",
            }
          : {
              backgroundColor: "rgba(201,162,39,0.14)",
              color: "#7a5d12",
            }
      }
    >
      {live ? "Live" : status}
    </span>
  );
}
