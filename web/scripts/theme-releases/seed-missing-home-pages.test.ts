import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_TARGET_CODES,
  formatPlan,
  parseArgs,
  planSeed,
  RefusedError,
  type SiteCandidate,
} from "./seed-missing-home-pages";

function site(over: Partial<SiteCandidate> = {}): SiteCandidate {
  return {
    profileCode: "TAL-92001",
    profileId: "prof-1",
    displayName: "Sofia",
    siteId: "site-1",
    siteSlug: "sofia",
    themeDesignSlug: null,
    sitePublishedAt: null,
    hasHomePage: false,
    hasHomeSlugPage: false,
    homeSlugPageId: null,
    hasLivePages: false,
    hasTalentEdits: false,
    pageCount: 0,
    isDemo: false,
    isTestAccount: false,
    ...over,
  };
}

const opts = { only: [] as string[], includeTest: false };

describe("planSeed", () => {
  it("touches an unpublished site with no home page", () => {
    const [e] = planSeed([site()], opts);
    assert.equal(e!.action, "touch");
  });

  it("defaults allow-list to the nine card codes", () => {
    assert.equal(DEFAULT_TARGET_CODES.length, 9);
    const outsider = site({ profileCode: "TAL-99999", profileId: "x", siteId: "s" });
    assert.equal(planSeed([outsider], opts)[0]!.reason, "not_in_only");
    assert.equal(planSeed([site({ profileCode: "TAL-92149" })], opts)[0]!.action, "touch");
  });

  it("skips already_has_home (idempotent)", () => {
    const [e] = planSeed([site({ hasHomePage: true })], opts);
    assert.deepEqual([e!.action, e!.reason], ["skip", "already_has_home"]);
  });

  it("refuses Jorgelina by code and by slug", () => {
    assert.equal(planSeed([site({ profileCode: "TAL-93938" })], opts)[0]!.reason, "forbidden");
    assert.equal(
      planSeed([site({ profileCode: "TAL-92026", siteSlug: "book-jorgelina" })], opts)[0]!.reason,
      "forbidden",
    );
  });

  it("skips published sites and live pages as leave-alone / abandoned", () => {
    assert.equal(
      planSeed([site({ sitePublishedAt: "2026-09-10T00:00:00Z" })], opts)[0]!.reason,
      "published_site",
    );
    assert.equal(planSeed([site({ hasLivePages: true })], opts)[0]!.reason, "live_pages");
  });

  it("skips missing profile, no site, talent edits", () => {
    assert.equal(planSeed([site({ profileId: null })], opts)[0]!.reason, "missing_profile");
    assert.equal(planSeed([site({ siteId: null })], opts)[0]!.reason, "no_site");
    assert.equal(planSeed([site({ hasTalentEdits: true })], opts)[0]!.reason, "talent_edited_draft");
  });

  it("skips demo/test unless --include-test", () => {
    const demo = site({ isDemo: true });
    assert.equal(planSeed([demo], opts)[0]!.reason, "demo_or_test");
    assert.equal(planSeed([demo], { only: [], includeTest: true })[0]!.action, "touch");
  });

  it("--only narrows the default nine", () => {
    const entries = planSeed(
      [site(), site({ profileCode: "TAL-92026", profileId: "p2", siteId: "s2" })],
      { only: ["TAL-92026"], includeTest: false },
    );
    assert.deepEqual(
      entries.filter((e) => e.action === "touch").map((e) => e.candidate.profileCode),
      ["TAL-92026"],
    );
    assert.equal(entries.find((e) => e.candidate.profileCode === "TAL-92001")!.reason, "not_in_only");
  });
});

describe("parseArgs", () => {
  it("defaults to a dry run", () => {
    const o = parseArgs([]);
    assert.equal(o.apply, false);
    assert.equal(o.yes, false);
    assert.equal(o.skipDesign, false);
  });
  it("needs --apply and --yes together", () => {
    assert.throws(() => parseArgs(["--apply"]), RefusedError);
    assert.throws(() => parseArgs(["--yes"]), RefusedError);
    assert.equal(parseArgs(["--apply", "--yes"]).apply, true);
  });
  it("refuses --only TAL-93938 and unknown flags", () => {
    assert.throws(() => parseArgs(["--only", "TAL-92001,TAL-93938"]), RefusedError);
    assert.throws(() => parseArgs(["--nope"]), RefusedError);
  });
  it("parses --only, --include-test and --skip-design", () => {
    const o = parseArgs(["--only", "TAL-92001,TAL-92026", "--include-test", "--skip-design"]);
    assert.deepEqual(o.only, ["TAL-92001", "TAL-92026"]);
    assert.equal(o.includeTest, true);
    assert.equal(o.skipDesign, true);
  });
});

describe("formatPlan", () => {
  it("prints live-presence rows and the Vic note", () => {
    const entries = planSeed(
      [
        site(),
        site({
          profileCode: "TAL-92026",
          profileId: "p2",
          siteId: "s2",
          siteSlug: "live",
          sitePublishedAt: "2026-09-01",
        }),
      ],
      opts,
    );
    const text = formatPlan(entries, { mode: "dry-run", skipDesign: false });
    assert.match(text, /DRY RUN, nothing is written/);
    assert.match(text, /TAL-92001/);
    assert.match(text, /Live-presence \/ possibly abandoned/);
    assert.match(text, /TAL-92026/);
    assert.match(text, /TAL-92149 may be the Vic first-run/);
  });
});
