/**
 * TUL-1687: on "Who stays visible" each person is labelled visible or hidden (over the plan
 * cap) with the public directory's own rule, #4178's visibleRosterIdsWithinCap: the owner's
 * keep_visible picks first (TUL-1693), then the longest-standing. While keep_visible is not
 * migrated that rule falls back to 'featured', and so do the labels. When the rule returns
 * null (no restriction, flag off, or a read error) nobody is labelled, so nobody is wrongly
 * marked hidden.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { VISIBLE_PICKS_COPY, visibilityByMember } from "./visible-picks";
import { loadVisiblePicks } from "./visible-picks.server";

const WEB = process.cwd();
const ON = { HUB_PLAN_CAP_PICKS_ENABLED: "1" } as const;

type Row = Record<string, unknown>;

/** A tiny agency_talent_roster + agencies store that applies eq / in filters for real. */
function fakeDb(opts: {
  agency?: { plan_tier: string | null; talent_seat_limit: number | null } | null;
  rows: Row[];
  noKeepVisibleColumn?: boolean;
  failSelect?: (cols: string) => boolean;
}) {
  return {
    from(table: string) {
      let rows: Row[] = table === "agency_talent_roster" ? [...opts.rows] : [];
      let error: { message: string } | null = null;
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: (cols: string) => {
          if (opts.noKeepVisibleColumn && cols.includes("keep_visible")) error = { message: "column agency_talent_roster.keep_visible does not exist" };
          if (opts.failSelect?.(cols)) error = { message: "boom" };
          if (opts.noKeepVisibleColumn) rows = rows.map(({ keep_visible: _k, ...rest }) => rest);
          return q;
        },
        eq: (c: string, v: unknown) => {
          if (!c.includes(".")) rows = rows.filter((r) => r[c] === v);
          return q;
        },
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        neq: () => q,
        order: (c: string) => ((rows = [...rows].sort((a, b) => String(a[c]).localeCompare(String(b[c])))), q),
        maybeSingle: () => Promise.resolve(table === "agencies" ? { data: opts.agency ?? null, error: null } : { data: null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve(error ? { data: null, error } : { data: rows, error: null }).then(res),
      });
      return q;
    },
  };
}

const member = (id: string, added: string, vis: string, keep: boolean, extra: Row = {}): Row => ({
  tenant_id: "t1",
  talent_profile_id: id,
  status: "active",
  agency_visibility: vis,
  talent_site_hidden: false,
  keep_visible: keep,
  added_at: added,
  talent_profiles: { display_name: id.toUpperCase(), profile_kind: "person" },
  ...extra,
});

// Cap 2. Ana and Dani are 'featured'; only Cleo is the owner's keep_visible pick.
const ROWS = [
  member("a", "2026-01-01", "featured", false),
  member("b", "2026-02-01", "site_visible", false),
  member("c", "2026-03-01", "site_visible", true),
  member("d", "2026-04-01", "featured", false),
];
const CAP2 = { plan_tier: "studio", talent_seat_limit: 2 };

const labels = (r: Awaited<ReturnType<typeof loadVisiblePicks>>) => r && r.members.map((m) => [m.talentProfileId, r.visibility[m.talentProfileId] ?? "none"]);

describe("labels follow keep_visible (TUL-1693 own state)", () => {
  test("the pick (Cleo) plus the longest-standing (Ana) are visible; the rest are hidden by the plan's limit", async () => {
    const r = await loadVisiblePicks(fakeDb({ agency: CAP2, rows: ROWS }) as never, "t1", ON);
    assert.ok(r);
    assert.equal(r.pickAvailable, true);
    assert.deepEqual(labels(r), [["a", "visible"], ["b", "hidden"], ["c", "visible"], ["d", "hidden"]]);
  });
  test("'featured' alone is not a pick: two featured, no picks, the two oldest stay visible", async () => {
    const rows = ROWS.map((r) => ({ ...r, keep_visible: false }));
    const r = await loadVisiblePicks(fakeDb({ agency: CAP2, rows }) as never, "t1", ON);
    assert.deepEqual(labels(r), [["a", "visible"], ["b", "visible"], ["c", "hidden"], ["d", "hidden"]]);
  });
});

describe("keep_visible not migrated: labels fall back to 'featured', like the directory", () => {
  test("the featured members (Ana, Dani) are visible, the rest hidden; picks are not available", async () => {
    const r = await loadVisiblePicks(fakeDb({ agency: CAP2, rows: ROWS, noKeepVisibleColumn: true }) as never, "t1", ON);
    assert.ok(r);
    assert.equal(r.pickAvailable, false);
    assert.deepEqual(labels(r), [["a", "visible"], ["b", "hidden"], ["c", "hidden"], ["d", "visible"]]);
  });
});

describe("a null cap result labels nobody (never wrongly 'hidden')", () => {
  test("flag off", async () => {
    const r = await loadVisiblePicks(fakeDb({ agency: CAP2, rows: ROWS }) as never, "t1", {});
    assert.deepEqual(r?.visibility, {});
  });
  test("unlimited plan, or everyone fits in the cap", async () => {
    assert.deepEqual((await loadVisiblePicks(fakeDb({ agency: { plan_tier: "agency", talent_seat_limit: null }, rows: ROWS }) as never, "t1", ON))?.visibility, {});
    assert.deepEqual((await loadVisiblePicks(fakeDb({ agency: { plan_tier: "studio", talent_seat_limit: 10 }, rows: ROWS }) as never, "t1", ON))?.visibility, {});
  });
  test("the directory's roster read fails (it returns no ids): no labels, the list still loads", async () => {
    const r = await loadVisiblePicks(fakeDb({ agency: CAP2, rows: ROWS, failSelect: (c) => c.includes("profile_kind") }) as never, "t1", ON);
    assert.ok(r);
    assert.equal(r.members.length, 4);
    assert.deepEqual(r.visibility, {});
  });
  test("the cap read fails: no labels, the list still loads", async () => {
    const r = await loadVisiblePicks(fakeDb({ agency: CAP2, rows: ROWS, failSelect: (c) => c.startsWith("talent_profile_id, agency_visibility") }) as never, "t1", ON);
    assert.ok(r);
    assert.equal(r.members.length, 4);
    assert.deepEqual(r.visibility, {});
  });
});

describe("visibilityByMember (pure)", () => {
  test("null visible ids: nobody labelled", () => {
    assert.deepEqual(visibilityByMember(["a", "b"], ["a", "b"], null), {});
  });
  test("a member the directory never considered gets no label (the cap is not why they are off the site)", () => {
    assert.deepEqual(visibilityByMember(["a", "b", "z"], ["a", "b"], ["a"]), { a: "visible", b: "hidden" });
  });
  test("a member hidden from the site by their own setting is not counted, so is not labelled", async () => {
    const rows = [...ROWS.slice(0, 3), member("d", "2026-04-01", "featured", false, { talent_site_hidden: true })];
    const r = await loadVisiblePicks(fakeDb({ agency: CAP2, rows }) as never, "t1", ON);
    // b is now the 3rd of 3 public people over a cap of 2; d is not in the directory at all
    assert.deepEqual(labels(r), [["a", "visible"], ["b", "hidden"], ["c", "visible"], ["d", "none"]]);
  });
});

describe("copy and screen", () => {
  test("plain words in ES and EN", () => {
    assert.equal(VISIBLE_PICKS_COPY.es.stateVisible, "Visible");
    assert.equal(VISIBLE_PICKS_COPY.es.stateHidden, "Oculto por el límite del plan");
    assert.equal(VISIBLE_PICKS_COPY.en.stateVisible, "Visible");
    assert.equal(VISIBLE_PICKS_COPY.en.stateHidden, "Hidden by your plan's limit");
  });
  test("the panel shows a label only when there is a state, from picks.visibility", () => {
    const ui = readFileSync(path.join(WEB, "src/app/(workspace)/[tenantSlug]/admin/settings/visible-picks/VisiblePicksPanel.tsx"), "utf8");
    assert.match(ui, /if \(!state\) return null;/);
    assert.match(ui, /state=\{picks\.visibility\[m\.talentProfileId\]\}/);
    assert.match(ui, /c\.stateVisible : c\.stateHidden/);
  });
  test("the loader uses the directory's own rule and roster ids", () => {
    const src = readFileSync(path.join(WEB, "src/lib/service-hub/visible-picks.server.ts"), "utf8");
    assert.match(src, /listTalentIdsOnTenantRoster\(admin, tenantId\)/);
    assert.match(src, /visibleRosterIdsWithinCap\(admin, tenantId, rosterIds, cap, env\)/);
  });
});
