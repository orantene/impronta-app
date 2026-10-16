/**
 * TUL-408 — required trade list + coverage assessment for platform lifestyle stock.
 *
 * A target is (businessType, family). Photos are the resolved pool from
 * `queryLifestyleStockForType` (type rows, then family pack, then universal).
 * Pass = ≥1 serving pool hero/wide and ≥1 serving gallery (tenant-origin rows
 * do not count toward platform fill).
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { UNIQUE_THEME_DEMOS } from "../demo-talents/unique-theme-map";
import { BUSINESS_TYPES, type BusinessFamilyId } from "../../src/lib/words/business-types";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Roles that satisfy the hero slot (matches onboarding `pickStockHero`). */
export const STOCK_COVERAGE_HERO_ROLES: ReadonlySet<string> = new Set(["hero", "wide"]);

export type StockCoverageTarget = {
  businessType: string | null;
  family: BusinessFamilyId;
  /** Where this target was required from (for the report). */
  sources: readonly string[];
};

export type StockCoveragePhoto = {
  id: string;
  role: string;
  originTenantId?: string | null;
};

export type StockCoverageRow = {
  target: StockCoverageTarget;
  heroCount: number;
  galleryCount: number;
  ok: boolean;
  gaps: string[];
};

export function targetKey(businessType: string | null, family: string): string {
  return `${businessType ?? ""}|${family}`;
}

function familyForTypeId(typeId: string): BusinessFamilyId {
  const hit = BUSINESS_TYPES.find((t) => t.id === typeId);
  if (!hit) {
    throw new Error(`Unknown business type in acceptance fixtures: ${typeId}`);
  }
  return hit.family;
}

function loadAcceptanceTypeIds(): string[] {
  const raw = readFileSync(resolve(__dirname, "../acceptance-cases.json"), "utf8");
  const parsed = JSON.parse(raw) as { cases: Array<{ id: string; type: string }> };
  return [...new Set(parsed.cases.map((c) => c.type))];
}

/** Union of unique-theme demo packs and distinct acceptance-case types. */
export function buildStockCoverageTargets(): StockCoverageTarget[] {
  const map = new Map<string, StockCoverageTarget>();

  const add = (businessType: string | null, family: BusinessFamilyId, source: string) => {
    const key = targetKey(businessType, family);
    const cur = map.get(key);
    if (cur) {
      if (!cur.sources.includes(source)) {
        map.set(key, { ...cur, sources: [...cur.sources, source] });
      }
      return;
    }
    map.set(key, { businessType, family, sources: [source] });
  };

  for (const demo of UNIQUE_THEME_DEMOS) {
    const { businessType, family } = demo.pack.stock;
    add(businessType, family as BusinessFamilyId, `unique-theme:${demo.profileCode}`);
  }

  for (const typeId of loadAcceptanceTypeIds()) {
    add(typeId, familyForTypeId(typeId), `acceptance:${typeId}`);
  }

  return [...map.values()].sort((a, b) =>
    targetKey(a.businessType, a.family).localeCompare(targetKey(b.businessType, b.family)),
  );
}

/** Count pool-only serving photos that satisfy hero and gallery requirements. */
export function assessStockCoverage(
  photos: readonly StockCoveragePhoto[],
): { heroCount: number; galleryCount: number; gaps: string[] } {
  const pool = photos.filter((p) => p.originTenantId == null);
  const heroCount = pool.filter((p) => STOCK_COVERAGE_HERO_ROLES.has(p.role)).length;
  const galleryCount = pool.filter((p) => p.role === "gallery").length;
  const gaps: string[] = [];
  if (heroCount < 1) gaps.push("hero/wide");
  if (galleryCount < 1) gaps.push("gallery");
  return { heroCount, galleryCount, gaps };
}

export function assessTarget(
  target: StockCoverageTarget,
  photos: readonly StockCoveragePhoto[],
): StockCoverageRow {
  const { heroCount, galleryCount, gaps } = assessStockCoverage(photos);
  return {
    target,
    heroCount,
    galleryCount,
    ok: gaps.length === 0,
    gaps,
  };
}

export function formatStockCoverageReport(rows: readonly StockCoverageRow[]): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    const label = row.target.businessType ?? "(universal)";
    const mark = row.ok ? "OK " : "GAP";
    const gapText = row.gaps.length ? `  missing: ${row.gaps.join(", ")}` : "";
    lines.push(
      `${mark}  ${label.padEnd(28)} family=${row.target.family.padEnd(14)} ` +
        `hero/wide=${String(row.heroCount).padStart(2)}  gallery=${String(row.galleryCount).padStart(2)}${gapText}`,
    );
  }
  return lines;
}

/** Stable keys for tests — must change only when the required set intentionally moves. */
export function stockCoverageTargetKeys(): string[] {
  return buildStockCoverageTargets().map((t) => targetKey(t.businessType, t.family));
}
