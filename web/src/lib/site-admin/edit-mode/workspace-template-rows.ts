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
  name: string;
}

export interface WorkspaceTemplateRow {
  id: string;
  name: string;
  description: string | null;
  visibility: WorkspaceTemplateVisibility;
  sectionCount: number;
  capturedAt: string | null;
  sections: ReadonlyArray<WorkspaceTemplateSectionSummary>;
  typeSummary: ReadonlyArray<string>;
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

function normalizeSnapshotEntry(value: unknown): WorkspaceTemplateSectionSummary {
  const entry =
    value && typeof value === "object"
      ? (value as Partial<WorkspaceTemplateSnapshotEntry>)
      : {};
  const sectionTypeKey =
    typeof entry.sectionTypeKey === "string" && entry.sectionTypeKey.trim()
      ? entry.sectionTypeKey
      : "unknown";
  const label = getSectionMeta(sectionTypeKey)?.label ?? sectionTypeKey;
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

export function buildWorkspaceTemplateRow(
  record: WorkspaceTemplateRecord,
  activeTenantId: string,
): WorkspaceTemplateRow {
  const snapshot =
    record.snapshot_jsonb && typeof record.snapshot_jsonb === "object"
      ? (record.snapshot_jsonb as Partial<WorkspaceTemplateSnapshot>)
      : {};
  const sections = summarizeWorkspaceTemplateSections(record.snapshot_jsonb);
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
    createdAt: String(record.created_at ?? ""),
    ownTenant: record.tenant_id === activeTenantId,
  };
}
