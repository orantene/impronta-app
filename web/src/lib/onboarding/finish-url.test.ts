import test from "node:test";
import assert from "node:assert/strict";
import { isDesignLookKey, promisedHost, promisedUrl, resolveWorkspaceFinishUrl } from "./finish-url";

test("builds the promised address from the reserved slug", () => {
  assert.equal(promisedHost(" Qa-Fresh-Studio "), "qa-fresh-studio.tulala.digital");
  assert.equal(promisedUrl("a"), "https://a.tulala.digital");
  assert.equal(promisedUrl(null), null);
  assert.equal(promisedUrl("  "), null);
});

test("uses the promised address when the workspace got that slug", () => {
  const r = resolveWorkspaceFinishUrl({ linkSlug: "qa-fresh-studio", tenantSlug: "qa-fresh-studio", delivered: "https://tulala.digital/w/qa-fresh-studio" });
  assert.deepEqual(r, { url: "https://qa-fresh-studio.tulala.digital", display: "qa-fresh-studio.tulala.digital", promised: true, differs: false });
});

test("flags a differing delivery instead of hiding it", () => {
  const r = resolveWorkspaceFinishUrl({ linkSlug: "qa-fresh-studio", tenantSlug: "qa-fresh-studio-2", delivered: "https://tulala.digital/w/qa-fresh-studio-2" });
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
  assert.equal(isDesignLookKey("pink"), true);
  assert.equal(isDesignLookKey("lilac"), false);
});
