/**
 * TUL-408 — read-only audit: every required trade has serving hero + gallery stock.
 *
 * Uses the same resolved pool as live sites (`queryLifestyleStockForType`).
 * Read-only. Never writes.
 *
 * USAGE
 *   npm run audit:stock-coverage
 *   npx tsx --env-file=.env.local scripts/audit-stock-coverage.ts
 *
 * ENV (from web/.env.local)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Exit 0 when all targets pass; exit 1 on gaps or missing credentials.
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { queryLifestyleStockForType } from "../src/lib/media/platform-stock";
import {
  assessTarget,
  buildStockCoverageTargets,
  formatStockCoverageReport,
  type StockCoverageRow,
} from "./lib/stock-coverage-audit";

function loadSupabase() {
  loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return { ok: false as const, error: "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local)" };
  }
  return {
    ok: true as const,
    client: createClient(url, key, { auth: { persistSession: false } }),
  };
}

export async function auditStockCoverage(): Promise<{ exitCode: number; rows: StockCoverageRow[] }> {
  const targets = buildStockCoverageTargets();
  const sb = loadSupabase();
  if (!sb.ok) {
    console.error(sb.error);
    console.error("\nDry-run: cannot query remote stock without credentials. PM runs this against production Supabase.");
    return { exitCode: 1, rows: [] };
  }

  const rows: StockCoverageRow[] = [];
  for (const target of targets) {
    const photos = await queryLifestyleStockForType(sb.client, {
      businessType: target.businessType,
      family: target.family,
    });
    rows.push(
      assessTarget(
        target,
        photos.map((p) => ({ id: p.id, role: p.role, originTenantId: p.originTenantId })),
      ),
    );
  }

  const lines = formatStockCoverageReport(rows);
  for (const line of lines) console.log(line);

  const gaps = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length} target(s); ${gaps.length} gap(s).`);
  if (gaps.length > 0) {
    console.log("\nFill gaps: npx tsx --env-file=.env.local scripts/seed-stock-engine.ts --apply --types <id>");
    console.log("Then approve heroes at /platform/admin/stock/review (gallery may serve at qa_passed).");
    console.log("See docs/plans/templates/tul-408-stock-coverage.md");
  }

  return { exitCode: gaps.length > 0 ? 1 : 0, rows };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  auditStockCoverage()
    .then(({ exitCode }) => process.exit(exitCode))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
