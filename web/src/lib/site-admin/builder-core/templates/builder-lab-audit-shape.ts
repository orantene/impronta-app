/**
 * builder-lab-audit-shape.ts — PURE (no "use server", no DB) shape helpers for
 * the Builder Lab audit log (G1), split out of `builder-lab-audit.ts` so the
 * row→entry mapping and insert-payload construction are unit-testable without a
 * Supabase client. The server module imports these; tests import them directly.
 */

/** Canonical action verbs written to `builder_lab_audit.action`. */
export type BuilderLabAuditAction =
  | "overlay.set"
  | "overlay.clear"
  | "template.publish"
  | "template.unpublish"
  | "template.archive"
  | "template.rollout";

export interface AppendBuilderLabAuditInput {
  action: BuilderLabAuditAction;
  /** AddGalleryItem id for overlay writes ("el-button" / "db-template:<uuid>"). */
  itemRef?: string | null;
  /** Raw builder_templates.id for lifecycle writes. */
  templateId?: string | null;
  /** Acting super-admin (gate.userId). */
  actor: string;
  before?: unknown;
  after?: unknown;
}

/** A row of the reverse-chron feed, with the actor name resolved for display. */
export interface BuilderLabAuditEntry {
  id: string;
  action: string;
  itemRef: string | null;
  templateId: string | null;
  actorId: string | null;
  actorName: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/** Raw DB row shape (the columns we select). */
export interface BuilderLabAuditRow {
  id: string;
  action: string;
  item_ref: string | null;
  template_id: string | null;
  actor: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}

/** Build the insert payload for one append. Null-coalesces optional fields so the
 *  DB row is always well-formed (before/after default to null = "no prior state"). */
export function buildAuditInsertPayload(input: AppendBuilderLabAuditInput): {
  action: string;
  item_ref: string | null;
  template_id: string | null;
  actor: string;
  before: unknown;
  after: unknown;
} {
  return {
    action: input.action,
    item_ref: input.itemRef ?? null,
    template_id: input.templateId ?? null,
    actor: input.actor,
    before: input.before ?? null,
    after: input.after ?? null,
  };
}

/** Map a raw DB row + an actor-name lookup to a display entry. */
export function mapAuditRowToEntry(
  row: BuilderLabAuditRow,
  nameById: Map<string, string>,
): BuilderLabAuditEntry {
  return {
    id: row.id,
    action: row.action,
    itemRef: row.item_ref,
    templateId: row.template_id,
    actorId: row.actor,
    actorName: row.actor ? nameById.get(row.actor) ?? null : null,
    before: row.before,
    after: row.after,
    createdAt: row.created_at,
  };
}

/** The distinct, non-null actor ids across a batch of rows (for the name fetch). */
export function distinctActorIds(rows: ReadonlyArray<BuilderLabAuditRow>): string[] {
  return [...new Set(rows.map((r) => r.actor).filter((a): a is string => !!a))];
}
