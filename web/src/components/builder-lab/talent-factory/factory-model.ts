/**
 * Talent Template Factory: pure model (client-safe, no I/O).
 *
 * TALENT designs only (COLLECTION_DESIGNS / talent_theme_catalog). Agency and
 * business starters are a different product and never appear here.
 */

export type FactoryStatus = "up_to_date" | "code_ahead" | "not_synced" | "authored_pending" | "authored_hidden";

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
  /** Catalog default: talent_theme_catalog.version (flips on Make default; null = not synced). */
  catalogVersion: number | null;
  /** Version a sync would leave the design at (newest known, +1 if code differs). */
  codeVersion: number;
  /** Latest open to talents: highest published opt-in/default to_version (null = none). */
  releasedVersion: number | null;
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
  /**
   * Code moved (or Maison CTA seed patch) while latest is authored and not in
   * git yet — offer "Review code seed in Builder Lab" (TUL-366).
   */
  codeSeedReview?: boolean;
}

export interface FactoryOverview {
  rows: FactoryDesignRow[];
  /** "local" reads qa-evidence from disk; "production" only shows the CLI hint. */
  mockupMode: "local" | "production";
}

export function deriveFactoryStatus(input: {
  catalogVersion: number | null;
  codeDiffers: boolean;
  /** Latest snapshot is editor-authored and the code has not reflected it yet. */
  authoredPending?: boolean;
  /** Authored design still hidden from talents (catalog status draft). */
  authoredHidden?: boolean;
}): FactoryStatus {
  if (input.authoredHidden) return "authored_hidden";
  if (input.catalogVersion === null) return "not_synced";
  if (input.authoredPending) return "authored_pending";
  return input.codeDiffers ? "code_ahead" : "up_to_date";
}

/** The version a sync would leave this design at. */
export function codeVersionOf(highestKnown: number, codeDiffers: boolean): number {
  return codeDiffers ? highestKnown + 1 : highestKnown;
}

/**
 * Latest version open to talents: published opt-in or default only.
 * Demos/draft/paused/archived never count. Catalog default is separate
 * (talent_theme_catalog.version); it can lag until Make default.
 */
export function openToTalentsVersionOf(
  releases: ReadonlyArray<{ to_version: number; status: string; channel?: string }>,
): number | null {
  let best: number | null = null;
  for (const r of releases) {
    const channel = r.channel;
    const open = channel === undefined || channel === "optin" || channel === "default";
    if (!open || r.status !== "published") continue;
    if (best === null || r.to_version > best) best = r.to_version;
  }
  return best;
}

/** Alias kept for existing call sites; same as openToTalentsVersionOf. */
export function releasedVersionOf(
  releases: ReadonlyArray<{ to_version: number; status: string; channel?: string }>,
): number | null {
  return openToTalentsVersionOf(releases);
}

/** Sync result fields the Factory tab turns into a human summary. */
export interface TalentSyncSummaryInput {
  created: number;
  updated: number;
  unchanged: number;
  heldBack: string[];
  skippedAuthored: Array<{ kind: string; slug: string }>;
  authoredPending: Array<{ slug: string; version: number }>;
  authoredConflict: Array<{ slug: string; version: number }>;
}

/** One line of a sync summary (lang-agnostic facts; UI wraps with copy). */
export interface TalentSyncSummaryFacts {
  created: number;
  updated: number;
  unchanged: number;
  heldBack: string[];
  skippedAuthored: string[];
  authoredPending: string[];
  authoredConflict: string[];
  /** True when nothing moved and nothing was held/skipped/pending. */
  quiet: boolean;
}

export function talentSyncSummaryFacts(input: TalentSyncSummaryInput): TalentSyncSummaryFacts {
  const heldBack = [...input.heldBack];
  const skippedAuthored = input.skippedAuthored.map((s) => s.slug);
  const authoredPending = input.authoredPending.map((s) => `${s.slug} v${s.version}`);
  const authoredConflict = input.authoredConflict.map((s) => `${s.slug} v${s.version}`);
  const quiet =
    input.created === 0 &&
    input.updated === 0 &&
    heldBack.length === 0 &&
    skippedAuthored.length === 0 &&
    authoredPending.length === 0 &&
    authoredConflict.length === 0;
  return {
    created: input.created,
    updated: input.updated,
    unchanged: input.unchanged,
    heldBack,
    skippedAuthored,
    authoredPending,
    authoredConflict,
    quiet,
  };
}

export function pullAuthoredCommandFor(slug: string): string {
  return `npm run theme:pull-authored -- --design ${slug}`;
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
  "edit",
  "work",
  "publish",
  "check",
  "parity",
  "open",
  "commit",
] as const;
