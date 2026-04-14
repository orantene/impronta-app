import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import type { FieldDefinitionRow, FieldGroupRow } from "./field-group-panel";
import { AdminFieldsClient } from "./admin-fields-client";
import { HelpTip } from "@/components/ui/help-tip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, LayoutList } from "lucide-react";
import {
  ADMIN_GROUP_LIST_STAGE,
  ADMIN_HELP_TRIGGER_BUTTON,
  ADMIN_PAGE_STACK,
  ADMIN_POPOVER_CONTENT_CLASS,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { AdminAddGroupForm } from "./admin-add-group-form";
import { ensureBasicInfoCanonicalMirrors } from "@/lib/fields/ensure-basic-info-canonical-mirrors";

type RawFieldRow = FieldDefinitionRow & { field_group_id: string | null };

function isMissingPreviewVisibleColumn(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("preview_visible");
}

function isMissingDirectoryFilterVisibleColumn(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("directory_filter_visible");
}

export default async function AdminFieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  const groupsPromise = supabase
    .from("field_groups")
    .select("id, slug, name_en, name_es, sort_order, archived_at")
    .is("archived_at", null)
    .order("sort_order");

  await ensureBasicInfoCanonicalMirrors(supabase);

  const fieldsPromise = supabase
    .from("field_definitions")
    .select(
      "id, field_group_id, key, label_en, label_es, help_en, help_es, value_type, required_level, public_visible, internal_only, card_visible, preview_visible, profile_visible, filterable, directory_filter_visible, searchable, ai_visible, editable_by_talent, editable_by_staff, editable_by_admin, active, sort_order, taxonomy_kind, archived_at",
    )
    .is("archived_at", null)
    .order("field_group_id")
    .order("sort_order");

  const [{ data: groups, error: gErr }, initialFields] = await Promise.all([
    groupsPromise,
    fieldsPromise,
  ]);

  let fields = initialFields.data;
  let fErr = initialFields.error;
  let previewVisibilityFallback = false;

  if (isMissingPreviewVisibleColumn(fErr) || isMissingDirectoryFilterVisibleColumn(fErr)) {
    // Compatibility: older DBs may omit `preview_visible` or `directory_filter_visible`.
    previewVisibilityFallback = isMissingPreviewVisibleColumn(fErr);
    const fallbackFields = await supabase
      .from("field_definitions")
      .select(
        "id, field_group_id, key, label_en, label_es, help_en, help_es, value_type, required_level, public_visible, internal_only, card_visible, profile_visible, filterable, searchable, ai_visible, editable_by_talent, editable_by_staff, editable_by_admin, active, sort_order, taxonomy_kind, archived_at",
      )
      .is("archived_at", null)
      .order("field_group_id")
      .order("sort_order");
    fields = (fallbackFields.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      // Reduced select omits preview_visible + directory_filter_visible — derive from legacy columns.
      return {
        ...row,
        preview_visible: Boolean((r.profile_visible as boolean | undefined) ?? true),
        directory_filter_visible: Boolean(r.filterable === true),
      };
    });
    fErr = fallbackFields.error;
  }

  if (gErr || fErr) {
    if (gErr) logServerError("admin/fields/groups", gErr);
    if (fErr) logServerError("admin/fields/fields", fErr);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  const groupRows = (groups ?? []) as FieldGroupRow[];
  const fieldRows = (fields ?? []) as RawFieldRow[];

  const fieldsByGroup = new Map<string, FieldDefinitionRow[]>();
  for (const f of fieldRows) {
    const gid = f.field_group_id ?? "ungrouped";
    const arr = fieldsByGroup.get(gid) ?? [];
    // strip field_group_id for client type
    const rest: FieldDefinitionRow = {
      id: f.id,
      key: f.key,
      label_en: f.label_en,
      label_es: f.label_es,
      value_type: f.value_type,
      required_level: f.required_level,
      public_visible: f.public_visible,
      internal_only: f.internal_only,
      card_visible: f.card_visible,
      preview_visible: f.preview_visible,
      profile_visible: f.profile_visible,
      filterable: f.filterable,
      directory_filter_visible: Boolean(
        (f as { directory_filter_visible?: boolean | null }).directory_filter_visible ?? false,
      ),
      searchable: f.searchable,
      ai_visible: f.ai_visible,
      editable_by_talent: f.editable_by_talent,
      editable_by_staff: f.editable_by_staff,
      editable_by_admin: f.editable_by_admin,
      active: f.active,
      sort_order: f.sort_order,
      taxonomy_kind: f.taxonomy_kind,
      archived_at: f.archived_at,
    };
    // Preserve sheet-only fields on the object for the client sheet.
    (rest as unknown as { field_group_id?: string | null }).field_group_id = f.field_group_id ?? null;
    (rest as unknown as { help_en?: string | null }).help_en = (f as { help_en?: string | null }).help_en ?? null;
    (rest as unknown as { help_es?: string | null }).help_es = (f as { help_es?: string | null }).help_es ?? null;
    arr.push(rest);
    fieldsByGroup.set(gid, arr);
  }

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={LayoutList}
        title="Fields"
        description="Each field has labeled toggles: public, profile, card, preview, filters, search, and AI. Tooltips explain how each flag flows to the directory, classic search, and AI document."
        right={
          <Popover>
            <PopoverTrigger
              type="button"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                ADMIN_HELP_TRIGGER_BUTTON,
              )}
            >
              <Info className="size-4 text-[var(--impronta-gold)]" aria-hidden />
              How it works
            </PopoverTrigger>
            <PopoverContent align="end" className={ADMIN_POPOVER_CONTENT_CLASS}>
              <div className="space-y-2">
                <p className="font-display text-sm font-medium text-foreground">How fields behave</p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">Visibility stack:</span> public exposure (eye) →
                    profile page (person) → directory card traits (grid). All three apply to fit-label chips and
                    other card traits (see{" "}
                    <span className="font-mono text-[11px]">directory-card-display-catalog.ts</span>).
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Filters</span> toggles whether the field is
                    eligible for the public directory sidebar and listed under{" "}
                    <span className="font-medium text-foreground">Directory → Directory filters</span> for ordering and
                    visibility. Facet UI depends on value type (taxonomy, location, boolean, text options, etc.).
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Search</span> adds{" "}
                    <span className="font-mono text-[11px]">field_values</span> text/textarea hits for public +
                    profile-visible fields; names, bio, taxonomy, and cities use other search paths.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">AI</span> includes the field in the AI search
                    document for semantic / vector search when data exists.
                  </li>
                  <li>Archive fields instead of deleting to preserve history.</li>
                  <li>Reorder controls grouping in admin and profile editors.</li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
        }
      />

      {previewVisibilityFallback ? (
        <DashboardSectionCard
          title="Compatibility mode"
          description="The current database is missing the newer preview-visibility column."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            This page is using `profile_visible` as a safe fallback for preview visibility so the Fields tab stays operational.
            Apply `20260409103000_field_preview_visibility_and_submission_snapshots.sql` to restore the full controls.
          </p>
        </DashboardSectionCard>
      ) : null}

      <section id="add-group" className="scroll-mt-28">
        <DashboardSectionCard
          title="Add group"
          description="Groups define sections in talent profile. Reorder controls scan rhythm."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
          right={<HelpTip content="Groups define sections in talent profile. Reorder controls scan rhythm." />}
        >
          <AdminAddGroupForm />
        </DashboardSectionCard>
      </section>

      {groupRows.length === 0 ? (
        <DashboardEmptyState
          title="No field groups yet"
          description="Create a field group to organize profile, card, filter, and workflow fields."
        />
      ) : (
        <section id="groups-and-fields" className="scroll-mt-28">
          <div className={ADMIN_GROUP_LIST_STAGE}>
            <Suspense
              fallback={
                <div className="h-96 animate-pulse rounded-2xl bg-muted/20" aria-hidden />
              }
            >
              <AdminFieldsClient
                groups={groupRows}
                fieldsByGroup={groupRows.map((g) => ({
                  groupId: g.id,
                  fields: fieldsByGroup.get(g.id) ?? [],
                }))}
                initialEditFieldId={edit ?? null}
              />
            </Suspense>
          </div>
        </section>
      )}
    </div>
  );
}
