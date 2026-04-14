import Link from "next/link";
import { FileText } from "lucide-react";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { buildPublicPathname } from "@/lib/cms/paths";
import type { Locale } from "@/i18n/config";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  updated_at: string;
};

export default async function CmsPagesListPage() {
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  const { data, error } = await supabase
    .from("cms_pages")
    .select("id,locale,slug,title,status,updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    logServerError("admin/cms-pages/list", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={ADMIN_SECTION_TITLE_CLASS}>Pages</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Published pages are served at <span className="font-mono">/p/…</span> (English) and{" "}
            <span className="font-mono">/es/p/…</span> (Spanish).
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/site-settings/content/pages/new">New page</Link>
        </Button>
      </div>

      <DashboardSectionCard title="All pages" description="Draft, published, and archived CMS entries." titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No pages yet"
            description="Create a page to publish marketing or legal content at /p/…"
          >
            <Button asChild>
              <Link href="/admin/site-settings/content/pages/new">New page</Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Title</th>
                  <th className="py-2 pr-4 font-medium">Locale</th>
                  <th className="py-2 pr-4 font-medium">Slug</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Public URL</th>
                  <th className="py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/admin/site-settings/content/pages/${r.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{r.locale}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.slug}</td>
                    <td className="py-2 pr-4 capitalize">{r.status}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {r.status === "published"
                        ? buildPublicPathname(r.locale as Locale, r.slug)
                        : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(r.updated_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardSectionCard>

      <p className="text-sm text-muted-foreground">
        <Link href="/admin/site-settings/content" className="text-primary underline-offset-4 hover:underline">
          ← Content hub
        </Link>
        {" · "}
        <Link
          href="/admin/site-settings/content/redirects"
          className="text-primary underline-offset-4 hover:underline"
        >
          Redirects
        </Link>
      </p>
    </div>
  );
}
