import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SERVICE_TAP_ACTIONS,
  isServiceTapAction,
  serviceCardTarget,
  serviceQuickViewId,
  wantedModeForTap,
} from "./card-target";
import { presentationEntitlementsForTalentPlan } from "./talent-entitlements";

const ID = "1a2b3c4d-0000-4000-8000-000000000000";
const QV = serviceQuickViewId({ id: ID, title: "Corte & barba" });

describe("serviceQuickViewId", () => {
  it("is the stable servicio-<title>-<id8> slug, usable as a fragment id", () => {
    assert.equal(QV, "servicio-corte-barba-1a2b3c4d");
    assert.match(QV, /^[a-z0-9-]+$/);
  });
});

describe("wantedModeForTap (widget 'Al tocar' setting)", () => {
  it("auto follows each service; the others force one mode", () => {
    assert.equal(wantedModeForTap("auto", "quick_view"), "quick_view");
    assert.equal(wantedModeForTap("auto", "own_page"), "own_page");
    assert.equal(wantedModeForTap("page", "quick_view"), "own_page");
    assert.equal(wantedModeForTap("quick_view", "own_page"), "quick_view");
    assert.equal(wantedModeForTap("book", "own_page"), "book_direct");
  });
  it("lists exactly the four options and rejects anything else", () => {
    assert.deepEqual([...SERVICE_TAP_ACTIONS], ["auto", "page", "quick_view", "book"]);
    assert.equal(isServiceTapAction("page"), true);
    assert.equal(isServiceTapAction("modal"), false);
    assert.equal(isServiceTapAction(undefined), false);
  });
});

describe("serviceCardTarget: every card is a real link", () => {
  const base = { quickViewId: QV, listPath: "/en", pageAllowed: true, pageHref: "/en/servicio-corte-barba-1a2b3c4d" };

  it("own page: links to the page", () => {
    assert.deepEqual(serviceCardTarget({ ...base, mode: "own_page" }), {
      href: "/en/servicio-corte-barba-1a2b3c4d",
      opens: "page",
      quickViewId: null,
    });
  });

  it("own page on a plan without pages degrades to the quick view on the list (fragment, no query string)", () => {
    const t = serviceCardTarget({ ...base, mode: "own_page", pageAllowed: false });
    assert.deepEqual(t, { href: `/en#${QV}`, opens: "quick_view", quickViewId: QV });
    assert.equal(t.href.includes("?"), false);
  });

  it("own page with no page URL (builder, preview) degrades to the quick view", () => {
    assert.equal(serviceCardTarget({ ...base, mode: "own_page", pageHref: null }).opens, "quick_view");
  });

  it("quick view and expand open the popup; href is the list + fragment", () => {
    for (const mode of ["quick_view", "expand"] as const) {
      assert.deepEqual(serviceCardTarget({ ...base, mode }), { href: `/en#${QV}`, opens: "quick_view", quickViewId: QV });
    }
  });

  it("root list path makes '/#id', never '//#id'", () => {
    assert.equal(serviceCardTarget({ ...base, listPath: "", mode: "quick_view" }).href, `/#${QV}`);
    assert.equal(serviceCardTarget({ ...base, listPath: "/", mode: "quick_view" }).href, `/#${QV}`);
  });

  it("book direct keeps a crawlable href (the page when allowed, else the quick view) and opens booking", () => {
    assert.deepEqual(serviceCardTarget({ ...base, mode: "book_direct" }), {
      href: base.pageHref,
      opens: "book",
      quickViewId: null,
    });
    assert.deepEqual(serviceCardTarget({ ...base, mode: "book_direct", pageAllowed: false }), {
      href: `/en#${QV}`,
      opens: "book",
      quickViewId: QV,
    });
  });
});

describe("presentationEntitlementsForTalentPlan (PM: free = no own page)", () => {
  it("free talent: quick view, expand, book direct; no own page", () => {
    assert.deepEqual(
      [...presentationEntitlementsForTalentPlan("talent_basic").allowedModes],
      ["quick_view", "expand", "book_direct"],
    );
    assert.equal(presentationEntitlementsForTalentPlan(null).allowedModes.includes("own_page"), false);
  });
  it("paid talent plans get own pages", () => {
    for (const k of ["talent_pro", "talent_portfolio"]) {
      assert.equal(presentationEntitlementsForTalentPlan(k).allowedModes.includes("own_page"), true, k);
    }
  });
});
