import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  evaluateMaisonPublishReadiness,
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
});
