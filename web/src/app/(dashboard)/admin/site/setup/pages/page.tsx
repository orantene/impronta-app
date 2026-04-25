import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, FileText, Plus } from "lucide-react";

import {
  SetupPage,
  SetupSection,
} from "@/components/admin/setup/setup-page";
import { buildPublicPathname } from "@/lib/cms/paths";
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
  is_system_owned: boolean | null;
};

/**
 * /admin/site/setup/pages — Pages setup surface.
 *
 * Lists every CMS page on the workspace under premium chrome and routes
 * each row to the existing per-page editor. The system-owned homepage row
 * is excluded — it has its own setup step at /admin/site/setup/homepage.
 */
export default async function SiteSetupPagesPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin?err=no_tenant");

  const tenantId = scope.tenantId;

  const { data, error } = await auth.supabase
    .from("cms_pages")
    .select("id,locale,slug,title,status,updated_at,is_system_owned")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  const rows = (data ?? [])
    .filter((r) => !r.is_system_owned) as Row[];

  const drafts = rows.filter((r) => r.status !== "published").length;
  const published = rows.filter((r) => r.status === "published").length;

  return (
    <SetupPage
      eyebrow="SETUP · STEP 2"
      title="Pages"
      icon={FileText}
      description={
        <>
          About, Services, Contact — anything that lives at a clean URL on
          your site. Public pages are served at{" "}
          <span className="font-mono">/p/&hellip;</span> (English) and{" "}
          <span className="font-mono">/es/p/&hellip;</span> (Spanish).
        </>
      }
      backHref="/admin/site/setup"
      backLabel="Back to Setup"
      headerExtras={
        <Link
          href="/admin/site-settings/content/pages/new"
          className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(20,20,24,0.16)] bg-white px-2.5 py-1 text-[12px] font-semibold text-foreground/90 transition-colors hover:border-[rgba(201,162,39,0.55)] hover:bg-[rgba(255,253,246,1)]"
        >
          <Plus className="size-3" aria-hidden />
          New page
        </Link>
      }
    >
      <SetupSection
        label="All pages"
        helper={`${published} published · ${drafts} draft`}
      >
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/[0.05] px-3 py-2 text-[12.5px] text-destructive">
            Couldn&rsquo;t load pages. Try again or open the legacy editor.
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[rgba(20,20,24,0.16)] bg-white px-6 py-12 text-center">
            <FileText
              className="mx-auto size-6 text-muted-foreground/70"
              aria-hidden
            />
            <p className="mt-3 text-[14px] font-semibold text-foreground">
              No pages yet
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Create a page to publish marketing or legal content under{" "}
              <span className="font-mono">/p/&hellip;</span>
            </p>
            <Link
              href="/admin/site-settings/content/pages/new"
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              <Plus className="size-3" aria-hidden />
              Create first page
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
                        href={`/admin/site-settings/content/pages/${r.id}`}
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
                        ? buildPublicPathname(r.locale as Locale, r.slug)
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
                        href={`/admin/site-settings/content/pages/${r.id}`}
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
