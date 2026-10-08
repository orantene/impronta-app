import assert from "node:assert/strict";
import { test } from "node:test";
import { canPinSiteToVersion, type PinGuardRelease } from "./pin-guard";

// Production shape on 2026-10-08: optin 15-21 and 23 published, v22 and v24 demos drafts.
const maison = (slug = "maison-v2"): PinGuardRelease[] => [
  ...[15, 16, 17, 18, 19, 20, 21, 23].map((v) => ({
    design_slug: slug,
    to_version: v,
    channel: "optin" as const,
    status: "published" as const,
  })),
  { design_slug: slug, to_version: 22, channel: "demos", status: "draft" },
  { design_slug: slug, to_version: 24, channel: "demos", status: "draft" },
];

test("a demo site may sit on an unreleased demos-channel version", () => {
  const r = canPinSiteToVersion({ design: "maison-v2", version: 24, isDemoSite: true, releases: maison() });
  assert.deepEqual(r, { ok: true, why: "demo" });
});

test("a real site on a demos-draft-only version is refused (the six v24 sites)", () => {
  const r = canPinSiteToVersion({ design: "maison-v2", version: 24, isDemoSite: false, releases: maison() });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "unreleased_version");
    assert.equal(r.latestReleased, 23);
  }
});

test("a real site on a version that is only a demos draft below the latest is still allowed by rule 4", () => {
  // v22 is a demos draft but sits below the latest published release (v23).
  const r = canPinSiteToVersion({ design: "maison-v2", version: 22, isDemoSite: false, releases: maison() });
  assert.deepEqual(r, { ok: true, why: "below_latest" });
});

test("a real site on a published optin version is allowed", () => {
  const r = canPinSiteToVersion({ design: "maison-v2", version: 23, isDemoSite: false, releases: maison() });
  assert.deepEqual(r, { ok: true, why: "released" });
});

test("a real site below the latest release is allowed", () => {
  const r = canPinSiteToVersion({ design: "maison-v2", version: 14, isDemoSite: false, releases: maison() });
  assert.equal(r.ok, true);
});

test("a default-channel published release counts as open", () => {
  const releases: PinGuardRelease[] = [{ design_slug: "folio", to_version: 23, channel: "default", status: "published" }];
  assert.equal(canPinSiteToVersion({ design: "folio", version: 23, isDemoSite: false, releases }).ok, true);
  assert.equal(canPinSiteToVersion({ design: "folio", version: 24, isDemoSite: false, releases }).ok, false);
});

test("a paused or archived optin row is not open", () => {
  const releases: PinGuardRelease[] = [
    { design_slug: "folio", to_version: 10, channel: "optin", status: "paused" },
    { design_slug: "folio", to_version: 11, channel: "optin", status: "archived" },
  ];
  assert.equal(canPinSiteToVersion({ design: "folio", version: 11, isDemoSite: false, releases }).ok, false);
});

test("a design with no release rows at all (gridline v1, solace v15) is allowed as a code-seed baseline", () => {
  for (const [design, version] of [["gridline", 1], ["solace", 15], ["mono", 1]] as const) {
    const r = canPinSiteToVersion({ design, version, isDemoSite: false, releases: [] });
    assert.deepEqual(r, { ok: true, why: "no_releases_baseline" });
  }
});

test("rows of other designs do not count as this design's releases", () => {
  const r = canPinSiteToVersion({ design: "gridline", version: 1, isDemoSite: false, releases: maison("maison-v2") });
  assert.equal(r.ok, true);
  const refused = canPinSiteToVersion({ design: "maison-v2", version: 99, isDemoSite: false, releases: maison("folio") });
  assert.equal(refused.ok, true, "no maison-v2 rows in the input means the baseline rule applies");
});

test("a design with only demos-draft rows: below the first minted version allowed, at or above refused", () => {
  const releases: PinGuardRelease[] = [{ design_slug: "x", to_version: 5, channel: "demos", status: "draft" }];
  assert.equal(canPinSiteToVersion({ design: "x", version: 4, isDemoSite: false, releases }).ok, true);
  const r = canPinSiteToVersion({ design: "x", version: 5, isDemoSite: false, releases });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.latestReleased, null);
});

test("the refusal reason is present in both languages and names the version", () => {
  const r = canPinSiteToVersion({ design: "maison-v2", version: 24, isDemoSite: false, releases: maison() });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason.en, /24/);
    assert.match(r.reason.es, /24/);
    assert.notEqual(r.reason.en, r.reason.es);
    assert.ok(!r.reason.en.includes("—") && !r.reason.es.includes("—"), "no em dashes");
  }
});
