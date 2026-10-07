import assert from "node:assert/strict";
import test from "node:test";

import { classifySite, isWatchedDrifted, latestVersions, shellOriginVersions } from "./site-design-drift.mjs";
import { buildDiff, mergeSellingDefaults, parseExclusions, planWrites } from "./sync-qa-talent.mjs";

const releases = [
  { design_slug: "maison-v2", to_version: 23, status: "published" },
  { design_slug: "maison-v2", to_version: 24, status: "draft" },
];
const sites = [
  { theme_design_slug: "maison-v2", theme_design_version: 24 },
  { theme_design_slug: "gridline", theme_design_version: 1 },
  { theme_design_slug: "gridline", theme_design_version: 3 },
];

test("latest = published release, else highest published site version", () => {
  const l = latestVersions(releases, sites);
  assert.deepEqual(l.get("maison-v2"), { version: 23, source: "release" });
  assert.deepEqual(l.get("gridline"), { version: 3, source: "sites" });
});

test("classifier: behind, stale publish, and a clean site", () => {
  const l = latestVersions(releases, sites);
  const shell = (v) => [{ __origin: { version: v }, children: [{ props: { __origin: { version: v } } }] }];
  assert.equal(classifySite({ theme_design_slug: "maison-v2", theme_design_version: 21, shell_published: shell(21) }, l).behind, true);
  const stale = classifySite({ theme_design_slug: "maison-v2", theme_design_version: 23, shell_published: shell(21) }, l);
  assert.deepEqual([stale.behind, stale.staleShell, stale.shellVersion], [false, true, 21]);
  const ok = classifySite({ theme_design_slug: "maison-v2", theme_design_version: 23, shell_published: shell(23) }, l);
  assert.deepEqual([ok.behind, ok.staleShell], [false, false]);
  // ahead of the released version is not drift; no stamps cannot be called stale
  const ahead = classifySite({ theme_design_slug: "maison-v2", theme_design_version: 24, shell_published: null }, l);
  assert.deepEqual([ahead.behind, ahead.staleShell], [false, false]);
  assert.deepEqual(shellOriginVersions([{ __origin: { version: 5 }, children: [{ props: { __origin: { version: 7 } } }] }]), [5, 7]);
});

test("watched profiles gate the exit code", () => {
  assert.equal(isWatchedDrifted([{ profile_code: "TAL-1", behind: true }]), false);
  assert.equal(isWatchedDrifted([{ profile_code: "TAL-93900", behind: false, staleShell: true }]), true);
  assert.equal(isWatchedDrifted([{ profile_code: "TAL-93938", behind: true }]), true);
});

test("parseExclusions: explicit list wins, --auto defaults, none by default", () => {
  assert.deepEqual([...parseExclusions([])], []);
  assert.deepEqual([...parseExclusions(["--auto"])].sort(), ["bookingPosture", "inPersonMethods"]);
  assert.deepEqual([...parseExclusions(["--auto", "--exclude", "qaOfferings"])], ["qaOfferings"]);
  assert.deepEqual([...parseExclusions(["--exclude=bookingPosture, qaOfferings"])].sort(), ["bookingPosture", "qaOfferings"]);
});

const SRC = "f048e578-cbae-45db-9a3b-34239abea136";
const TGT = "c99f8adb-8ebb-4aad-911a-897e73efd369";
const talent = (id, sd, desc) => ({
  profile: { id, selling_defaults: sd },
  taxonomy: [],
  offerings: [{ id: `o-${id}`, title: "Cejas", kind: "service", sort_order: 1, description: desc }],
  hours: null,
  site: null,
});

test("excluded selling_defaults keys: no diff, target values preserved on write", () => {
  const exclude = new Set(["bookingPosture", "inPersonMethods"]);
  const s = talent(SRC, { bookingPosture: "on_demand", x: 1 }, null);
  const t = talent(TGT, { bookingPosture: "instant", inPersonMethods: ["cash"], x: 1 }, "keep me");
  assert.equal(buildDiff({ source: s, target: t, exclude }).entries.length, 0);
  assert.ok(buildDiff({ source: s, target: t }).entries.some((e) => e.field === "selling_defaults"));
  s.profile.selling_defaults.x = 2;
  const d = buildDiff({ source: s, target: t, exclude });
  const w = planWrites({ source: s, target: t, diff: d, targetProfileId: TGT, sourceProfileId: SRC, exclude });
  assert.deepEqual(w[0].set.selling_defaults.v, { x: 2, bookingPosture: "instant", inPersonMethods: ["cash"] });
  assert.deepEqual(mergeSellingDefaults({ a: 1 }, { bookingPosture: "z" }, new Set(["bookingPosture"])), { a: 1, bookingPosture: "z" });
});

test("descriptions: never cleared, copied when the source has one; qaOfferings hides extras", () => {
  const empty = buildDiff({ source: talent(SRC, {}, null), target: talent(TGT, {}, "keep me") });
  assert.equal(empty.entries.filter((e) => e.col === "description").length, 0);
  const copy = buildDiff({ source: talent(SRC, {}, "new"), target: talent(TGT, {}, "keep me") });
  assert.equal(copy.entries.filter((e) => e.col === "description" && e.source === "new").length, 1);
  const t = talent(TGT, {}, null);
  t.offerings.push({ id: "qa", title: "QA only", kind: "service", sort_order: 9 });
  assert.equal(buildDiff({ source: talent(SRC, {}, null), target: t }).entries.filter((e) => e.extra).length, 1);
  assert.equal(buildDiff({ source: talent(SRC, {}, null), target: t, exclude: new Set(["qaOfferings"]) }).entries.filter((e) => e.extra).length, 0);
});
