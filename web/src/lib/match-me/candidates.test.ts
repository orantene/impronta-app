import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { shapeCandidates, type CandidateProfileRow } from "./candidates";

const pub = { deleted_at: null, is_publicly_hidden: false, is_publicly_listed: true, visibility: "public", profile_kind: "talent" };
const p = (id: string, over: Partial<CandidateProfileRow> = {}): CandidateProfileRow => ({ id, ...pub, user_id: `u-${id}`, home_city_text: "Tulum", ...over });

test("only claimed, publicly listed professionals become candidates", () => {
  const out = shapeCandidates({
    profiles: [p("a"), p("unclaimed", { user_id: null }), p("hidden", { is_publicly_hidden: true }), p("deleted", { deleted_at: "2026-01-01T00:00:00Z" })],
    reviews: [],
    offers: [],
  });
  assert.deepEqual(out.map((c) => c.id), ["a"]);
});

test("zone is the home city; no city means no zone (so a zoned job skips them)", () => {
  const out = shapeCandidates({ profiles: [p("a"), p("b", { home_city_text: "  " })], reviews: [], offers: [] });
  assert.deepEqual(out.find((c) => c.id === "a")!.zones, ["Tulum"]);
  assert.deepEqual(out.find((c) => c.id === "b")!.zones, []);
});

test("rating is the average of PUBLISHED reviews; null when none", () => {
  const out = shapeCandidates({
    profiles: [p("a"), p("b")],
    reviews: [
      { talent_profile_id: "a", rating: 5, status: "published" },
      { talent_profile_id: "a", rating: 4, status: "published" },
      { talent_profile_id: "a", rating: 1, status: "hidden" },
    ],
    offers: [],
  });
  assert.equal(out.find((c) => c.id === "a")!.rating, 4.5);
  assert.equal(out.find((c) => c.id === "b")!.rating, null);
});

test("rotation: the newest offer per professional", () => {
  const out = shapeCandidates({
    profiles: [p("a"), p("b")],
    reviews: [],
    offers: [
      { talent_profile_id: "a", offered_at: "2026-10-01T00:00:00Z" },
      { talent_profile_id: "a", offered_at: "2026-10-05T00:00:00Z" },
    ],
  });
  assert.equal(out.find((c) => c.id === "a")!.lastOfferedAt, "2026-10-05T00:00:00Z");
  assert.equal(out.find((c) => c.id === "b")!.lastOfferedAt, null);
});

test("the loader reads the active roster of THIS tenant only and checks every error", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/match-me/match-candidates.server.ts"), "utf8");
  assert.match(src, /from\("agency_talent_roster"\)[\s\S]*\.eq\("tenant_id", tenantId\)[\s\S]*\.eq\("status", "active"\)/);
  assert.ok((src.match(/logServerError\(/g) ?? []).length >= 4);
});
