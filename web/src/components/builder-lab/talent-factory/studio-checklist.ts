/**
 * Theme Studio, Phase 1 slice (TUL-20): the read-only "finished checklist"
 * for one talent design. Pure and client-safe; the server fills `StudioFacts`
 * from the filesystem and the factory row. Behind TALENT_THEME_STUDIO=1.
 *
 * Talent designs only. No release semantics change; nothing here writes.
 */

/** Files a Theme Review pack needs before a design can count as finished. */
export const PACK_REQUIRED_FILES = ["index.html", "kit.js", "parity-map.json", "content.json", "README.md"] as const;

export type StudioRowKey = "pack" | "demo" | "parity" | "gaps" | "overlay" | "gallery";

export interface StudioFacts {
  /** File names found directly in web/design-references/<slug>/. */
  packFiles: readonly string[];
  /** The pack README still declares itself a DRAFT. */
  readmeDraft: boolean;
  referenceDemoCode: string | null;
  /** Newest local parity run's open deltas; null = no run found. */
  openDeltas: number | null;
  /** COLLECTION_DESIGN_GAPS entries for the slug. */
  gaps: readonly string[];
  overlayPresent: boolean;
  galleryVisible: boolean;
}

export interface StudioRow {
  key: StudioRowKey;
  ok: boolean;
  /** Short machine-built detail (missing files, gap names, delta count). */
  detail?: string;
}

export interface StudioChecklist {
  rows: StudioRow[];
  ready: boolean;
}

export function studioFlagOn(env: Record<string, string | undefined>): boolean {
  return env.TALENT_THEME_STUDIO === "1";
}

export function buildStudioChecklist(f: StudioFacts): StudioChecklist {
  const missing = PACK_REQUIRED_FILES.filter((n) => !f.packFiles.includes(n));
  const rows: StudioRow[] = [
    {
      key: "pack",
      ok: missing.length === 0 && !f.readmeDraft,
      detail: missing.length ? missing.join(", ") : f.readmeDraft ? "DRAFT" : undefined,
    },
    { key: "demo", ok: !!f.referenceDemoCode, detail: f.referenceDemoCode ?? undefined },
    {
      key: "parity",
      ok: f.openDeltas === 0,
      detail: f.openDeltas === null ? undefined : String(f.openDeltas),
    },
    { key: "gaps", ok: f.gaps.length === 0, detail: f.gaps.length ? f.gaps.join("; ") : undefined },
    { key: "overlay", ok: f.overlayPresent },
    { key: "gallery", ok: f.galleryVisible },
  ];
  return { rows, ready: rows.every((r) => r.ok) };
}
