import test from "node:test";
import assert from "node:assert/strict";

import { executeChannelChange, type ChannelDeps } from "./channel";
import {
  aggregateDryRun,
  buildDryRunReport,
  checkChannelChange,
  classifySiteReport,
  dryRunIsFresh,
  hashItems,
  orderDemosFirst,
  siteResultFromReport,
  type SiteDryRunResult,
} from "./dry-run";
import { fanOutWithPorts, type FanOutPorts } from "./fan-out";
import { applyItemEdit, cleanScreenshotUrl, editItemInList, itemsMissingNotes } from "./items";
import { inRolloutBucket, planFanOut, themeUpdateCopy, type FanOutSite } from "./notify";
import { emptyReport, type ReleaseItem, type ThemeRelease } from "../types";

// ── fixtures (demo sites only: no real talent ids anywhere) ──────────────────

const ITEMS: ReleaseItem[] = [
  { type: "variant-default", key: "home:hero" },
  { type: "new-block", key: "home:beforeAfter" },
];

function site(code: string, over: Partial<SiteDryRunResult> = {}): SiteDryRunResult {
  return {
    siteId: `site-${code}`,
    profileCode: code,
    displayName: `Demo ${code}`,
    isDemo: true,
    pinnedVersion: 1,
    status: "clean",
    noBase: false,
    counts: { applied: 3, kept: 0, conflicts: 0, added: 0, pending: 0, removed: 0 },
    kept: [],
    conflicts: [],
    ...over,
  };
}

function release(over: Partial<ThemeRelease> = {}): ThemeRelease {
  return {
    id: "rel-1",
    design_slug: "maison-v2",
    from_version: 1,
    to_version: 2,
    channel: "draft",
    status: "draft",
    notes: {},
    items: ITEMS,
    rollout_pct: 0,
    critical: false,
    dry_run_report: null,
    created_by: null,
    created_at: "",
    published_at: null,
    updated_at: "",
    ...over,
  };
}

function withFreshReport(over: Partial<ThemeRelease> = {}, results: SiteDryRunResult[] = [site("TAL-93003")]): ThemeRelease {
  const base = release(over);
  return { ...base, dry_run_report: buildDryRunReport(base, results, "2026-09-30T00:00:00.000Z") };
}

// ── dry-run aggregation ──────────────────────────────────────────────────────

test("classifySiteReport: conflicts beat kept beats clean", () => {
  const r = emptyReport();
  assert.equal(classifySiteReport(r), "clean");
  r.kept.push({ seq: 1, change: "props", key: "hero", reason: "edited" });
  assert.equal(classifySiteReport(r), "kept");
  r.conflicts.push({ seq: 2, change: "props", key: "hero" });
  assert.equal(classifySiteReport(r), "conflicts");
});

test("siteResultFromReport trims the drill-down and counts every bucket", () => {
  const r = emptyReport();
  for (let i = 0; i < 40; i += 1) r.kept.push({ seq: i, change: "props", key: `k${i}`, reason: "edited" });
  r.applied.push({ seq: 100, change: "props", key: "a" });
  r.added.push({ seq: 101, change: "insert", key: "b" });
  const res = siteResultFromReport(
    { siteId: "s", profileCode: "TAL-93003", displayName: "Camila", isDemo: true, pinnedVersion: 1, noBase: false },
    r,
  );
  assert.equal(res.status, "kept");
  assert.equal(res.counts.kept, 40);
  assert.equal(res.counts.applied, 1);
  assert.equal(res.counts.added, 1);
  assert.equal(res.kept.length, 24);
});

test("aggregateDryRun tallies all sites and demos separately", () => {
  const rows = [
    site("TAL-93003"),
    site("TAL-93002", { status: "kept" }),
    site("TAL-93103", { status: "conflicts" }),
    site("TAL-90001", { isDemo: false, status: "error", error: "boom" }),
    site("TAL-90002", { isDemo: false, noBase: true }),
  ];
  const s = aggregateDryRun(rows);
  assert.deepEqual(
    { total: s.total, clean: s.clean, kept: s.kept, conflicts: s.conflicts, errors: s.errors, noBase: s.noBase },
    { total: 5, clean: 2, kept: 1, conflicts: 1, errors: 1, noBase: 1 },
  );
  assert.deepEqual(s.demos, { total: 3, clean: 1, kept: 1, conflicts: 1, errors: 0 });
});

test("report orders demos first and pins the release + items hash", () => {
  const rel = release();
  const rep = buildDryRunReport(rel, [site("TAL-90002", { isDemo: false }), site("TAL-93003")]);
  assert.equal(rep.sites[0]!.profileCode, "TAL-93003");
  assert.equal(rep.releaseId, "rel-1");
  assert.equal(rep.toVersion, 2);
  assert.equal(rep.itemsHash, hashItems(ITEMS));
  assert.deepEqual(orderDemosFirst([{ isDemo: false, profileCode: "b" }, { isDemo: true, profileCode: "z" }]).map((x) => x.profileCode), ["z", "b"]);
});

// ── channel guard ────────────────────────────────────────────────────────────

test("guard: no dry run means refused", () => {
  const g = checkChannelChange(release(), "demos");
  assert.equal(g.ok, false);
  assert.match((g as { error: string }).error, /dry run/i);
});

test("guard: a report for another release or edited items is stale", () => {
  const good = withFreshReport();
  assert.equal(dryRunIsFresh(good).ok, true);
  assert.equal(dryRunIsFresh({ ...good, id: "rel-2" }).ok, false);
  assert.equal(dryRunIsFresh({ ...good, to_version: 3 }).ok, false);
  const edited = { ...good, items: [{ ...ITEMS[0]!, note: { en: "changed" } }, ITEMS[1]!] };
  const g = checkChannelChange(edited, "demos");
  assert.equal(g.ok, false);
  assert.match((g as { error: string }).error, /changed after/i);
});

test("guard: one step at a time, no failed sites, archived and paused refuse", () => {
  const fresh = withFreshReport();
  assert.equal(checkChannelChange(fresh, "demos").ok, true);
  assert.equal(checkChannelChange(fresh, "optin").ok, false);
  assert.equal(checkChannelChange(fresh, "default").ok, false);
  assert.equal(checkChannelChange(fresh, "draft").ok, false);
  const failed = withFreshReport({}, [site("TAL-93003", { status: "error", error: "x" })]);
  assert.equal(checkChannelChange(failed, "demos").ok, false);
  assert.equal(checkChannelChange({ ...fresh, status: "archived" }, "demos").ok, false);
  assert.equal(checkChannelChange({ ...fresh, status: "paused" }, "demos").ok, false);
  const atDemos = withFreshReport({ channel: "demos" });
  assert.equal(checkChannelChange(atDemos, "optin").ok, true);
});

function spyDeps(): { deps: ChannelDeps; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      applyToDemos: async () => (calls.push("demos"), { ok: true as const, applied: 8 }),
      fanOut: async () => (calls.push("fanOut"), { updates: 2, bells: 2 }),
      persist: async (c) => (calls.push(`persist:${c}`), { ok: true as const }),
    },
  };
}

test("executeChannelChange: no dry run touches nothing", async () => {
  const { deps, calls } = spyDeps();
  const res = await executeChannelChange(release(), "demos", deps);
  assert.equal(res.ok, false);
  assert.deepEqual(calls, []);
});

test("executeChannelChange: demos applies then persists; optin needs rollout > 0", async () => {
  const a = spyDeps();
  const r1 = await executeChannelChange(withFreshReport(), "demos", a.deps);
  assert.equal(r1.ok, true);
  assert.deepEqual(a.calls, ["demos", "persist:demos"]);

  const b = spyDeps();
  const zero = await executeChannelChange(withFreshReport({ channel: "demos" }), "optin", b.deps);
  assert.equal(zero.ok, false);
  assert.deepEqual(b.calls, []);

  const c = spyDeps();
  const open = await executeChannelChange(withFreshReport({ channel: "demos", rollout_pct: 50 }), "optin", c.deps);
  assert.equal(open.ok, true);
  assert.deepEqual(c.calls, ["fanOut", "persist:optin"]);
});

test("executeChannelChange: a failing demo apply does not advance the channel", async () => {
  const { deps, calls } = spyDeps();
  deps.applyToDemos = async () => (calls.push("demos"), { ok: false as const, error: "TAL-93103: boom" });
  const res = await executeChannelChange(withFreshReport(), "demos", deps);
  assert.equal(res.ok, false);
  assert.deepEqual(calls, ["demos"]);
});

test("executeChannelChange: demo cache-clear warnings reach the result", async () => {
  const { deps } = spyDeps();
  deps.applyToDemos = async () => ({ ok: true as const, applied: 2, warnings: ["TAL-93003: cache not cleared (offline)"] });
  const res = await executeChannelChange(withFreshReport(), "demos", deps);
  assert.equal(res.ok, true);
  assert.deepEqual((res as { warnings: string[] }).warnings, ["TAL-93003: cache not cleared (offline)"]);
});

test("executeChannelChange: Make default flips the catalog first; a failed flip touches nothing", async () => {
  const ok = spyDeps();
  ok.deps.flipCatalog = async () => (ok.calls.push("flip"), { ok: true as const });
  const res = await executeChannelChange(withFreshReport({ channel: "optin", status: "published", rollout_pct: 100 }), "default", ok.deps);
  assert.equal(res.ok, true);
  assert.deepEqual(ok.calls, ["flip", "fanOut", "persist:default"]);

  const bad = spyDeps();
  bad.deps.flipCatalog = async () => (bad.calls.push("flip"), { ok: false as const, error: "no snapshot" });
  const refused = await executeChannelChange(withFreshReport({ channel: "optin", status: "published", rollout_pct: 100 }), "default", bad.deps);
  assert.equal(refused.ok, false);
  assert.deepEqual(bad.calls, ["flip"]);

  const demos = spyDeps();
  demos.deps.flipCatalog = async () => (demos.calls.push("flip"), { ok: true as const });
  await executeChannelChange(withFreshReport(), "demos", demos.deps);
  assert.ok(!demos.calls.includes("flip"), "only default flips the catalog");
});

// ── gated catalog: flip from the snapshot ────────────────────────────────────

function catalogRow(version: number, payload: unknown) {
  return {
    id: "row-1", kind: "design", slug: "maison-v2", title: "Maison v2", summary: "s", category: null, tags: [],
    payload, preview: {}, required_talent_tier: "talent_basic", status: "published", source: "builtin", version,
    schema_version: 1, sort_order: 1, is_new_until: null, created_by: null, updated_by: null, created_at: "", updated_at: "",
  };
}

function flipAdmin(catalogVersion: number, snapshot: unknown | null) {
  const updates: unknown[] = [];
  const admin = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () =>
          Promise.resolve({
            data: table === "talent_theme_catalog" ? catalogRow(catalogVersion, { shellTree: [], homeTree: [] }) : snapshot ? { payload: snapshot } : null,
            error: null,
          }),
        update: (arg: unknown) => {
          updates.push(arg);
          const u = { eq: () => u, select: () => Promise.resolve({ data: [{ id: "row-1" }], error: null }) };
          return u;
        },
      };
      return q;
    },
  };
  return { admin: admin as never, updates };
}

test("flipCatalogToRelease: moves the row to the snapshot payload; idempotent; refuses without a snapshot", async () => {
  const { flipCatalogToRelease, loadReleaseDesign } = await import("../release-design.server");
  const { buildMaisonV2Payload } = await import("../../theme-catalog/collection/designs");
  const snap = buildMaisonV2Payload();
  const rel = { design_slug: "maison-v2", to_version: 15 };

  const a = flipAdmin(14, snap);
  const r = await flipCatalogToRelease(a.admin, rel);
  assert.deepEqual(r, { ok: true, flipped: true });
  const written = a.updates[0] as { version: number; payload: unknown };
  assert.equal(written.version, 15);
  assert.deepEqual(written.payload, snap);

  const already = flipAdmin(15, snap);
  assert.deepEqual(await flipCatalogToRelease(already.admin, rel), { ok: true, flipped: false });
  assert.equal(already.updates.length, 0);

  const none = flipAdmin(14, null);
  const refused = await flipCatalogToRelease(none.admin, rel);
  assert.equal(refused.ok, false);
  assert.equal(none.updates.length, 0);

  // Preview / apply read the target Design from the snapshot while the catalog is behind.
  const view = await loadReleaseDesign(flipAdmin(14, snap).admin, rel);
  assert.equal(view?.version, 15);
  assert.deepEqual(view?.payload, snap);
});

// ── notification fan-out (demo sites only) ───────────────────────────────────

const DEMO_SITES: Array<FanOutSite & { pinnedVersion: number | null }> = [
  { siteId: "site-93003", talentProfileId: "p-93003", userId: "u-93003", designTitle: "Maison v2", locale: "es-MX", pinnedVersion: 1 },
  { siteId: "site-93002", talentProfileId: "p-93002", userId: "u-93002", designTitle: "Maison v2", locale: null, pinnedVersion: 1 },
  { siteId: "site-93103", talentProfileId: "p-93103", userId: "u-93103", designTitle: "Maison v2", locale: "en", pinnedVersion: 2 },
];

test("rollout bucket: 0 none, 100 all, deterministic in between", () => {
  assert.equal(inRolloutBucket("s", "r", 0), false);
  assert.equal(inRolloutBucket("s", "r", 100), true);
  assert.equal(inRolloutBucket("s", "r", 40), inRolloutBucket("s", "r", 40));
  const hits = Array.from({ length: 400 }, (_, i) => inRolloutBucket(`site-${i}`, "rel-1", 50)).filter(Boolean).length;
  assert.ok(hits > 120 && hits < 280, `bucket roughly half, got ${hits}`);
});

test("planFanOut: one update per site, one bell per talent, solo-talent shape", () => {
  const plan = planFanOut({ id: "rel-1", design_slug: "maison-v2", to_version: 2, rollout_pct: 100 }, DEMO_SITES.slice(0, 2));
  assert.equal(plan.updates.length, 2);
  assert.ok(plan.updates.every((u) => u.state === "available" && u.release_id === "rel-1"));
  assert.equal(plan.bells.length, 2);
  for (const b of plan.bells) {
    assert.equal(b.tenant_id, null);
    assert.equal(b.surface, "talent");
    assert.equal(b.kind, "system");
    assert.equal(b.origin_event_id, "rel-1");
    assert.equal(b.target_payload.kind, "theme_update");
  }
  assert.match(plan.bells[0]!.title, /actualización/);
  assert.match(plan.bells[1]!.title, /has an update/);
  assert.equal(planFanOut({ id: "rel-1", design_slug: "m", to_version: 2, rollout_pct: 0 }, DEMO_SITES).updates.length, 0);
});

test("copy has no em dashes and is bilingual", () => {
  for (const l of ["en", "es"]) {
    const c = themeUpdateCopy("Maison v2", l);
    assert.doesNotMatch(c.title + c.body, /—/);
  }
  assert.notEqual(themeUpdateCopy("X", "en").title, themeUpdateCopy("X", "es").title);
});

function memoryPorts() {
  const updates: string[] = [];
  const bells: string[] = [];
  const ports: FanOutPorts = {
    existingUpdateSiteIds: async () => new Set(updates),
    existingBellUserIds: async () => new Set(bells),
    insertUpdates: async (rows) => void rows.forEach((r) => updates.push(r.talent_site_id)),
    insertBells: async (rows) => void rows.forEach((r) => bells.push(r.user_id)),
  };
  return { ports, updates, bells };
}

test("fanOutWithPorts: skips sites already on the target, and is idempotent", async () => {
  const m = memoryPorts();
  const rel = { id: "rel-1", design_slug: "maison-v2", to_version: 2, rollout_pct: 100 };
  const first = await fanOutWithPorts(m.ports, rel, DEMO_SITES);
  assert.deepEqual(first, { updates: 2, bells: 2 });
  assert.deepEqual(m.updates.sort(), ["site-93002", "site-93003"]);
  const again = await fanOutWithPorts(m.ports, rel, DEMO_SITES);
  assert.deepEqual(again, { updates: 0, bells: 0 });
});

test("fanOutWithPorts: raising rollout later notifies only the newly included sites", async () => {
  const m = memoryPorts();
  const rel = { id: "rel-9", design_slug: "maison-v2", to_version: 2, rollout_pct: 0 };
  assert.deepEqual(await fanOutWithPorts(m.ports, rel, DEMO_SITES), { updates: 0, bells: 0 });
  const some = await fanOutWithPorts(m.ports, { ...rel, rollout_pct: 100 }, DEMO_SITES);
  assert.equal(some.updates, 2);
});

// ── item edits ───────────────────────────────────────────────────────────────

test("item edit: type, EN/ES notes, screenshot, critical round trip", () => {
  const it = applyItemEdit(ITEMS[0]!, { noteEn: "  Softer hero  ", noteEs: "Hero mas suave", screenshotUrl: "https://example.com/a.png" });
  assert.equal(it.note?.en, "Softer hero");
  assert.equal(it.note?.es, "Hero mas suave");
  assert.equal(it.detail?.screenshotUrl, "https://example.com/a.png");
  const crit = applyItemEdit(it, { critical: true });
  assert.equal(crit.type, "critical");
  assert.equal(crit.detail?.wasType, "variant-default");
  const back = applyItemEdit(crit, { critical: false });
  assert.equal(back.type, "variant-default");
  assert.equal(back.detail?.wasType, undefined);
  assert.equal(applyItemEdit(it, { screenshotUrl: "" }).detail?.screenshotUrl, undefined);
});

test("item edit: only https screenshots; unknown ids untouched", () => {
  assert.equal(cleanScreenshotUrl("javascript:alert(1)"), null);
  assert.equal(cleanScreenshotUrl("http://example.com/a.png"), null);
  assert.equal(cleanScreenshotUrl("https://example.com/a.png"), "https://example.com/a.png");
  const out = editItemInList(ITEMS, "nope", { type: "code" });
  assert.deepEqual(out, ITEMS);
  const one = editItemInList(ITEMS, "new-block:home:beforeAfter", { type: "layout" });
  assert.equal(one[1]!.type, "layout");
  assert.equal(itemsMissingNotes(ITEMS), 2);
});
