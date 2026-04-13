import { TalentPageHeader } from "@/components/talent/talent-dashboard-primitives";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { getCachedDirectoryHeightFilterConfig } from "@/lib/directory/directory-filter-catalog";
import {
  DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY,
  fetchDirectorySidebarLayout,
  mergeSidebarItemOrder,
} from "@/lib/directory/directory-sidebar-layout";
import { isDirectoryFilterEligibleField } from "@/lib/directory/directory-filter-admin-eligibility";
import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { ListFilter } from "lucide-react";
import {
  AdminDirectoryFiltersClient,
  type DirectoryFilterAdminRow,
} from "./admin-directory-filters-client";

const FIELD_DEF_SELECT_FULL =
  "id, key, label_en, label_es, value_type, taxonomy_kind, directory_filter_visible, filterable";
const FIELD_DEF_SELECT_FALLBACK =
  "id, key, label_en, label_es, value_type, taxonomy_kind, filterable";

type FieldRow = {
  id: string;
  key: string;
  label_en: string;
  label_es: string | null;
  value_type: string;
  taxonomy_kind: string | null;
  directory_filter_visible?: boolean | null;
  filterable: boolean | null;
};

function isMissingDirectoryFilterVisibleColumn(err: { message?: string; code?: string } | null): boolean {
  const msg = `${err?.message ?? ""}`.toLowerCase();
  return (
    msg.includes("directory_filter_visible") ||
    (err?.code === "42703" && msg.includes("does not exist"))
  );
}

export default async function AdminDirectoryFiltersPage() {
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  const heightCatalog = await getCachedDirectoryHeightFilterConfig();

  const primaryFields = await supabase
    .from("field_definitions")
    .select(FIELD_DEF_SELECT_FULL)
    .eq("active", true)
    .is("archived_at", null)
    .eq("internal_only", false);

  let fieldsRaw: FieldRow[] | null = primaryFields.data as FieldRow[] | null;
  let fErr = primaryFields.error;

  let directoryFilterColumnMissing = false;
  if (fErr && isMissingDirectoryFilterVisibleColumn(fErr)) {
    directoryFilterColumnMissing = true;
    const retry = await supabase
      .from("field_definitions")
      .select(FIELD_DEF_SELECT_FALLBACK)
      .eq("active", true)
      .is("archived_at", null)
      .eq("internal_only", false);
    fieldsRaw = retry.data as FieldRow[] | null;
    fErr = retry.error;
  }

  if (fErr) {
    logServerError("admin/directory-filters/fields", fErr);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  const fields = (fieldsRaw ?? []) as FieldRow[];

  const facetFields = fields.filter((f) =>
    isDirectoryFilterEligibleField(
      { key: f.key, value_type: f.value_type, taxonomy_kind: f.taxonomy_kind },
      heightCatalog.enabled,
    ),
  );

  const facetKeys = facetFields.map((f) => f.key);

  const sidebarLayout = await fetchDirectorySidebarLayout(supabase);
  const savedOrder = sidebarLayout.item_order;

  const mergedOrder = mergeSidebarItemOrder(
    savedOrder.length > 0 ? savedOrder : [DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY],
    facetKeys,
  );

  const filterSearchVisible = sidebarLayout.filter_option_search_visible;
  const talentTypeTopBarVisible = sidebarLayout.talent_type_top_bar_visible;
  const initialSectionCollapsed: Record<string, boolean> = { ...sidebarLayout.section_collapsed_defaults };

  const rowsByKey: Record<string, DirectoryFilterAdminRow> = {
    [DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY]: {
      key: DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY,
      label: "Search filter labels",
      kind: "filter_search",
    },
  };

  const fieldVisibility: Record<string, boolean> = {};

  for (const f of facetFields) {
    const vis =
      f.directory_filter_visible !== undefined && f.directory_filter_visible !== null
        ? f.directory_filter_visible
        : f.filterable === true;
    fieldVisibility[f.key] = vis;
    rowsByKey[f.key] = {
      key: f.key,
      label: f.label_en,
      kind: "facet",
      valueType: f.value_type,
      taxonomyKind: f.taxonomy_kind,
    };
  }

  return (
    <div className={ADMIN_PAGE_STACK}>
      <TalentPageHeader
        icon={ListFilter}
        title="Directory filters"
        description="Control which facets appear in the public directory sidebar, and drag to set their order. This replaces the old “filterable” toggle on Fields."
      />

      {directoryFilterColumnMissing ? (
        <DashboardSectionCard
          title="Database migration needed"
          description="Your project is missing field_definitions.directory_filter_visible. Visibility here uses filterable until you apply the latest migrations."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            From the repo root run{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">npx supabase db push</code> (or apply{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              supabase/migrations/20260411230000_directory_sidebar_filter_layout.sql
            </code>
            ) so saves and the public directory can use the new column and sidebar layout table.
          </p>
        </DashboardSectionCard>
      ) : null}

      <DashboardSectionCard
        title="Sidebar layout"
        description="Order matches the public directory (desktop sidebar and mobile filter sheet). Visible off hides a block from visitors. Collapsed starts that facet closed until they expand it (not for search)."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <AdminDirectoryFiltersClient
          initialOrder={mergedOrder.filter((k) => rowsByKey[k])}
          initialFilterSearchVisible={filterSearchVisible}
          initialTalentTypeTopBarVisible={talentTypeTopBarVisible}
          initialFieldVisibility={fieldVisibility}
          initialSectionCollapsed={initialSectionCollapsed}
          rowsByKey={rowsByKey}
        />
      </DashboardSectionCard>
    </div>
  );
}
