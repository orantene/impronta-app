/**
 * Pure helpers + the EditDraft shape for the Site Starter Kit view, split out of
 * catalog-starter-kit.tsx to keep it under the 800-line max-lines cap. Shared by
 * SiteStarterKitView and the extracted StarterTable cluster (starter-kit-table.tsx).
 */
import type {
  BuilderTemplateRow,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import type { BuilderLabTarget } from "./builder-lab-stage";
import { getTemplatePreviewUrl } from "@/lib/site-admin/builder-core/templates/template-def";
import { LAB_STATUS_LABEL, type LabStatus, type LabStatusOption } from "./ui";

/** A row belongs to a surface group when it targets that surface or "both".
 *  Rows with target_context="platform" match neither surface and are shown in a
 *  dedicated recovery section so they are always reachable. */
export function rowTargetsSurface(
  target: BuilderTemplateTarget,
  surface: "talent" | "workspace",
): boolean {
  return target === surface || target === "both";
}

/** Returns rows whose target_context is "platform" — these are unreachable via
 *  the normal Agency / Talent surface filters and need a recovery section. */
export function platformTargetRows(rows: BuilderTemplateRow[]): BuilderTemplateRow[] {
  return rows.filter((r) => r.target_context === "platform");
}

/** builder_templates target_context → the editor's launch target. */
export function targetToLabTarget(t: BuilderTemplateTarget): BuilderLabTarget {
  return t === "talent" || t === "workspace" ? t : "both";
}

/** Open the SHARED hydrated `/template-preview` route for a persisted starter in
 *  a new tab. The `db-template` family keys on the row id and renders its
 *  authored `builder_tree` through the freeform renderer — no second render
 *  path. */
export function openStarterPreview(row: BuilderTemplateRow): void {
  if (typeof window === "undefined") return;
  window.open(
    getTemplatePreviewUrl(row.id, { family: "db-template" }),
    "_blank",
    "noopener,noreferrer",
  );
}

/** Human label for the Target badge. */
export function targetLabel(t: BuilderTemplateTarget): string {
  switch (t) {
    case "talent":
      return "Talent";
    case "workspace":
      return "Agency";
    case "both":
      return "Both";
    default:
      return "Platform";
  }
}

export const STATUS_ORDER: ReadonlyArray<LabStatus> = [
  "draft",
  "in_review",
  "published",
  "archived",
];

/** Legal transitions for a starter (= DB template) row, mirroring the guarded
 *  registry actions. Disabled options stay visible (so the full ladder always
 *  reads) but inert, with a why-not tooltip. */
export function statusOptionsFor(current: LabStatus): LabStatusOption[] {
  const legal: Record<LabStatus, ReadonlyArray<LabStatus>> = {
    draft: ["in_review", "published", "archived"],
    in_review: ["draft", "published", "archived"],
    published: ["draft", "archived"],
    archived: ["published"],
  };
  const allowed = new Set<LabStatus>([current, ...legal[current]]);
  return STATUS_ORDER.map((value) => ({
    value,
    label: LAB_STATUS_LABEL[value],
    disabled: !allowed.has(value),
    tooltip: allowed.has(value)
      ? undefined
      : `Can't move from ${LAB_STATUS_LABEL[current]} to ${LAB_STATUS_LABEL[value]} directly.`,
  }));
}

/** Coerce a starter row's status string to the LabStatus union. */
export function toLabStatus(status: string): LabStatus {
  return status === "draft" ||
    status === "in_review" ||
    status === "published" ||
    status === "archived"
    ? status
    : "draft";
}

/** Parse the Tags input (comma / newline separated) into a deduped array. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const tok of raw.split(/[,\n]+/)) {
    const tag = tok.trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export interface EditDraft {
  title: string;
  description: string;
  category: string;
  tags: string;
  target: BuilderTemplateTarget;
}

