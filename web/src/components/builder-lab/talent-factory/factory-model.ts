/**
 * Talent Template Factory: pure model (client-safe, no I/O).
 *
 * TALENT designs only (COLLECTION_DESIGNS / talent_theme_catalog). Agency and
 * business starters are a different product and never appear here.
 */

export type FactoryStatus = "up_to_date" | "code_ahead" | "not_synced" | "authored_hidden";

/** The newest local mockup-parity run for one design (summary.json subset). */
export interface FactoryMockupRun {
  timestamp: string;
  pass: number;
  fail: number;
  known: number;
  openDeltas: number;
  deltasByLayer: Record<string, number>;
  /** Repo-relative path of the run's report.html. */
  reportPath: string;
}

export interface FactoryDesignRow {
  slug: string;
  title: string;
  /** Version stored in talent_theme_catalog (null = not synced yet). */
  catalogVersion: number | null;
  /** Version a sync would leave the design at (newest known, +1 if code differs). */
  codeVersion: number;
  status: FactoryStatus;
  demoCount: number;
  galleryVisible: boolean;
  latestReleaseId: string | null;
  previewHref: string;
  mockupPath: string;
  parityMapPresent: boolean;
  /** True when the design has demos the rebuild orchestrator can write. */
  canRebuild: boolean;
  /** Profile code of the design's reference demo (from the demos registry), if any. */
  referenceDemoCode: string | null;
  mockupRun: FactoryMockupRun | null;
  /** Authored in the editor (no code builtin). Absent = a code design. */
  authored?: boolean;
  /** Editor href for an authored design. */
  editHref?: string | null;
}

export interface FactoryOverview {
  rows: FactoryDesignRow[];
  /** "local" reads qa-evidence from disk; "production" only shows the CLI hint. */
  mockupMode: "local" | "production";
}

export function deriveFactoryStatus(input: {
  catalogVersion: number | null;
  codeDiffers: boolean;
  /** Authored design still hidden from talents (catalog status draft). */
  authoredHidden?: boolean;
}): FactoryStatus {
  if (input.authoredHidden) return "authored_hidden";
  if (input.catalogVersion === null) return "not_synced";
  return input.codeDiffers ? "code_ahead" : "up_to_date";
}

/** The version a sync would leave this design at. */
export function codeVersionOf(highestKnown: number, codeDiffers: boolean): number {
  return codeDiffers ? highestKnown + 1 : highestKnown;
}

export function previewFromCodeHref(slug: string): string {
  return `/template-preview/${encodeURIComponent(slug)}?kind=talent-theme&source=code`;
}

export function mockupPathFor(slug: string): string {
  return `web/design-references/${slug}`;
}

export function parityCommandFor(slug: string): string {
  return `npm run qa:mockup-parity -- --design ${slug}`;
}

export function releaseHref(releaseId: string, lang: "en" | "es"): string {
  return `/platform/admin/builder-lab/themes/${releaseId}${lang === "es" ? "?lang=es" : ""}`;
}

const LAYERS = ["token", "payload", "kit", "platform", "new-capability"] as const;

/** Parse one summary.json; returns null when it is not a run for `design`. */
export function parseMockupSummary(raw: unknown, design: string, runDir: string): FactoryMockupRun | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.design !== design || typeof s.timestamp !== "string") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const byLayer = (s.deltasByLayer && typeof s.deltasByLayer === "object" ? s.deltasByLayer : {}) as Record<string, unknown>;
  return {
    timestamp: s.timestamp,
    pass: num(s.pass),
    fail: num(s.fail),
    known: num(s.known),
    openDeltas: num(s.openDeltas),
    deltasByLayer: Object.fromEntries(LAYERS.map((l) => [l, num(byLayer[l])])),
    reportPath: `web/qa-evidence/mockup-parity/${runDir}/report.html`,
  };
}

/** Newest run wins (ISO timestamps compare lexically). */
export function newestRun(runs: ReadonlyArray<FactoryMockupRun>): FactoryMockupRun | null {
  let best: FactoryMockupRun | null = null;
  for (const r of runs) if (!best || r.timestamp > best.timestamp) best = r;
  return best;
}

export const HOW_TO_ADD_STEPS = [
  "mockup",
  "parityMap",
  "collection",
  "register",
  "demos",
  "sync",
  "rebuild",
  "parity",
  "ship",
] as const;
