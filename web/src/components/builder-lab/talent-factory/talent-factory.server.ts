import "server-only";

/**
 * Talent Template Factory: server reads. TALENT designs only. Reuses
 * loadDesignsOverview (versions, releases), hashBuiltinPayload (the same hash
 * the sync decides on), FINISHED_GALLERY_SLUGS and the demo registry.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { COLLECTION_DESIGNS } from "@/lib/talent-site/theme-catalog/collection/designs";
import { FINISHED_GALLERY_SLUGS } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { hashBuiltinPayload, syncBuiltinTalentThemes } from "@/lib/talent-site/theme-catalog/sync-builtins.server";
import { isAuthoredReflected } from "@/lib/talent-site/theme-catalog/authored-sync-rule";
import { authoredOverlayVersion } from "@/lib/talent-site/theme-catalog/collection/authored";
import { themeTemplateEditHref } from "@/lib/talent-site/theme-template/types";
import { demosFor } from "@/lib/talent-site/demos/registry";
import type { DemoDesign } from "@/lib/talent-site/demos/types";
import { loadDesignsOverview } from "@/lib/talent-site/theme-releases/manager/release-manager.server";

import {
  codeVersionOf,
  deriveFactoryStatus,
  mockupPathFor,
  newestRun,
  parseMockupSummary,
  openToTalentsVersionOf,
  previewFromCodeHref,
  type FactoryDesignRow,
  type FactoryMockupRun,
  type FactoryOverview,
} from "./factory-model";

/** The ONLY slugs the factory lists or acts on. */
export const FACTORY_SLUGS: readonly string[] = COLLECTION_DESIGNS.map((d) => d.slug);

/** Gated mode only: writes snapshots and draft releases, never flips the live catalog. */
export function syncTalentCatalog(admin: SupabaseClient) {
  return syncBuiltinTalentThemes(admin, null, { flipCatalog: false });
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function readMockupRuns(slug: string): FactoryMockupRun[] {
  const root = join(process.cwd(), "qa-evidence", "mockup-parity");
  if (!existsSync(root)) return [];
  const out: FactoryMockupRun[] = [];
  for (const dir of readdirSync(root)) {
    const file = join(root, dir, "summary.json");
    if (!existsSync(file)) continue;
    try {
      const run = parseMockupSummary(JSON.parse(readFileSync(file, "utf8")), slug, dir);
      if (run) out.push(run);
    } catch {
      // A half-written summary is skipped, never fatal.
    }
  }
  return out;
}

export async function loadTalentFactory(admin: SupabaseClient): Promise<FactoryOverview> {
  const overview = new Map((await loadDesignsOverview(admin)).map((d) => [d.slug, d] as const));
  const [{ data: catalog }, { data: snaps }] = await Promise.all([
    admin.from("talent_theme_catalog").select("slug, title, version, payload, status, source").eq("kind", "design"),
    admin.from("talent_theme_versions").select("design, version, payload, source"),
  ]);
  const catalogBySlug = new Map((catalog ?? []).map((c) => [c.slug as string, c] as const));
  const mockupMode = isProduction() ? "production" : "local";

  const rows: FactoryDesignRow[] = COLLECTION_DESIGNS.map((entry) => {
    const slug = entry.slug;
    const row = catalogBySlug.get(slug);
    const ov = overview.get(slug);
    const mine = (snaps ?? []).filter((s) => s.design === slug);
    let latest: { version: number; payload: unknown; source: string | null } | null = row
      ? { version: row.version as number, payload: row.payload as unknown, source: null }
      : null;
    for (const s of mine) {
      if (!latest || (s.version as number) > latest.version) {
        latest = { version: s.version as number, payload: s.payload, source: (s.source as string | null) ?? null };
      }
    }
    const releaseTo = (ov?.openReleases ?? []).map((r) => r.to_version);
    const highest = Math.max(latest?.version ?? 0, ...releaseTo);
    const codeDiffers = !latest || hashBuiltinPayload(entry.buildPayload()) !== hashBuiltinPayload(latest.payload);
    const catalogVersion = row ? (row.version as number) : null;
    const newestRelease = [...(ov?.openReleases ?? [])].sort((a, b) => b.to_version - a.to_version)[0];
    const demos = demosFor(slug as DemoDesign);
    const demoCount = demos.length;
    return {
      slug,
      title: ov?.title ?? entry.title,
      catalogVersion,
      codeVersion: codeVersionOf(highest, codeDiffers),
      releasedVersion: openToTalentsVersionOf(ov?.openReleases ?? []),
      status: deriveFactoryStatus({
        catalogVersion,
        codeDiffers,
        authoredPending: codeDiffers && !!latest && !isAuthoredReflected(latest, authoredOverlayVersion(slug)),
      }),
      demoCount,
      galleryVisible: FINISHED_GALLERY_SLUGS.includes(slug),
      latestReleaseId: newestRelease?.id ?? null,
      previewHref: previewFromCodeHref(slug),
      mockupPath: mockupPathFor(slug),
      parityMapPresent: existsSync(join(process.cwd(), "design-references", slug, "parity-map.json")),
      canRebuild: demoCount > 0,
      referenceDemoCode: demos.find((d) => d.reference)?.profileCode ?? null,
      mockupRun: mockupMode === "local" ? newestRun(readMockupRuns(slug)) : null,
    };
  });
  // Authored designs (Save as new design): no code builtin, so no code diff,
  // demos or mockup. Hidden until released.
  const codeSlugs = new Set(COLLECTION_DESIGNS.map((d) => d.slug));
  for (const c of catalog ?? []) {
    const slug = c.slug as string;
    if (c.source !== "authored" || codeSlugs.has(slug)) continue;
    const hidden = c.status !== "published";
    const ov = overview.get(slug);
    const catalogVersion = c.version as number;
    rows.push({
      slug,
      title: ov?.title ?? (c.title as string),
      catalogVersion,
      codeVersion: catalogVersion,
      releasedVersion: openToTalentsVersionOf(ov?.openReleases ?? []),
      status: deriveFactoryStatus({ catalogVersion, codeDiffers: false, authoredHidden: hidden }),
      demoCount: 0,
      galleryVisible: !hidden,
      latestReleaseId: [...(ov?.openReleases ?? [])].sort((a, b) => b.to_version - a.to_version)[0]?.id ?? null,
      previewHref: `/template-preview/${encodeURIComponent(slug)}?kind=talent-theme&source=authored`,
      mockupPath: mockupPathFor(slug),
      parityMapPresent: false,
      canRebuild: false,
      referenceDemoCode: null,
      mockupRun: null,
      authored: true,
      editHref: themeTemplateEditHref(slug),
    });
  }
  return { rows, mockupMode };
}
