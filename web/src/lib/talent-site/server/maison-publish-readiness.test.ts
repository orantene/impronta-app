import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  evaluateMaisonPublishReadiness,
  maisonDesignBlocker,
  maisonReadinessHeadline,
} from "./maison-publish-readiness";

describe("evaluateMaisonPublishReadiness", () => {
  test("ready when slug + design present", () => {
    const r = evaluateMaisonPublishReadiness({
      siteSlug: "valemontes",
      themeDesignSlug: "maison",
    });
    assert.equal(r.ready, true);
    assert.equal(r.blockers.length, 0);
    assert.equal(maisonReadinessHeadline(r), "Ready to publish");
  });

  test("names missing address with fix link", () => {
    const r = evaluateMaisonPublishReadiness({
      siteSlug: null,
      themeDesignSlug: "maison",
    });
    assert.equal(r.ready, false);
    assert.equal(r.blockers[0]?.id, "no_slug");
    assert.match(r.blockers[0]?.fixLabel ?? "", /address/i);
    assert.equal(r.blockers[0]?.fixHref, "#maison-site-address");
    assert.equal(maisonReadinessHeadline(r), "1 thing before publishing");
  });

  test("names missing design with fix link", () => {
    const r = evaluateMaisonPublishReadiness({
      siteSlug: "vale",
      themeDesignSlug: null,
    });
    assert.equal(r.ready, false);
    assert.equal(r.blockers[0]?.id, "no_design");
    assert.equal(r.blockers[0]?.fixHref, "#maison-setup-host");
  });

  test("optional photo suggestion is never a blocker", () => {
    const r = evaluateMaisonPublishReadiness({
      siteSlug: "vale",
      themeDesignSlug: "maison",
      photoCount: 1,
    });
    assert.equal(r.ready, true);
    assert.equal(r.suggestions[0]?.id, "more_photos");
  });

  test("AUD-024: taken address is a named blocker with a fix link", () => {
    const r = evaluateMaisonPublishReadiness({
      siteSlug: "vale",
      themeDesignSlug: "maison",
      slugTaken: true,
    });
    assert.equal(r.ready, false);
    assert.equal(r.blockers[0]?.id, "slug_taken");
    assert.match(r.blockers[0]?.message ?? "", /vale\.tulala\.digital/);
    assert.equal(r.blockers[0]?.fixHref, "#maison-site-address");
  });

  test("AUD-024: unknown availability (null) never blocks", () => {
    const r = evaluateMaisonPublishReadiness({
      siteSlug: "vale",
      themeDesignSlug: "maison",
      slugTaken: null,
    });
    assert.equal(r.ready, true);
  });

  test("AUD-024: blocker copy is Spanish on an ES locale, with no em dashes", () => {
    const r = evaluateMaisonPublishReadiness({
      siteSlug: "vale",
      themeDesignSlug: null,
      slugTaken: true,
      locale: "es",
    });
    assert.equal(r.blockers.length, 2);
    assert.match(r.blockers[0]?.message ?? "", /ya está en uso/);
    assert.equal(r.blockers[1]?.fixLabel, "Elige un diseño");
    assert.equal(maisonReadinessHeadline(r, "es"), "2 cosas antes de publicar");
    for (const b of r.blockers) assert.doesNotMatch(b.message + b.fixLabel, /\u2014/);
  });
});

describe("maisonDesignBlocker (TUL-89: preflight and publish share one rule)", () => {
  test("no design, null, undefined and whitespace all block", () => {
    for (const v of [null, undefined, "", "   "]) {
      assert.equal(maisonDesignBlocker(v)?.id, "no_design");
    }
  });
  test("a design clears it", () => {
    assert.equal(maisonDesignBlocker("maison"), null);
  });
  test("evaluate and the shared rule agree, in English and Spanish", () => {
    for (const locale of ["en", "es"] as const) {
      const r = evaluateMaisonPublishReadiness({ siteSlug: "x", themeDesignSlug: null, locale });
      assert.equal(r.blockers[0]?.message, maisonDesignBlocker(null, locale)?.message);
    }
    assert.equal(maisonDesignBlocker(null, "es")?.message, "Aplica un diseño antes de publicar.");
  });
});
