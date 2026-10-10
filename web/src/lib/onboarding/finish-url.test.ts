import test from "node:test";
import assert from "node:assert/strict";
import {
  isDesignLookKey,
  isWorkspacePathPublicUrl,
  promisedHost,
  promisedUrl,
  resolveWorkspaceFinishUrl,
} from "./finish-url";

test("builds the Free path promise from the reserved slug", () => {
  assert.equal(promisedHost(" Qa-Fresh-Studio "), "tulala.digital/w/qa-fresh-studio");
  assert.equal(promisedUrl("a"), "https://tulala.digital/w/a");
  assert.equal(promisedUrl(null), null);
  assert.equal(promisedUrl("  "), null);
});

test("detects Free path public URLs", () => {
  assert.equal(isWorkspacePathPublicUrl("https://tulala.digital/w/qa-fresh-studio"), true);
  assert.equal(isWorkspacePathPublicUrl("tulala.digital/w/qa-fresh-studio/menu"), true);
  assert.equal(isWorkspacePathPublicUrl("https://qa-fresh-studio.tulala.digital"), false);
  assert.equal(isWorkspacePathPublicUrl("https://tulala.digital/discover"), false);
});

test("keeps the delivered Free path URL when the workspace got that slug", () => {
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
});

test("never overrides a delivered /w/ URL with a subdomain", () => {
  const r = resolveWorkspaceFinishUrl({
    linkSlug: "qa-grok-salon",
    tenantSlug: "qa-grok-salon",
    delivered: "https://tulala.digital/w/qa-grok-salon",
  });
  assert.equal(r.url, "https://tulala.digital/w/qa-grok-salon");
  assert.doesNotMatch(r.url, /\.tulala\.digital\/?$/);
  assert.match(r.url, /\/w\/qa-grok-salon/);
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

test("prefers the path promise when delivery is still a subdomain", () => {
  const r = resolveWorkspaceFinishUrl({
    linkSlug: "qa-grok-salon",
    tenantSlug: "qa-grok-salon",
    delivered: "https://qa-grok-salon.tulala.digital",
  });
  assert.equal(r.url, "https://tulala.digital/w/qa-grok-salon");
  assert.equal(r.promised, true);
  assert.equal(r.differs, true);
});

test("falls back to delivered when nothing was promised", () => {
  const r = resolveWorkspaceFinishUrl({
    linkSlug: null,
    tenantSlug: "x",
    delivered: "https://x.tulala.digital",
  });
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
