/**
 * TUL-1113: ONE shared 2 s first-paint budget for the talent dashboard loaders
 * (Resenas, Servicios, Today). PM decision 2026-10-21: 2 s.
 *
 * Same shape as `admin-layout-kpi-budget.static.test.ts`: read the sources and
 * fail when a loader loses its time box, stops using the shared constant, or a
 * longer literal budget comes back. Every loader below falls back to its empty
 * state at the budget instead of holding the first paint.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const BUDGET_FILE = "src/lib/talent/loader-budget.ts";
const RESENAS_ASK = "src/components/admin/shell/internal/talent/pages/ReviewsAskForReviewCard.tsx";
const RESENAS_PAGE = "src/components/admin/shell/internal/talent/pages/ReviewsPage.tsx";
const SERVICIOS_SERVER = "src/lib/talent/services-bootstrap.server.ts";
const SERVICIOS_CLIENT = "src/components/talent/services/use-offerings-editor.ts";
const TODAY_LAYOUT = "src/app/(workspace)/talent/_talent-layout-inner.tsx";

/** Literal numeric budgets (budgetMs / *_TIMEOUT_MS / *_BUDGET_MS) found in a source. */
function literalBudgets(src: string): number[] {
  const out: number[] = [];
  const re = /(?:budgetMs\s*:|\b[A-Z0-9_]*(?:TIMEOUT_MS|BUDGET_MS)\s*=)\s*([\d_]+)\b/g;
  for (const m of src.matchAll(re)) out.push(Number(m[1].replace(/_/g, "")));
  return out;
}

describe("TUL-1113 shared talent loader budget", () => {
  it("the shared budget is 2 s", () => {
    const src = read(BUDGET_FILE);
    const n = Number((src.match(/export const TALENT_LOADER_BUDGET_MS = ([\d_]+);/) ?? [])[1]?.replace(/_/g, ""));
    assert.equal(n, 2000, "PM decision: the talent dashboard loaders share a 2 s budget");
  });

  it("Resenas: the ask-for-review bookings loader times out at the shared budget (email fallback)", () => {
    const src = read(RESENAS_ASK);
    assert.match(src, /export const REVIEW_ASK_LOAD_TIMEOUT_MS = TALENT_LOADER_BUDGET_MS;/);
    assert.match(src, /withLoadTimeout\(loadReviewAskBookingsAction\(/);
  });

  it("Servicios: the server seed is time-boxed to the shared budget and falls back to null", () => {
    const src = read(SERVICIOS_SERVER);
    assert.match(
      src,
      /withTimeout<[^>]+>\(\s*loadTalentOfferingsForEditor\(profile\.id\),\s*TALENT_LOADER_BUDGET_MS,\s*null,?\s*\)/,
    );
  });

  it("Servicios: the editor's own list action settles within the shared budget", () => {
    const src = read(SERVICIOS_CLIENT);
    assert.match(src, /budgetMs: TALENT_LOADER_BUDGET_MS/);
  });

  it("Today: the layout's money reads are time-boxed to the shared budget", () => {
    const src = read(TODAY_LAYOUT);
    assert.match(src, /withTimeout\(loadTalentEarningsByCurrency\(talentSelfProfile\.id\), TALENT_LOADER_BUDGET_MS,/);
    assert.match(
      src,
      /withTimeout\(loadTalentPayoutAttention\(talentSelfProfile\.id\), TALENT_LOADER_BUDGET_MS, EMPTY_TALENT_PAYOUT_ATTENTION\)/,
    );
  });

  it("no loader file carries a literal budget above 2 s", () => {
    for (const rel of [RESENAS_ASK, SERVICIOS_SERVER, SERVICIOS_CLIENT, TODAY_LAYOUT]) {
      for (const ms of literalBudgets(read(rel))) {
        assert.ok(ms <= 2000, `${rel} has a ${ms} ms budget; use TALENT_LOADER_BUDGET_MS (2000)`);
      }
    }
  });

  it("Resenas page: the unbounded reads are the three known ones, no new one may be added", () => {
    // Known gap (tracked on the card): the received list, private notes and analytics loads
    // are not time-boxed yet. This ratchet only lets the count go DOWN: when one is bounded,
    // lower KNOWN_UNBOUNDED; adding a fourth fails here.
    const KNOWN_UNBOUNDED = 3;
    const src = read(RESENAS_PAGE);
    const calls = [...src.matchAll(/^\s*(load\w+Action)\(talentId\)$/gm)].length;
    assert.ok(calls <= KNOWN_UNBOUNDED, `${calls} unbounded talentId loaders on Reviews (max ${KNOWN_UNBOUNDED})`);
  });
});
