import Link from "next/link";
import { Search } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";
import { getCachedServerSupabase } from "@/lib/server/request-cache";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type LogRow = {
  id: string;
  created_at: string;
  raw_query: string | null;
  normalized_summary: string | null;
  taxonomy_term_ids: string[] | null;
  location_slug: string | null;
  height_min_cm: number | null;
  height_max_cm: number | null;
  locale: string | null;
  used_interpreter: boolean | null;
};

export default async function AiSearchLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string; cursor?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const localeFilter = sp.locale === "es" || sp.locale === "en" ? sp.locale : null;
  const cursor = sp.cursor?.trim() || null;

  const supabase = await getCachedServerSupabase();
  let rows: LogRow[] = [];
  let loadError: string | null = null;
  let nextCursor: string | null = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const profile = user ? await loadAccessProfile(supabase, user.id) : null;
    if (!user || !isStaffRole(profile?.app_role)) {
      loadError = "Search logs require an agency staff session.";
    } else {
      let q = supabase
        .from("ai_search_logs")
        .select(
          "id, created_at, raw_query, normalized_summary, taxonomy_term_ids, location_slug, height_min_cm, height_max_cm, locale, used_interpreter",
        )
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (localeFilter) {
        q = q.eq("locale", localeFilter);
      }
      if (cursor) {
        q = q.lt("created_at", cursor);
      }

      const { data, error } = await q;
      if (error) {
        loadError = error.message || "Could not load logs.";
      } else {
        const list = (data ?? []) as LogRow[];
        const hasMore = list.length > PAGE_SIZE;
        const page = hasMore ? list.slice(0, PAGE_SIZE) : list;
        rows = page;
        if (hasMore && page.length > 0) {
          nextCursor = page[page.length - 1]!.created_at;
        }
      }
    }
  } else {
    loadError = "Supabase not configured.";
  }

  const baseHref = "/admin/ai-workspace/logs";
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (localeFilter) p.set("locale", localeFilter);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `${baseHref}?${s}` : baseHref;
  };

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={Search}
        title="AI search logs"
        description="Interpret-search events (ai_search_logs). Inserts use the service role; staff can read via RLS."
      />

      <DashboardSectionCard
        title="Filters"
        description="Locale filter applies to the list below."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={baseHref}
            className={cnLink(!localeFilter)}
          >
            All locales
          </Link>
          <Link href={qs({ locale: "en" })} className={cnLink(localeFilter === "en")}>
            EN
          </Link>
          <Link href={qs({ locale: "es" })} className={cnLink(localeFilter === "es")}>
            ES
          </Link>
        </div>
      </DashboardSectionCard>

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : (
        <DashboardSectionCard
          title="Recent logs"
          description={`Up to ${PAGE_SIZE} rows per page (newest first).`}
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border/60 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Locale</th>
                  <th className="px-3 py-2">Interpreter</th>
                  <th className="px-3 py-2">Query</th>
                  <th className="px-3 py-2">Summary</th>
                  <th className="px-3 py-2">Height (cm)</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Taxonomy IDs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      No rows yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="align-top hover:bg-muted/10">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                        {new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19)}Z
                      </td>
                      <td className="px-3 py-2">{r.locale ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.used_interpreter === true ? "Yes" : r.used_interpreter === false ? "No" : "—"}
                      </td>
                      <td className="max-w-[200px] px-3 py-2">
                        <span className="line-clamp-3" title={r.raw_query ?? ""}>
                          {r.raw_query ?? "—"}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-3 py-2 text-muted-foreground">
                        {r.normalized_summary?.trim()
                          ? r.normalized_summary.trim().slice(0, 160)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                        {r.height_min_cm != null || r.height_max_cm != null
                          ? `${r.height_min_cm ?? "—"}–${r.height_max_cm ?? "—"}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.location_slug?.trim() || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {(r.taxonomy_term_ids ?? []).length
                          ? (r.taxonomy_term_ids ?? []).slice(0, 4).join(", ") +
                            ((r.taxonomy_term_ids ?? []).length > 4 ? "…" : "")
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {nextCursor ? (
            <p className="mt-4 text-sm">
              <Link
                href={qs({ locale: localeFilter ?? undefined, cursor: nextCursor })}
                className="text-primary hover:underline"
              >
                Older entries →
              </Link>
            </p>
          ) : null}
        </DashboardSectionCard>
      )}
    </div>
  );
}

function cnLink(active: boolean): string {
  return [
    "rounded-md border px-3 py-1.5 transition-colors",
    active
      ? "border-primary bg-primary/10 text-foreground"
      : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
  ].join(" ");
}
