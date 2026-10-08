import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatPlan,
  parseArgs,
  planBackfill,
  planRestore,
  RefusedError,
  type BackupFile,
  type SiteCandidate,
} from "./backfill-default-design";

function site(over: Partial<SiteCandidate> = {}): SiteCandidate {
  return {
    siteId: "site-1",
    siteSlug: "ana-lopez",
    profileId: "prof-1",
    profileCode: "TAL-90001",
    displayName: "Ana Lopez",
    themeDesignSlug: null,
    sitePublishedAt: null,
    hasLivePages: false,
    hasTalentEdits: false,
    isDemo: false,
    isTestAccount: false,
    ...over,
  };
}

const opts = { only: [] as string[], includeTest: false };

describe("planBackfill", () => {
  it("touches an untouched null-design starter site", () => {
    const [e] = planBackfill([site()], opts);
    assert.equal(e!.action, "touch");
  });

  it("skips a site that already has a design (null vs set)", () => {
    const [e] = planBackfill([site({ themeDesignSlug: "maison-v2" })], opts);
    assert.deepEqual([e!.action, e!.reason], ["skip", "already_has_design"]);
    const [blank] = planBackfill([site({ themeDesignSlug: "  " })], opts);
    assert.equal(blank!.action, "touch");
  });

  it("refuses Jorgelina by profile code", () => {
    const [e] = planBackfill([site({ profileCode: "TAL-93938", siteSlug: "other" })], opts);
    assert.deepEqual([e!.action, e!.reason], ["skip", "forbidden"]);
  });

  it("refuses Jorgelina by site slug, even with another code, even under --include-test and --only", () => {
    const j = site({ profileCode: "TAL-90002", siteSlug: "book-jorgelina", isDemo: true });
    const [e] = planBackfill([j], { only: ["TAL-90002"], includeTest: true });
    assert.deepEqual([e!.action, e!.reason], ["skip", "forbidden"]);
  });

  it("is idempotent: a second pass over the applied state touches nothing", () => {
    const first = planBackfill([site(), site({ siteId: "s2", profileCode: "TAL-90003" })], opts);
    assert.equal(first.filter((e) => e.action === "touch").length, 2);
    const after = first.map((e) => ({ ...e.candidate, themeDesignSlug: "maison-v2" }));
    const second = planBackfill(after, opts);
    assert.equal(second.filter((e) => e.action === "touch").length, 0);
    assert.ok(second.every((e) => e.reason === "already_has_design"));
  });

  it("--only limits the touch list", () => {
    const entries = planBackfill(
      [site(), site({ siteId: "s2", profileCode: "TAL-90003", siteSlug: "b" })],
      { only: ["tal-90003"], includeTest: false },
    );
    assert.deepEqual(
      entries.filter((e) => e.action === "touch").map((e) => e.candidate.profileCode),
      ["TAL-90003"],
    );
    assert.equal(entries.find((e) => e.candidate.profileCode === "TAL-90001")!.reason, "not_in_only");
  });

  it("skips demo and test accounts unless --include-test", () => {
    const demo = site({ isDemo: true });
    const flagged = site({ siteId: "s3", profileCode: "TAL-90004", isTestAccount: true });
    const qa = site({ siteId: "s4", profileCode: "TAL-93900", siteSlug: "qa" });
    for (const c of [demo, flagged, qa]) {
      assert.equal(planBackfill([c], opts)[0]!.reason, "demo_or_test");
      assert.equal(planBackfill([c], { only: [], includeTest: true })[0]!.action, "touch");
    }
  });

  it("never touches a published site, live pages or a talent-edited draft", () => {
    assert.equal(planBackfill([site({ sitePublishedAt: "2026-10-01T00:00:00Z" })], opts)[0]!.reason, "published_site");
    assert.equal(planBackfill([site({ hasLivePages: true })], opts)[0]!.reason, "live_pages");
    assert.equal(planBackfill([site({ hasTalentEdits: true })], opts)[0]!.reason, "talent_edited_draft");
  });
});

describe("parseArgs", () => {
  it("defaults to a dry run", () => {
    const o = parseArgs([]);
    assert.equal(o.apply, false);
    assert.equal(o.yes, false);
  });
  it("needs --apply and --yes together", () => {
    assert.throws(() => parseArgs(["--apply"]), RefusedError);
    assert.throws(() => parseArgs(["--yes"]), RefusedError);
    assert.equal(parseArgs(["--apply", "--yes"]).apply, true);
  });
  it("refuses --only TAL-93938 and unknown flags", () => {
    assert.throws(() => parseArgs(["--only", "TAL-90001,tal-93938"]), RefusedError);
    assert.throws(() => parseArgs(["--nope"]), RefusedError);
  });
  it("parses --only, --include-test and --restore", () => {
    const o = parseArgs(["--only", "TAL-1,TAL-2", "--include-test"]);
    assert.deepEqual(o.only, ["TAL-1", "TAL-2"]);
    assert.equal(o.includeTest, true);
    assert.equal(parseArgs(["--restore", "f.json", "--yes"]).restore, "f.json");
    assert.throws(() => parseArgs(["--restore", "f.json", "--apply", "--yes"]), RefusedError);
    assert.throws(() => parseArgs(["--restore"]), RefusedError);
  });
});

describe("formatPlan", () => {
  it("prints code, id and slug for every site it would touch, and a reason for each exclusion", () => {
    const entries = planBackfill(
      [
        site(),
        site({ siteId: "s2", profileId: "prof-2", profileCode: "TAL-90002", siteSlug: "pub", sitePublishedAt: "2026-10-01" }),
        site({ siteId: "s3", profileCode: "TAL-93938", siteSlug: "book-jorgelina" }),
      ],
      opts,
    );
    const text = formatPlan(entries, { designSlug: "maison-v2", mode: "dry-run" });
    assert.match(text, /DRY RUN, nothing is written/);
    assert.match(text, /TAL-90001 {2}id=prof-1 {2}site=ana-lopez/);
    assert.match(text, /TAL-90002 {2}id=prof-2 {2}site=pub {2}-> site is published/);
    assert.match(text, /Needs publish after apply .*: 1/);
  });
  it("shows (none) for an empty plan", () => {
    const text = formatPlan([], { designSlug: "maison-v2", mode: "apply" });
    assert.match(text, /Would touch 0 site\(s\)/);
    assert.match(text, /\(none\)/);
  });
});

describe("planRestore", () => {
  const row = (over: Partial<BackupFile["rows"][number]> = {}): BackupFile["rows"][number] => ({
    profileCode: "TAL-90001",
    profileId: "prof-1",
    siteId: "site-1",
    siteSlug: "ana-lopez",
    site: {},
    homePage: null,
    after: { draftRev: 5, designSlug: "maison-v2", designVersion: 1 },
    ...over,
  });
  const backup = (rows: BackupFile["rows"]): BackupFile => ({ version: 1, createdAt: "x", designSlug: "maison-v2", rows });

  it("restores when the draft has not moved", () => {
    const [d] = planRestore(backup([row()]), new Map([["site-1", 5]]), false);
    assert.equal(d!.action, "restore");
  });
  it("skips a moved draft unless forced", () => {
    const cur = new Map([["site-1", 9]]);
    assert.equal(planRestore(backup([row()]), cur, false)[0]!.action, "skip");
    assert.equal(planRestore(backup([row()]), cur, true)[0]!.action, "restore");
  });
  it("skips rows never applied, missing sites and forbidden targets", () => {
    const cur = new Map([["site-1", 5]]);
    assert.equal(planRestore(backup([row({ after: undefined })]), cur, false)[0]!.action, "skip");
    assert.equal(planRestore(backup([row({ siteId: "gone" })]), cur, false)[0]!.action, "skip");
    assert.equal(planRestore(backup([row({ siteSlug: "book-jorgelina" })]), cur, true)[0]!.action, "skip");
    assert.equal(planRestore(backup([row({ profileCode: "TAL-93938" })]), cur, true)[0]!.action, "skip");
  });
});
