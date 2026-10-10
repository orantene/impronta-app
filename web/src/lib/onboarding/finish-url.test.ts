import test from "node:test";
import assert from "node:assert/strict";
import {
  isDesignLookKey,
  isWorkspacePathDeliveredUrl,
  promisedHost,
  promisedPathHost,
  promisedUrl,
  resolveWorkspaceFinishUrl,
} from "./finish-url";

test("builds the promised address from the reserved slug", () => {
  assert.equal(promisedHost(" Qa-Fresh-Studio "), "qa-fresh-studio.tulala.digital");
  assert.equal(promisedPathHost(" Qa-Fresh-Studio "), "tulala.digital/w/qa-fresh-studio");
  assert.equal(promisedUrl("a"), "https://a.tulala.digital");
  assert.equal(promisedUrl(null), null);
  assert.equal(promisedUrl("  "), null);
  assert.equal(promisedPathHost(null), null);
});

test("keeps Free path-canonical delivery instead of fabricating a subdomain", () => {
  // TUL-541: Free storefronts are /w/<slug>; overriding with slug.tulala.digital
  // made live-check fail into draft_saved while the path URL was live.
  const r = resolveWorkspaceFinishUrl({
    linkSlug: "qa-fresh-studio",
    tenantSlug: "qa-fresh-studio",
    delivered: "https://tulala.digital/w/qa-fresh-studio",
  });
  assert.deepEqual(r, {
    url: "https://tulala.digital/w/qa-fresh-studio",
    display: "tulala.digital/w/qa-fresh-studio",
    promised: true,
    differs: false,
  });
  assert.equal(isWorkspacePathDeliveredUrl(r.url), true);
});

test("prefers promised subdomain when delivery is already a branded host", () => {
  const r = resolveWorkspaceFinishUrl({
    linkSlug: "paid-studio",
    tenantSlug: "paid-studio",
    delivered: "https://other.tulala.digital",
  });
  assert.deepEqual(r, {
    url: "https://paid-studio.tulala.digital",
    display: "paid-studio.tulala.digital",
    promised: true,
    differs: false,
  });
});

test("flags a differing delivery instead of hiding it", () => {
  const r = resolveWorkspaceFinishUrl({
    linkSlug: "qa-fresh-studio",
    tenantSlug: "qa-fresh-studio-2",
    delivered: "https://tulala.digital/w/qa-fresh-studio-2",
  });
  assert.equal(r.url, "https://tulala.digital/w/qa-fresh-studio-2");
  assert.equal(r.promised, false);
  assert.equal(r.differs, true);
});

test("falls back to delivered when nothing was promised", () => {
  const r = resolveWorkspaceFinishUrl({ linkSlug: null, tenantSlug: "x", delivered: "https://x.tulala.digital" });
  assert.equal(r.differs, false);
  assert.equal(r.url, "https://x.tulala.digital");
});

test("validates look keys", () => {
  assert.equal(isDesignLookKey("rose"), true);
  assert.equal(isDesignLookKey("orchid"), true);
  assert.equal(isDesignLookKey("lilac"), false);
  // Old v1 keys are no longer offered: a resumed brief reads them as "no pick".
  assert.equal(isDesignLookKey("pink"), false);
});
