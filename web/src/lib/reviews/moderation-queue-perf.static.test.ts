/**
 * TUL-732 / TUL-734: static guards for the two slow loads.
 *  - The Reviews moderation queue is ONE server action (one gate, parallel
 *    fan-out), not two queued ones, and the gate is not repeated per read.
 *  - The Projects page starts its independent reads together.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

test("moderation queue client fires one action, not two", () => {
  const src = read(
    "components/admin/shell/internal/drawers/profile-shell/profile-shell-modules/review-moderation-queue.tsx",
  );
  assert.match(src, /loadModerationQueueAction\(tenantId\)/);
  assert.doesNotMatch(src, /loadReportedReviewsAction|loadModerationIntegritySignalsAction/);
});

test("moderation loader gates once and reads in parallel", () => {
  const src = read("lib/reviews/review-moderation-loaders.ts");
  const m = src.match(/export async function loadModerationQueue[\s\S]*?\n}\n/);
  assert.ok(m, "loadModerationQueue exists");
  const body = m[0];
  assert.equal((body.match(/gateModeration\(/g) ?? []).length, 1);
  assert.match(body, /Promise\.all\(\[\s*readReportedReviews[\s\S]*readIntegritySignals/);
});

test("projects page awaits gate, locale, filters and rows together", () => {
  const src = read("app/(workspace)/[tenantSlug]/admin/projects/page.tsx");
  assert.match(
    src,
    /Promise\.all\(\[\s*userHasCapability\([^)]*\),\s*getRequestLocale\(\),\s*searchParams,\s*loadProjects\(/,
  );
});

test("talent_reviews has a tenant index migration", () => {
  const sql = readFileSync(
    path.resolve(root, "../../supabase/migrations/20261231372700_talent_reviews_tenant_idx.sql"),
    "utf8",
  );
  assert.match(sql, /talent_reviews \(tenant_id, reported_at desc\)/);
});
