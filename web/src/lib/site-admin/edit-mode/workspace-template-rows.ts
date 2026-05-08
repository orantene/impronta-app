import { getSectionMeta } from "@/lib/site-admin/sections/section-meta-registry";

export type WorkspaceTemplateVisibility = "private" | "platform" | "archived";

export interface WorkspaceTemplateSnapshotEntry {
  slotKey: string;
  sortOrder: number;
  sectionTypeKey: string;
  schemaVersion: number;
  name: string;
  props: Record<string, unknown>;
}

export interface WorkspaceTemplateSnapshot {
  version: 1;
  /** Tenant-agnostic — slot composition for the homepage at save-time. */
  slots: WorkspaceTemplateSnapshotEntry[];
  capturedAt: string;
}

export interface WorkspaceTemplateSectionSummary {
  slotKey: string;
  sortOrder: number;
  sectionTypeKey: string;
  label: string;
  categoryLabel: string;
  dataSourceLabel: string | null;
  name: string;
}

export type WorkspaceTemplateMode = "data-ready" | "starter";

export interface WorkspaceTemplateRow {
  id: string;
  name: string;
  description: string | null;
  visibility: WorkspaceTemplateVisibility;
  sectionCount: number;
  capturedAt: string | null;
  sections: ReadonlyArray<WorkspaceTemplateSectionSummary>;
  typeSummary: ReadonlyArray<string>;
  categorySummary: ReadonlyArray<string>;
  dataSourceSummary: ReadonlyArray<string>;
  mode: WorkspaceTemplateMode;
  createdAt: string;
  ownTenant: boolean;
}

export interface WorkspaceTemplateRecord {
  id: unknown;
  tenant_id: unknown;
  name: unknown;
  description: unknown;
  visibility: unknown;
  snapshot_jsonb: unknown;
  created_at: unknown;
}

function normalizeTemplateVisibility(value: unknown): WorkspaceTemplateVisibility {
  if (value === "platform" || value === "archived") return value;
  return "private";
}

function sectionCategoryLabel(value: string | undefined): string {
  switch (value) {
    case "hero":
      return "Hero";
    case "trust":
      return "Trust";
    case "showcase":
      return "Showcase";
    case "story":
      return "Story";
    case "convert":
      return "Convert";
    case "form":
      return "Form";
    case "embed":
      return "Embed";
    case "navigation":
      return "Navigation";
    default:
      return "Custom";
  }
}

function dataSourceLabelForSectionType(sectionTypeKey: string): string | null {
  switch (sectionTypeKey) {
    case "featured_talent":
      return "Talent profiles";
    case "category_grid":
      return "Directory taxonomy";
    case "map_overlay":
    case "destinations_mosaic":
      return "Talent locations";
    case "blog_index":
    case "blog_detail":
      return "Blog content";
    case "event_listing":
      return "Events";
    case "team_grid":
      return "Team profiles";
    default:
      return null;
  }
}

function normalizeSnapshotEntry(value: unknown): WorkspaceTemplateSectionSummary {
  const entry =
    value && typeof value === "object"
      ? (value as Partial<WorkspaceTemplateSnapshotEntry>)
      : {};
  const sectionTypeKey =
    typeof entry.sectionTypeKey === "string" && entry.sectionTypeKey.trim()
      ? entry.sectionTypeKey
      : "unknown";
  const meta = getSectionMeta(sectionTypeKey);
  const label = meta?.label ?? sectionTypeKey;
  return {
    slotKey:
      typeof entry.slotKey === "string" && entry.slotKey.trim()
        ? entry.slotKey
        : "body",
    sortOrder:
      typeof entry.sortOrder === "number" && Number.isFinite(entry.sortOrder)
        ? entry.sortOrder
        : 0,
    sectionTypeKey,
    label,
    categoryLabel: sectionCategoryLabel(meta?.category),
    dataSourceLabel: dataSourceLabelForSectionType(sectionTypeKey),
    name:
      typeof entry.name === "string" && entry.name.trim()
        ? entry.name
        : label,
  };
}

export function summarizeWorkspaceTemplateSections(
  snapshot: unknown,
): ReadonlyArray<WorkspaceTemplateSectionSummary> {
  const snap =
    snapshot && typeof snapshot === "object"
      ? (snapshot as Partial<WorkspaceTemplateSnapshot>)
      : {};
  const slots = Array.isArray(snap.slots) ? snap.slots : [];
  return slots.map(normalizeSnapshotEntry).sort((a, b) =>
    a.slotKey === b.slotKey
      ? a.sortOrder - b.sortOrder
      : a.slotKey.localeCompare(b.slotKey),
  );
}

export function summarizeWorkspaceTemplateTypes(
  sections: ReadonlyArray<Pick<WorkspaceTemplateSectionSummary, "label">>,
): ReadonlyArray<string> {
  return Array.from(new Set(sections.map((section) => section.label))).slice(
    0,
    5,
  );
}

export function summarizeWorkspaceTemplateCategories(
  sections: ReadonlyArray<Pick<WorkspaceTemplateSectionSummary, "categoryLabel">>,
): ReadonlyArray<string> {
  return Array.from(
    new Set(sections.map((section) => section.categoryLabel).filter(Boolean)),
  ).slice(0, 4);
}

export function summarizeWorkspaceTemplateDataSources(
  sections: ReadonlyArray<Pick<WorkspaceTemplateSectionSummary, "dataSourceLabel">>,
): ReadonlyArray<string> {
  return Array.from(
    new Set(
      sections
        .map((section) => section.dataSourceLabel)
        .filter((label): label is string => Boolean(label)),
    ),
  ).slice(0, 4);
}

export function buildWorkspaceTemplateRow(
  record: WorkspaceTemplateRecord,
  activeTenantId: string,
): WorkspaceTemplateRow {
  const snapshot =
    record.snapshot_jsonb && typeof record.snapshot_jsonb === "object"
      ? (record.snapshot_jsonb as Partial<WorkspaceTemplateSnapshot>)
      : {};
  const sections = summarizeWorkspaceTemplateSections(record.snapshot_jsonb);
  const dataSourceSummary = summarizeWorkspaceTemplateDataSources(sections);
  const name =
    typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : "Untitled template";
  const description =
    typeof record.description === "string" && record.description.trim()
      ? record.description.trim()
      : null;
  return {
    id: String(record.id ?? ""),
    name,
    description,
    visibility: normalizeTemplateVisibility(record.visibility),
    sectionCount: sections.length,
    capturedAt:
      typeof snapshot.capturedAt === "string" && snapshot.capturedAt.trim()
        ? snapshot.capturedAt
        : null,
    sections,
    typeSummary: summarizeWorkspaceTemplateTypes(sections),
    categorySummary: summarizeWorkspaceTemplateCategories(sections),
    dataSourceSummary,
    mode: dataSourceSummary.length > 0 ? "data-ready" : "starter",
    createdAt: String(record.created_at ?? ""),
    ownTenant: record.tenant_id === activeTenantId,
  };
}
