/**
 * TUL-1382: after the staff talent_profiles SELECT policy is roster-scoped, a
 * talent removed from the roster (and not public) comes back as a NULL embed on
 * history screens, so names render blank. The backfill reads ONLY the missing
 * talents through the service client, keyed by ids the (already authorized)
 * rows carry, and never overwrites an embed the session could see.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/talent/backfill-talent-embeds.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { backfillMissingTalentEmbeds } from "./backfill-talent-embeds";

type Row = Record<string, unknown>;

function fake(tables: Record<string, Row[]>, log: string[] = []) {
  return {
    from: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      let cols: string[] | null = null;
      const q = {
        select: (c: string) => (log.push(`${table}:${c}`), (cols = c.split(",").map((x) => x.trim())), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        then: (res: (v: { data: Row[]; error: null }) => unknown) =>
          res({ data: rows.map((r) => (cols ? Object.fromEntries(cols.map((k) => [k, r[k]])) : r)), error: null }),
      };
      return q;
    },
  } as never;
}

const REMOVED = "tp-removed";
const VISIBLE = "tp-visible";
const SERVICE_TABLE = {
  talent_profiles: [
    { id: REMOVED, display_name: "Rita Removed", profile_code: "TAL-9", first_name: "Rita", last_name: "Removed" },
    { id: VISIBLE, display_name: "SHOULD NOT OVERWRITE", profile_code: "TAL-1", first_name: "V", last_name: "V" },
  ],
};

test("a removed, unpublished talent's NULL embed is filled with name and code", async () => {
  const rows: Row[] = [{ id: "p1", talent_profile_id: REMOVED, talent_profiles: null }];
  await backfillMissingTalentEmbeds(fake(SERVICE_TABLE), rows, "display_name, profile_code");
  assert.deepEqual(rows[0].talent_profiles, { display_name: "Rita Removed", profile_code: "TAL-9" });
});

test("an embed the session could already see is left alone, and its id is not re-read", async () => {
  const log: string[] = [];
  const seen = { display_name: "Visible Vera", profile_code: "TAL-1" };
  const rows: Row[] = [{ id: "p1", talent_profile_id: VISIBLE, talent_profiles: seen }];
  await backfillMissingTalentEmbeds(fake(SERVICE_TABLE, log), rows, "display_name, profile_code");
  assert.equal(rows[0].talent_profiles, seen);
  assert.deepEqual(log, [], "no service read when nothing is missing");
});

test("rows with no talent id stay empty and trigger no read", async () => {
  const log: string[] = [];
  const rows: Row[] = [{ id: "p1", talent_profile_id: null, talent_profiles: null }];
  await backfillMissingTalentEmbeds(fake(SERVICE_TABLE, log), rows, "display_name");
  assert.equal(rows[0].talent_profiles, null);
  assert.deepEqual(log, []);
});

test("array-shaped embeds that came back empty are filled too, and only missing ids are read", async () => {
  const rows: Row[] = [
    { id: "a", talent_profile_id: REMOVED, talent_profiles: [] },
    { id: "b", talent_profile_id: VISIBLE, talent_profiles: { display_name: "Vera" } },
  ];
  await backfillMissingTalentEmbeds(fake(SERVICE_TABLE), rows, "display_name");
  assert.deepEqual(rows[0].talent_profiles, { display_name: "Rita Removed" });
  assert.deepEqual(rows[1].talent_profiles, { display_name: "Vera" });
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("each history screen backfills its talent embed (one read per screen)", () => {
  const pipeline = read("src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts");
  assert.equal((pipeline.match(/backfillMissingTalentEmbeds\(/g) ?? []).length, 2, "lineup + offer line items");
  const msgs = read("src/app/(workspace)/[tenantSlug]/_data-bridge/inquiries-messages.ts");
  assert.match(msgs, /backfillMissingTalentEmbeds\(/);
  const ws = read("src/lib/inquiry/inquiry-workspace-data.ts");
  assert.equal((ws.match(/backfillMissingTalentEmbeds\(/g) ?? []).length, 2, "roster + roster peek");
  assert.match(read("src/lib/inquiry/load-alternates.ts"), /staffTalentClient|backfillMissingTalentEmbeds/);
  assert.match(read("src/lib/inquiry/inquiry-engine-offers.ts"), /backfillMissingTalentEmbeds\(|staffTalentClient/);
  assert.match(read("src/app/(workspace)/[tenantSlug]/admin/bookings/[id]/call-sheet/page.tsx"), /staffTalentClient/);
  assert.match(read("src/app/api/admin/inspector/talent/route.ts"), /status === "removed"/);
  assert.match(read("src/lib/talent/talent-chip-info.ts"), /staffTalentClient/);
});
