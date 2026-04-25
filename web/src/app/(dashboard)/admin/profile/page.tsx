import { redirect } from "next/navigation";
import { ArrowUpRight, UserCog } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ProfileShell } from "@/components/admin/profile-settings/profile-shell";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { requireStaff } from "@/lib/server/action-guards";

export const dynamic = "force-dynamic";

/**
 * /admin/profile — Profile settings.
 *
 * Index of what each talent profile holds (field groups) and the pick-lists
 * those fields choose from (taxonomies). Cards open right-side drawers
 * (drawer pattern from `docs/mockups/site-control-center.html`) — each
 * drawer contains the field rows / term rows for that group / kind, with a
 * quick-edit form per row. Deeper edits link out to /admin/fields and
 * /admin/taxonomy.
 */

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
      .select("id, slug, name_en, sort_order, archived_at")
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("field_definitions")
      .select(
        "id, field_group_id, key, label_en, required_level, field_type, visibility, archived_at",
      )
      .is("archived_at", null),
    supabase
      .from("taxonomy_terms")
      .select("id, kind, slug, name_en, archived_at")
      .is("archived_at", null)
      .order("name_en"),
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

  const groups = (groupsRes.data ?? []).map((g) => ({
    id: g.id as string,
    slug: g.slug as string,
    name_en: g.name_en as string,
  }));
  const fields = (fieldsRes.data ?? []).map((f) => ({
    id: f.id as string,
    field_group_id: (f.field_group_id as string | null) ?? null,
    key: (f.key as string) ?? "",
    label_en: (f.label_en as string) ?? "",
    required_level: (f.required_level as string | null) ?? null,
    field_type: (f.field_type as string | null) ?? null,
    visibility: (f.visibility as string | null) ?? null,
  }));
  const terms = (termsRes.data ?? []).map((t) => ({
    id: t.id as string,
    kind: t.kind as string,
    slug: (t.slug as string) ?? "",
    name_en: (t.name_en as string) ?? "",
  }));

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
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3.5 py-1.5 text-[12px] font-semibold text-foreground shadow-sm transition-colors hover:border-foreground/40 hover:bg-muted/30"
          >
            Preview registration form
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        }
      />
      <ProfileShell groups={groups} fields={fields} terms={terms} />
    </div>
  );
}
