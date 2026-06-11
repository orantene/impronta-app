/**
 * Legacy-write guard (Architecture §F.1) — the runtime backstop that keeps the
 * "one database, no new legacy writes" invariant true.
 *
 * Rule: ONLY the `homepage` surface may write the legacy slot-composition
 * tables (`cms_page_sections`) or persist a `composition[]` array. Every other
 * surface (workspace_page / talent_page / platform_lab) persists exclusively to
 * pure-freeform tables. Each non-homepage adapter calls
 * `assertNoLegacyBuilderWrite(kind, table)` at the top of its `save`/`publish`
 * so a regression that points a freeform surface at a legacy table throws
 * loudly instead of silently corrupting the legacy homepage data model.
 *
 * (The companion static CI test — §F.2 — greps non-homepage adapters for the
 * literal table name; this is the runtime half.)
 */

import {
  LEGACY_BUILDER_WRITE_SURFACE,
  type BuilderSurfaceKind,
} from "./surface-kind";

/**
 * Tables / persistence targets that belong exclusively to the frozen legacy
 * homepage path. A non-homepage surface touching any of these is a bug.
 */
export const LEGACY_BUILDER_WRITE_TARGETS: readonly string[] = [
  "cms_page_sections",
  // `composition[]` is not a table but a JSONB array shape persisted by the
  // legacy composer; we accept it as a target string so callers can guard the
  // shape as well as the table.
  "composition",
  "composition[]",
] as const;

export class LegacyBuilderWriteError extends Error {
  readonly surfaceKind: BuilderSurfaceKind;
  readonly table: string;

  constructor(kind: BuilderSurfaceKind, table: string) {
    super(
      `[builder-core] Surface "${kind}" attempted a legacy builder write to ` +
        `"${table}". Only the "${LEGACY_BUILDER_WRITE_SURFACE}" surface may ` +
        `write legacy slot composition. Non-homepage surfaces must persist to ` +
        `pure-freeform tables (workspace_pages / talent_pages / builder_templates).`,
    );
    this.name = "LegacyBuilderWriteError";
    this.surfaceKind = kind;
    this.table = table;
  }
}

/** True when `table` is a legacy slot-composition write target. */
export function isLegacyBuilderWriteTarget(table: string): boolean {
  const normalized = table.trim().toLowerCase();
  return LEGACY_BUILDER_WRITE_TARGETS.some(
    (t) => t.toLowerCase() === normalized,
  );
}

/**
 * Throws {@link LegacyBuilderWriteError} when a non-homepage surface targets a
 * legacy slot-composition table. A no-op for the homepage surface (the only
 * legacy writer) and for any non-legacy table.
 */
export function assertNoLegacyBuilderWrite(
  kind: BuilderSurfaceKind,
  table: string,
): void {
  if (kind === LEGACY_BUILDER_WRITE_SURFACE) return;
  if (!isLegacyBuilderWriteTarget(table)) return;
  throw new LegacyBuilderWriteError(kind, table);
}
