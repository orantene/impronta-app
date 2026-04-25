import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Hash,
  LayoutList,
  ListOrdered,
  Tags,
  UserCog,
} from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  AdminSurfaceCard,
  AdminSurfaceCardBody,
} from "@/components/admin/admin-surface-card";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { requireStaff } from "@/lib/server/action-guards";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * /admin/profile — Profile settings.
 *
 * Index of what each talent profile holds (field groups) and the
 * pick-lists those fields choose from (taxonomies). Replaces the long
 * /admin/fields + /admin/taxonomy split as the entry point — those routes
 * remain as the deep editors; this page is the dashboard above them.
 *
 * Cards are tile-grid AdminSurfaceCards. Click drills into the existing
 * editors (with #anchor for instant scroll).
 */

const TAXONOMY_LABEL: Record<string, string> = {
  talent_type: "Talent types",
  tag: "Tags",
  skill: "Skills",
  industry: "Industries",
  event_type: "Event types",
  fit_label: "Fit labels",
  language: "Languages",
  location_country: "Countries (synced)",
  location_city: "Cities (synced)",
};

const TAXONOMY_ORDER = [
  "talent_type",
  "tag",
  "skill",
  "industry",
  "event_type",
  "fit_label",
  "language",
  "location_country",
  "location_city",
];

const SYNCED_KINDS = new Set(["location_country", "location_city"]);

export default async function AdminProfileSettingsPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return (
      <div className={ADMIN_PAGE_STACK}>
        <AdminPageHeader
          icon={UserCog}
          eyebrow="Site & AI"
          title="Profile settings"
          description="Supabase not configured."
        />
      </div>
    );
  }

  const [groupsRes, fieldsRes, termsRes] = await Promise.all([
    supabase
      .from("field_groups")
      .select("id, slug, name_en, name_es, sort_order, archived_at")
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("field_definitions")
      .select("id, field_group_id, required_level, archived_at")
      .is("archived_at", null),
    supabase
      .from("taxonomy_terms")
      .select("id, kind, archived_at")
      .is("archived_at", null),
  ]);

  if (groupsRes.error || fieldsRes.error || termsRes.error) {
    if (groupsRes.error) logServerError("admin/profile/groups", groupsRes.error);
    if (fieldsRes.error) logServerError("admin/profile/fields", fieldsRes.error);
    if (termsRes.error) logServerError("admin/profile/terms", termsRes.error);
    return (
      <div className={ADMIN_PAGE_STACK}>
        <AdminPageHeader
          icon={UserCog}
          eyebrow="Site & AI"
          title="Profile settings"
        />
        <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>
      </div>
    );
  }

  const groups = groupsRes.data ?? [];
  const fields = fieldsRes.data ?? [];
  const terms = termsRes.data ?? [];

  // Aggregate fields per group + required count.
  const fieldsByGroup = new Map<string, { total: number; required: number }>();
  for (const f of fields) {
    const gid = f.field_group_id ?? "ungrouped";
    const cur = fieldsByGroup.get(gid) ?? { total: 0, required: 0 };
    cur.total += 1;
    if (f.required_level && f.required_level !== "none") cur.required += 1;
    fieldsByGroup.set(gid, cur);
  }

  // Aggregate terms per kind.
  const termsByKind = new Map<string, number>();
  for (const t of terms) {
    termsByKind.set(t.kind, (termsByKind.get(t.kind) ?? 0) + 1);
  }

  const totalFields = fields.length;
  const totalRequired = fields.filter(
    (f) => f.required_level && f.required_level !== "none",
  ).length;
  const totalTerms = terms.length;
  const userKinds = TAXONOMY_ORDER.filter((k) => !SYNCED_KINDS.has(k));

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={UserCog}
        eyebrow="Site & AI"
        title="Profile settings"
        description="What each talent profile holds, and the pick-lists those fields choose from. Open a tile to edit fields or terms inside it."
        right={
          <a
            href="/register/talent"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3.5 py-1.5 text-[12px] font-semibold text-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/55 hover:bg-[var(--impronta-gold)]/[0.05]"
          >
            Preview registration form
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        }
      />

      {/* Profile structure — one tile per field group */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <span className="inline-flex items-center rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-background">
            Fields
          </span>
          <div className="min-w-0 flex-1">
            <h2 className={cn(ADMIN_SECTION_TITLE_CLASS, "text-[17px] sm:text-lg")}>
              Profile structure
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {groups.length} groups · {totalFields} fields · {totalRequired}{" "}
              required
            </p>
          </div>
          <a
            href="/admin/fields#add-group"
            className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11.5px] font-semibold text-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/55"
          >
            + New group
          </a>
          <div aria-hidden className="hidden h-px flex-1 bg-border/50 sm:block" />
        </div>
        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 bg-muted/[0.18] p-6 text-center text-sm text-muted-foreground">
            No field groups yet. Create one in Fields.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => {
              const counts = fieldsByGroup.get(g.id) ?? { total: 0, required: 0 };
              return (
                <AdminSurfaceCard
                  key={g.id}
                  variant="object"
                  href={`/admin/fields#group-${g.id}`}
                >
                  <AdminSurfaceCardBody>
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-foreground">
                        <LayoutList className="size-[18px]" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display text-[15px] font-semibold tracking-tight">
                          {g.name_en}
                        </h3>
                        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                          {counts.total} field{counts.total === 1 ? "" : "s"}
                          {counts.required > 0
                            ? ` · ${counts.required} required`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </AdminSurfaceCardBody>
                </AdminSurfaceCard>
              );
            })}
          </div>
        )}
      </section>

      {/* Lists — one tile per taxonomy kind */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <span className="inline-flex items-center rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-background">
            Lists
          </span>
          <div className="min-w-0 flex-1">
            <h2 className={cn(ADMIN_SECTION_TITLE_CLASS, "text-[17px] sm:text-lg")}>
              Tags, skills, industries — what fields choose from
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {userKinds.length} lists · {totalTerms} terms (plus countries +
              cities synced from Locations)
            </p>
          </div>
          <a
            href="/admin/taxonomy"
            className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11.5px] font-semibold text-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/55"
          >
            + New list
          </a>
          <div aria-hidden className="hidden h-px flex-1 bg-border/50 sm:block" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TAXONOMY_ORDER.map((kind) => {
            const count = termsByKind.get(kind) ?? 0;
            const synced = SYNCED_KINDS.has(kind);
            return (
              <AdminSurfaceCard
                key={kind}
                variant="object"
                href={`/admin/taxonomy?show=${kind}`}
              >
                <AdminSurfaceCardBody>
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-foreground">
                      {synced ? (
                        <Hash className="size-[18px]" aria-hidden />
                      ) : kind === "language" ? (
                        <ListOrdered className="size-[18px]" aria-hidden />
                      ) : (
                        <Tags className="size-[18px]" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-[15px] font-semibold tracking-tight">
                        {TAXONOMY_LABEL[kind] ?? kind}
                      </h3>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {count} term{count === 1 ? "" : "s"}
                        {synced ? " · synced" : ""}
                      </p>
                    </div>
                  </div>
                </AdminSurfaceCardBody>
              </AdminSurfaceCard>
            );
          })}
        </div>
      </section>
    </div>
  );
}
