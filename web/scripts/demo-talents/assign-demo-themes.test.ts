import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DEMO_BATCH } from "../../src/lib/talent-site/theme-catalog/demo-account";
import { FINISHED_GALLERY_SLUGS } from "../../src/lib/talent-site/theme-catalog/gallery-meta";
import {
  FINISHED_DESIGN_SLUGS,
  formatPlan,
  formatRestore,
  parseArgs,
  pickPalette,
  planAssignments,
  planRestore,
  RefusedError,
  restorePatch,
  themeCounts,
  validateMap,
  type BackupFile,
  type PlanContext,
  type SiteFacts,
  type ThemeMapFile,
} from "./assign-demo-themes";

const HERE = dirname(fileURLToPath(import.meta.url));

const MAP: ThemeMapFile = {
  workbookThemeToDesign: { Maison: "maison-v2", Folio: "folio", Gridline: "gridline" },
  entries: [
    { demoId: "DEMO003", profileCode: "TAL-93103", siteSlug: "linh-tran", displayName: "Linh", workbookTheme: "Maison" },
    { demoId: "DEMO009", profileCode: "TAL-93109", siteSlug: "priya-shah", displayName: "Priya", workbookTheme: "Folio" },
    { demoId: "DEMO106", profileCode: "TAL-93206", siteSlug: "gary-lindqvist", displayName: "Gary", workbookTheme: "Gridline" },
    { demoId: "DEMO015", profileCode: "TAL-93115", siteSlug: "ines-ruiz", displayName: "Ines", workbookTheme: "Index" },
    { demoId: "DEMO016", profileCode: "TAL-93116", siteSlug: "otto-v", displayName: "Otto", workbookTheme: "Frame" },
  ],
};

const facts = (over: Partial<SiteFacts> & Pick<SiteFacts, "profileCode">): SiteFacts => ({
  siteId: `site-${over.profileCode}`,
  siteSlug: MAP.entries.find((e) => e.profileCode === over.profileCode)?.siteSlug ?? "x",
  profileId: `prof-${over.profileCode}`,
  displayName: "Demo",
  themeDesignSlug: null,
  isDemo: true,
  email: "demo-x@impronta.test",
  demoBatch: DEMO_BATCH,
  hasHomePage: true,
  ...over,
});

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  map: MAP,
  only: [],
  releasedDesigns: new Set(FINISHED_DESIGN_SLUGS),
  palettesFor: (d) => (d === "maison-v2" ? ["rose", "blush", "sage"] : d === "folio" ? ["stone", "light"] : ["default", "orange"]),
  registryPaletteFor: () => null,
  hasContentFixture: () => true,
  ...over,
});

const one = (f: SiteFacts, c: PlanContext = ctx()) => planAssignments([f], c)[0]!;

test("a finished theme with no design is assigned, with its workbook design and a palette", () => {
  const d = one(facts({ profileCode: "TAL-93103" }));
  assert.equal(d.action, "assign");
  assert.equal(d.action === "assign" && d.designSlug, "maison-v2");
  assert.equal(d.action === "assign" && d.workbookTheme, "Maison");
  assert.ok(d.action === "assign" && ["rose", "blush", "sage"].includes(d.palette));
  assert.equal(one(facts({ profileCode: "TAL-93109" })).action === "assign" && (one(facts({ profileCode: "TAL-93109" })) as { designSlug: string }).designSlug, "folio");
});

test("an unfinished workbook theme is queued and never assigned", () => {
  for (const code of ["TAL-93115", "TAL-93116"]) {
    const d = one(facts({ profileCode: code }));
    assert.equal(d.action, "queue", code);
    assert.equal(d.action === "queue" && d.reason, "theme_unfinished");
  }
});

test("Maison v1 is never an assignment target", () => {
  assert.ok(!FINISHED_DESIGN_SLUGS.includes("maison"));
  assert.throws(() => validateMap({ ...MAP, workbookThemeToDesign: { Maison: "maison" } }), RefusedError);
});

test("FINISHED_DESIGN_SLUGS is exactly the gallery's finished set minus Maison v1", () => {
  assert.deepEqual([...FINISHED_DESIGN_SLUGS].sort(), FINISHED_GALLERY_SLUGS.filter((s) => s !== "maison").sort());
});

test("a code the map does not list is UNMAPPED and skipped, not guessed", () => {
  const d = one(facts({ profileCode: "TAL-93999" }));
  assert.equal(d.action, "skip");
  assert.equal(d.action === "skip" && d.reason, "unmapped");
});

test("a non-demo profile is refused per row, even when its code is in the map", () => {
  for (const isDemo of [false, null] as const) {
    const d = one(facts({ profileCode: "TAL-93103", isDemo }));
    assert.equal(d.action === "skip" && d.reason, "not_demo");
  }
});

test("a flagged profile whose account is not a demo account is refused", () => {
  assert.equal(one(facts({ profileCode: "TAL-93103", email: "real@person.com" })).action === "skip", true);
  assert.equal(one(facts({ profileCode: "TAL-93103", demoBatch: "other" })).action === "skip", true);
  const d = one(facts({ profileCode: "TAL-93103", email: "real@person.com" }));
  assert.equal(d.action === "skip" && d.reason, "not_demo_account");
});

test("Jorgelina, the QA talent and her slug are refused before anything else", () => {
  for (const code of ["TAL-93938", "TAL-93900", "TAL-93901", "TAL-93939"]) {
    const d = one(facts({ profileCode: code, siteSlug: "whatever" }));
    assert.equal(d.action === "skip" && d.reason, "forbidden", code);
  }
  const bySlug = one(facts({ profileCode: "TAL-93103", siteSlug: "book-jorgelina" }));
  assert.equal(bySlug.action === "skip" && bySlug.reason, "forbidden");
  // Forbidden even when the map is poisoned.
  assert.throws(() => validateMap({ ...MAP, entries: [...MAP.entries, { demoId: "X", profileCode: "TAL-93938", siteSlug: null, displayName: "J", workbookTheme: "Maison" }] }), RefusedError);
  assert.throws(() => validateMap({ ...MAP, entries: [...MAP.entries, { demoId: "X", profileCode: "TAL-93900", siteSlug: null, displayName: "T", workbookTheme: "Maison" }] }), RefusedError);
});

test("a site that already has a theme is a no-op, and a second run assigns nothing (idempotent)", () => {
  const first = planAssignments([facts({ profileCode: "TAL-93103" })], ctx());
  assert.equal(first[0]!.action, "assign");
  // The state after the apply: the same site now carries the design.
  const second = planAssignments([facts({ profileCode: "TAL-93103", themeDesignSlug: "maison-v2" })], ctx());
  assert.equal(second[0]!.action, "noop");
  assert.equal(second[0]!.action === "noop" && second[0]!.matchesWorkbook, true);
  // A different existing theme is left alone and reported as differing.
  const other = one(facts({ profileCode: "TAL-93103", themeDesignSlug: "folio" }));
  assert.equal(other.action === "noop" && other.matchesWorkbook, false);
});

test("an unmapped demo that already has a theme is a no-op, never touched", () => {
  const d = one(facts({ profileCode: "TAL-93020", siteSlug: "alba", themeDesignSlug: "maison-v2" }));
  assert.equal(d.action, "noop");
});

test("--only restricts to the listed codes; the others are not_in_only", () => {
  const all = [facts({ profileCode: "TAL-93103" }), facts({ profileCode: "TAL-93109" })];
  const d = planAssignments(all, ctx({ only: ["TAL-93109"] }));
  assert.equal(d.find((x) => x.facts.profileCode === "TAL-93109")!.action, "assign");
  const skipped = d.find((x) => x.facts.profileCode === "TAL-93103")!;
  assert.equal(skipped.action === "skip" && skipped.reason, "not_in_only");
});

test("a site slug that differs from the map is left alone (identity not confirmed)", () => {
  const d = one(facts({ profileCode: "TAL-93103", siteSlug: "someone-else" }));
  assert.equal(d.action === "skip" && d.reason, "site_slug_mismatch");
});

test("a finished design with no demos-channel release is queued, not applied", () => {
  const d = one(facts({ profileCode: "TAL-93206" }), ctx({ releasedDesigns: new Set(["maison-v2", "folio"]) }));
  assert.equal(d.action === "queue" && d.reason, "design_not_released");
});

test("Gridline without a content fixture is queued; with one it is assigned", () => {
  assert.equal(one(facts({ profileCode: "TAL-93206" }), ctx({ hasContentFixture: () => false })).action === "queue", true);
  assert.equal(one(facts({ profileCode: "TAL-93206" })).action, "assign");
});

test("a site with no home page is skipped, not failed", () => {
  const d = one(facts({ profileCode: "TAL-93103", hasHomePage: false }));
  assert.equal(d.action === "skip" && d.reason, "no_home_page");
});

test("palette is deterministic and ignores --only; a registry palette wins", () => {
  const p = ["rose", "blush", "sage"];
  assert.equal(pickPalette("TAL-93103", p, null), pickPalette("TAL-93103", p, null));
  assert.equal(pickPalette("TAL-93103", p, "sage"), "sage");
  assert.equal(pickPalette("TAL-93103", p, "not-a-palette"), p[103 % 3]);
  assert.equal(pickPalette("TAL-93103", [], null), null);
  const a = planAssignments([facts({ profileCode: "TAL-93103" })], ctx())[0]!;
  const b = planAssignments([facts({ profileCode: "TAL-93103" }), facts({ profileCode: "TAL-93109" })], ctx({ only: ["TAL-93103"] }))[0]!;
  assert.equal(a.action === "assign" && a.palette, b.action === "assign" && b.palette);
});

test("formatPlan prints profile code, id and site slug for EVERY site it would touch, and the queue per theme", () => {
  const out = formatPlan(
    planAssignments(
      [facts({ profileCode: "TAL-93103" }), facts({ profileCode: "TAL-93109" }), facts({ profileCode: "TAL-93115" }), facts({ profileCode: "TAL-93999" })],
      ctx(),
    ),
    { mode: "dry-run" },
  );
  assert.match(out, /DRY RUN, nothing is written/);
  assert.match(out, /Would assign 2 site\(s\)/);
  assert.match(out, /TAL-93103 {2}id=prof-TAL-93103 {2}site=linh-tran {2}Maison -> maison-v2/);
  assert.match(out, /TAL-93109 {2}id=prof-TAL-93109 {2}site=priya-shah/);
  assert.match(out, /Queued, NOT touched: 1 site\(s\) in 1 theme\(s\)/);
  assert.match(out, /Index \(index\): 1 {2}queued until theme finished/);
  assert.match(out, /TAL-93999.*UNMAPPED/);
  assert.match(out, /never does/);
});

test("formatPlan with nothing to touch says so", () => {
  const out = formatPlan(planAssignments([facts({ profileCode: "TAL-93103", themeDesignSlug: "maison-v2" })], ctx()), { mode: "apply" });
  assert.match(out, /Would assign 0 site\(s\)[\s\S]*\(none\)/);
  assert.match(out, /Already have a theme \(no-op\): 1/);
});

// ---------------------------------------------------------------- arguments

test("dry run is the default; --apply needs --yes; --yes alone is refused", () => {
  assert.deepEqual(parseArgs([]), { apply: false, yes: false, only: [], restore: null, forceRestore: false });
  assert.throws(() => parseArgs(["--apply"]), RefusedError);
  assert.throws(() => parseArgs(["--yes"]), RefusedError);
  assert.equal(parseArgs(["--apply", "--yes"]).apply, true);
});

test("--only parses, upper-cases, and refuses forbidden or non-demo codes", () => {
  assert.deepEqual(parseArgs(["--only", "tal-93103,TAL-93109"]).only, ["TAL-93103", "TAL-93109"]);
  assert.throws(() => parseArgs(["--only", "TAL-93938"]), RefusedError);
  assert.throws(() => parseArgs(["--only", "TAL-93900"]), RefusedError);
  assert.throws(() => parseArgs(["--only", "TAL-12345"]), RefusedError);
  assert.throws(() => parseArgs(["--bogus"]), RefusedError);
});

test("--restore is its own mode", () => {
  assert.equal(parseArgs(["--restore", "f.json"]).restore, "f.json");
  assert.equal(parseArgs(["--restore", "f.json", "--yes"]).yes, true);
  assert.throws(() => parseArgs(["--restore"]), RefusedError);
  assert.throws(() => parseArgs(["--restore", "f.json", "--apply", "--yes"]), RefusedError);
  assert.throws(() => parseArgs(["--force-restore"]), RefusedError);
});

// ---------------------------------------------------------------- restore

const row = (code: string, over: Partial<BackupFile["rows"][number]> = {}): BackupFile["rows"][number] => ({
  profileCode: code,
  profileId: `prof-${code}`,
  siteId: `site-${code}`,
  siteSlug: `slug-${code}`,
  site: { theme_design_slug: null, draft_rev: 4, shell_tree: [] },
  homePage: { id: "home", blocks: [] },
  after: { draftRev: 5, designSlug: "maison-v2", designVersion: 24 },
  ...over,
});
const backup = (rows: BackupFile["rows"]): BackupFile => ({ version: 1, createdAt: "t", rows });

test("restore: restores an untouched-since row, skips moved drafts unless forced", () => {
  const b = backup([row("TAL-93103")]);
  const same = new Map([["site-TAL-93103", { draftRev: 5, isDemo: true }]]);
  assert.equal(planRestore(b, same, false)[0]!.action, "restore");
  const moved = new Map([["site-TAL-93103", { draftRev: 9, isDemo: true }]]);
  const d = planRestore(b, moved, false)[0]!;
  assert.equal(d.action, "skip");
  assert.match(d.action === "skip" ? d.reason : "", /draft_rev moved/);
  assert.equal(planRestore(b, moved, true)[0]!.action, "restore");
});

test("restore: refuses forbidden, non-demo, missing and never-applied rows", () => {
  const cur = (rev: number, isDemo: boolean | null) => new Map([["site-X", { draftRev: rev, isDemo }]]);
  assert.match((planRestore(backup([row("TAL-93938", { siteId: "site-X" })]), cur(5, true), true)[0] as { reason: string }).reason, /forbidden/);
  assert.match((planRestore(backup([row("TAL-93103", { siteId: "site-X", siteSlug: "book-jorgelina" })]), cur(5, true), true)[0] as { reason: string }).reason, /forbidden/);
  assert.match((planRestore(backup([row("TAL-93103", { siteId: "site-X" })]), cur(5, false), true)[0] as { reason: string }).reason, /is_demo/);
  assert.match((planRestore(backup([row("TAL-93103", { siteId: "site-X" })]), new Map(), true)[0] as { reason: string }).reason, /no longer exists/);
  assert.match((planRestore(backup([row("TAL-93103", { siteId: "site-X", after: undefined })]), cur(5, true), true)[0] as { reason: string }).reason, /never completed/);
});

test("restore patch drops draft_rev (the counter only moves forward) and keeps the design columns", () => {
  const patch = restorePatch(row("TAL-93103"));
  assert.ok(!("draft_rev" in patch));
  assert.equal(patch.theme_design_slug, null);
  assert.deepEqual(patch.shell_tree, []);
});

test("formatRestore lists every row with code, id and slug", () => {
  const b = backup([row("TAL-93103"), row("TAL-93109", { after: undefined })]);
  const out = formatRestore(planRestore(b, new Map([["site-TAL-93103", { draftRev: 5, isDemo: true }], ["site-TAL-93109", { draftRev: 5, isDemo: true }]]), false));
  assert.match(out, /RESTORE TAL-93103 id=prof-TAL-93103 site=slug-TAL-93103/);
  assert.match(out, /SKIP {4}TAL-93109 id=prof-TAL-93109/);
});

// ---------------------------------------------------------------- the committed map

const real = JSON.parse(readFileSync(join(HERE, "demo-theme-map.json"), "utf8")) as ThemeMapFile;

test("the committed workbook map is valid, complete and has 7 demos per theme", () => {
  assert.doesNotThrow(() => validateMap(real));
  assert.equal(real.entries.length, 224);
  const counts = themeCounts(real);
  assert.equal(counts.length, 32);
  assert.ok(counts.every((c) => c.demos === 7));
  assert.deepEqual(
    counts.filter((c) => c.finished).map((c) => c.designSlug).sort(),
    ["folio", "gridline", "maison-v2"],
  );
  assert.ok(real.entries.every((e) => e.siteSlug), "every entry carries its site slug (identity check)");
});

test("every finished-theme demo in the map is already a registered theme demo (so a clean run assigns none of them twice)", async () => {
  const { THEME_DEMOS } = await import("../../src/lib/talent-site/theme-catalog/theme-demos");
  const registered = new Map(THEME_DEMOS.map((d) => [d.profileCode, d]));
  for (const c of themeCounts(real).filter((x) => x.finished)) {
    for (const e of real.entries.filter((x) => x.workbookTheme === c.workbookTheme)) {
      const reg = registered.get(e.profileCode);
      assert.ok(reg, `${e.profileCode} (${c.workbookTheme}) is not in THEME_DEMOS`);
      assert.equal(reg!.design, c.designSlug, e.profileCode);
      assert.equal(reg!.siteSlug, e.siteSlug, e.profileCode);
    }
  }
});
