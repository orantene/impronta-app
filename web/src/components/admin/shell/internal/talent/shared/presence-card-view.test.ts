import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { TalentPresenceStats } from "@/lib/analytics/talent-presence-stats";
import { presenceCardView } from "./presence-card-view";

const STATS = { isEmpty: false } as unknown as TalentPresenceStats;

test("paid tier with stats shows the stats", () => {
  assert.equal(presenceCardView("pro", STATS), "stats");
  assert.equal(presenceCardView("max", STATS), "stats");
});

test("paid tier with failed or null load shows the empty state, never hides", () => {
  assert.equal(presenceCardView("pro", undefined), "unavailable");
  assert.equal(presenceCardView("max", null), "unavailable");
});

test("free or unknown tier shows the locked Pro and Max note", () => {
  assert.equal(presenceCardView("free", undefined), "locked");
  assert.equal(presenceCardView(null, undefined), "locked");
  assert.equal(presenceCardView(undefined, STATS), "locked");
  assert.equal(presenceCardView("weird", undefined), "locked");
});

test("the card is mounted on both Today variants (legacy and Agenda V2)", () => {
  const root = join(process.cwd(), "src/components/admin/shell/internal/talent");
  for (const f of ["pages/TodayPage.tsx", "agenda/AgendaTodayPage.tsx"]) {
    assert.match(readFileSync(join(root, f), "utf8"), /<TalentPresenceStatsCard \/>/, f);
  }
});
