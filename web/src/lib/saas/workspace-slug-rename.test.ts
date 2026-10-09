import assert from "node:assert/strict";
import test from "node:test";

import { cleanBaseFromSoup, isUrlSoupSlug, planSlugRenames } from "./workspace-slug-rename";

const ag = (id: string, slug: string | null) => ({ id, slug, status: "active" });

test("soup slugs are recognized, normal ones are not", () => {
  assert.equal(isUrlSoupSlug("https-www-airstriplasvegas-com"), true);
  assert.equal(isUrlSoupSlug("http-shop-mx"), true);
  assert.equal(isUrlSoupSlug("pixifly"), false);
  assert.equal(isUrlSoupSlug("httpserver-studio"), false);
  assert.equal(isUrlSoupSlug(null), false);
});

test("the clean base drops scheme, www and TLD; social links keep the handle", () => {
  assert.deepEqual(cleanBaseFromSoup("https-www-airstriplasvegas-com"), { base: "airstriplasvegas", truncatedHandle: false });
  assert.equal(cleanBaseFromSoup("https-www-instagram-com-thebarbe")?.base, "thebarbe");
  assert.equal(cleanBaseFromSoup("http-shop-mx")?.base, "shop");
});

test("a plan never reuses a taken slug and flags what it cannot derive", () => {
  const { plan, skipped } = planSlugRenames(
    [ag("t1", "https-www-airstriplasvegas-com"), ag("t2", "https-www-instagram-com-thebarbe"), ag("t3", "https-www-pixifly-com"), ag("t4", "pixifly"), ag("t5", "https-www-")],
    new Set(["pixifly", "https-www-airstriplasvegas-com", "https-www-instagram-com-thebarbe", "https-www-pixifly-com"]),
  );
  assert.deepEqual(plan.map((p) => [p.tenantId, p.to]), [["t1", "airstriplasvegas"], ["t2", "thebarbe"], ["t3", "pixifly-2"]]);
  assert.deepEqual(skipped.map((s) => [s.tenantId, s.reason]), [["t5", "cannot_derive"]]);
});

test("two soup slugs that clean to the same base get distinct targets", () => {
  const { plan } = planSlugRenames([ag("a", "https-www-shop-com"), ag("b", "http-shop-com")], new Set(["https-www-shop-com", "http-shop-com"]));
  assert.deepEqual(plan.map((p) => p.to), ["shop", "shop-2"]);
});
