import { redirect } from "next/navigation";
import { ArrowUpRight, UserCircle } from "lucide-react";

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
          icon={UserCircle}
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
        "id, field_group_id, key, label_en, required_level, value_type, public_visible, profile_visible, card_visible, filterable, searchable, ai_visible, archived_at",
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
          icon={UserCircle}
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
    value_type: (f.value_type as string | null) ?? null,
    public_visible: Boolean(f.public_visible ?? true),
    profile_visible: Boolean(f.profile_visible ?? true),
    card_visible: Boolean(f.card_visible ?? false),
    filterable: Boolean(f.filterable ?? false),
    searchable: Boolean(f.searchable ?? false),
    ai_visible: Boolean(f.ai_visible ?? true),
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
          icon={UserCircle}
          title="Profile settings"
          description="What each profile holds, and the pick-lists it uses."
          right={
            <a
              href="/register/talent"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(24,24,27,0.18)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-foreground shadow-sm transition-colors hover:border-[rgba(201,162,39,0.4)] hover:bg-[rgba(201,162,39,0.06)]"
            >
              Preview registration form
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
          }
        />
      <ProfileShell groups={groups} fields={fields} terms={terms} />
    </div>
  );
}
