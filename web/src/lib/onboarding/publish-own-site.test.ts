import test from "node:test";
import assert from "node:assert/strict";
import { ensureOwnSitePublished, ownSiteUrl, type OwnSiteRow, type PublishOwnSiteDeps } from "./publish-own-site";

function harness(initial: OwnSiteRow, opts: Partial<{ applyOk: boolean; applyCode: string; publishOk: boolean; subdomains: boolean }> = {}) {
  let row: OwnSiteRow = initial;
  const calls = { apply: 0, publish: 0 };
  const deps: PublishOwnSiteDeps = {
    subdomainsEnabled: opts.subdomains ?? true,
    pathOrigin: "https://tulala.digital",
    readSite: async () => ({ row, isDemo: false }),
    applyDefaultDesign: async () => {
      calls.apply += 1;
      if (opts.applyOk === false) return { ok: false, code: opts.applyCode ?? "server_error", error: "x" };
      row = { site_slug: row?.site_slug ?? "rosa", site_published_at: row?.site_published_at ?? null, theme_design_slug: "maison" };
      return { ok: true };
    },
    publish: async () => {
      calls.publish += 1;
      if (opts.publishOk === false) return { ok: false, error: "boom" };
      row = { site_slug: row?.site_slug ?? "rosa", site_published_at: "2026-10-06T00:00:00Z", theme_design_slug: row?.theme_design_slug ?? null };
      return { ok: true };
    },
  };
  return { deps, calls };
}

test("a new talent ends published, with the host URL", async () => {
  const h = harness({ site_slug: "rosa", site_published_at: null, theme_design_slug: null });
  const r = await ensureOwnSitePublished(h.deps);
  assert.deepEqual(r, { ok: true, siteSlug: "rosa", publicUrl: "https://rosa.tulala.digital", alreadyLive: false });
  assert.equal(h.calls.apply, 1);
  assert.equal(h.calls.publish, 1);
});

test("idempotent: a second run on a live site writes nothing and returns the same URL", async () => {
  const h = harness({ site_slug: "rosa", site_published_at: null, theme_design_slug: null });
  const first = await ensureOwnSitePublished(h.deps);
  const second = await ensureOwnSitePublished(h.deps);
  assert.equal(second.ok && second.publicUrl, first.ok && first.publicUrl);
  assert.equal(second.ok && second.alreadyLive, true);
  assert.equal(h.calls.apply, 1);
  assert.equal(h.calls.publish, 1);
});

test("an existing design is kept; a flag-off design refusal still publishes; a real design failure stops", async () => {
  const kept = harness({ site_slug: "rosa", site_published_at: null, theme_design_slug: "folio" });
  await ensureOwnSitePublished(kept.deps);
  assert.equal(kept.calls.apply, 0);
  assert.equal(kept.calls.publish, 1);

  const off = harness(null, { applyOk: false, applyCode: "feature_disabled" });
  const offRes = await ensureOwnSitePublished(off.deps);
  assert.equal(off.calls.publish, 1);
  assert.equal(offRes.ok, true);

  const bad = harness(null, { applyOk: false });
  assert.deepEqual(await ensureOwnSitePublished(bad.deps), { ok: false, error: "x" });
  assert.equal(bad.calls.publish, 0);
});

test("a failed publish is reported, never a fake URL", async () => {
  const h = harness({ site_slug: "rosa", site_published_at: null, theme_design_slug: "maison" }, { publishOk: false });
  assert.deepEqual(await ensureOwnSitePublished(h.deps), { ok: false, error: "boom" });
});

test("path fallback while subdomains are off; unusable slug has no URL", () => {
  assert.equal(ownSiteUrl("rosa", { isDemo: false, subdomainsEnabled: false, pathOrigin: "https://tulala.digital/" }), "https://tulala.digital/t/site/rosa");
  assert.equal(ownSiteUrl("rosa", { isDemo: true, subdomainsEnabled: true, pathOrigin: "x" }), "https://rosa-demo.tulala.digital");
  assert.equal(ownSiteUrl(null, { isDemo: false, subdomainsEnabled: true, pathOrigin: "x" }), null);
});

test("a picked look is applied before publish even when a design already exists", async () => {
  const h = harness({ site_slug: "rosa", site_published_at: null, theme_design_slug: "maison" });
  h.deps.forceDesign = true;
  const r = await ensureOwnSitePublished(h.deps);
  assert.equal(r.ok, true);
  assert.equal(h.calls.apply, 1);
  assert.equal(h.calls.publish, 1);
});

test("publish failure is an honest not-ok (never a live URL)", async () => {
  const h = harness({ site_slug: "rosa", site_published_at: null, theme_design_slug: "maison" }, { publishOk: false });
  const r = await ensureOwnSitePublished(h.deps);
  assert.deepEqual(r, { ok: false, error: "boom" });
});
