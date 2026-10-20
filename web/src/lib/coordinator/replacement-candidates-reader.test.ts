import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { loadReplacementCandidates } from "@/lib/projects/projects-reader";

// loadReplacementCandidates builds its own service-role client, so the ordering and the
// fail-unknown rule are pinned through the pure helper (replacement-availability.test.ts)
// and through the wiring below. This file pins the wiring.
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

test("the reader orders free, then unknown, then busy; best rated first; and never calls an unreadable list free", () => {
  const src = read("lib/projects/projects-reader.ts");
  assert.match(src, /const rank = \{ free: 0, unknown: 1, busy: 2 \}/);
  assert.match(src, /busy = "unreadable"/);
  assert.match(src, /availabilityByTalent\(rows\.map/);
  // a rating only counts with reviews behind it
  assert.match(src, /\(row\.rating_count \?\? 0\) > 0/);
  assert.equal(typeof loadReplacementCandidates, "function");
});

test("the page passes the job's window and the team tab shows rating and availability after the name", () => {
  assert.match(read("app/(workspace)/[tenantSlug]/admin/projects/[projectId]/page.tsx"), /loadReplacementCandidates\(scope\.tenantId, \{ startsAt: project\.startsAt, endsAt: project\.endsAt \}\)/);
  const tab = read("app/(workspace)/[tenantSlug]/admin/projects/[projectId]/team-tab.tsx");
  assert.match(tab, /candidateTag\(c, locale\)/);
});

test("the engine stays the authority: the replace action still goes through project_replace_talent", () => {
  assert.match(read("lib/projects/project-ops.ts"), /rpc\("project_replace_talent"/);
});
