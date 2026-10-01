/**
 * TEMPLATE FACTORY, goal #6: one-command demo rebuild. The CONTRACT shared by
 * the registry, the orchestrator (server), the API route, the CLI and the
 * admin UI. Pure types; no runtime code here.
 *
 * Rule: a rebuild only ever writes a talent that passes `assertDemoTarget`
 * (`talent_profiles.is_demo = true` AND `isDemoAccount(email, demo_batch)`).
 * Jor (TAL-JORGBEAUTY), the QA users (TAL-93900, TAL-93901, TAL-QAFIXFREE) and
 * every real talent are refused before any read of their site rows.
 */
import type { ThemeDemoDesign } from "@/lib/talent-site/theme-catalog/theme-demos";

export type DemoDesign = ThemeDemoDesign;

/** One demo the rebuild owns. Derived from THEME_DEMOS + Alba; no manifest. */
export interface DemoRegistryEntry {
  design: DemoDesign;
  profileCode: string;
  /** Gallery palette key (rose for Alba). */
  palette: string;
  /**
   * The mockup's reference demo for this design (exact mockup content):
   * Alba TAL-93020 for maison-v2, Mateo TAL-93011 for folio.
   */
  reference: boolean;
  /** Content fixture key (design-references/<design>/content.json) for references. */
  contentFixture?: DemoDesign;
}

export type DemoStepId =
  | "guard"
  | "backup"
  | "content"
  | "hero_facts"
  | "location"
  | "design"
  | "publish"
  | "cache";

export type DemoRebuildStatus = "unchanged" | "would_write" | "wrote" | "refused" | "failed";

export interface DemoRebuildRow {
  profileCode: string;
  design: DemoDesign;
  /** Design version the demo was (or would be) built from. */
  version: number | null;
  status: DemoRebuildStatus;
  /** Steps that changed something (empty when unchanged). */
  changed: DemoStepId[];
  /** demo_rebuild_runs.id of the backup row, when written. */
  runId?: string;
  /** Plain-language reason for refused/failed. Never contains secrets. */
  error?: string;
}

export interface DemoRebuildRequest {
  /** One design, or every design in the registry when omitted. */
  design?: DemoDesign;
  /** Restrict to these profile codes (each must be in the registry). */
  only?: string[];
  /** Default true. A dry run reads and plans; it never writes. */
  dryRun?: boolean;
  /** Default true (owner decision 2026-09-30): every rebuilt demo is published. */
  publish?: boolean;
}

export interface DemoRebuildResult {
  ok: boolean;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  rows: DemoRebuildRow[];
}

/** POST /api/platform/demos/rebuild body = DemoRebuildRequest; response = DemoRebuildResult. */
export const DEMO_REBUILD_ROUTE = "/api/platform/demos/rebuild";

/** POST /api/platform/demos/restore body; restores a demo from a backup run. */
export interface DemoRestoreRequest {
  runId: string;
}
