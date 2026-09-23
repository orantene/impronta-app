import test from "node:test";
import assert from "node:assert/strict";

import {
  maxSitePublicGate,
  scopeMaxSitePagesToPlan,
  type MaxSitePageRow,
} from "./resolve-max-site-core";

/**
 * PHASE 1 — read-time scoping for the free personal website.
 *
 * Two decisions, both pure: does the site serve at all (`maxSitePublicGate`),
 * and which pages does a visitor get (`scopeMaxSitePagesToPlan`). Both are
 * asserted with the switch OFF (today's Max-only behaviour, byte for byte) and
 * with it ON (free renders home-only, Web Office renders everything).
 */
function withFreeWebsite<T>(enabled: boolean, fn: () => T): T {
  const previous = process.env.TALENT_FREE_WEBSITE_ENABLED;
  if (enabled) process.env.TALENT_FREE_WEBSITE_ENABLED = "true";
  else delete process.env.TALENT_FREE_WEBSITE_ENABLED;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TALENT_FREE_WEBSITE_ENABLED;
    else process.env.TALENT_FREE_WEBSITE_ENABLED = previous;
  }
}

function page(partial: Partial<MaxSitePageRow> & { slug: string }): MaxSitePageRow {
  return {
    id: `id-${partial.slug}`,
    title: partial.slug,
    navLabel: null,
    status: "published",
    isHome: false,
    sortOrder: 0,
    blocks: [],
    theme: {},
    metaTitle: null,
    metaDescription: null,
    ogTitle: null,
    ogDescription: null,
    ogImageUrl: null,
    canonicalUrl: null,
    noindex: null,
    jsonLd: null,
    ...partial,
  };
}

const PUBLISHED = "2026-09-23T00:00:00Z";

// ── maxSitePublicGate ────────────────────────────────────────────────────────

test("gate, switch OFF: only Max serves (unchanged from before Phase 1)", () => {
  withFreeWebsite(false, () => {
    assert.equal(
      maxSitePublicGate({ sitePublishedAt: PUBLISHED, planKey: "talent_portfolio" }),
      true,
    );
    for (const planKey of ["talent_basic", "talent_pro", "free", "nonsense"]) {
      assert.equal(
        maxSitePublicGate({ sitePublishedAt: PUBLISHED, planKey }),
        false,
        `${planKey} must not serve while the switch is off`,
      );
    }
  });
});

test("gate, switch ON: every tier serves a published site", () => {
  withFreeWebsite(true, () => {
    for (const planKey of ["talent_basic", "talent_pro", "talent_portfolio"]) {
      assert.equal(
        maxSitePublicGate({ sitePublishedAt: PUBLISHED, planKey }),
        true,
        `${planKey} must serve once the free website is on`,
      );
    }
  });
});

test("gate: unpublished is closed on every plan and either switch", () => {
  for (const enabled of [false, true]) {
    withFreeWebsite(enabled, () => {
      for (const planKey of ["talent_basic", "talent_portfolio"]) {
        assert.equal(maxSitePublicGate({ sitePublishedAt: null, planKey }), false);
      }
    });
  }
});

test("gate: a null plan FAILS CLOSED even with the free website on", () => {
  // A null plan means the read failed, not that the talent is Free. Serving
  // would turn an outage into an unintended publish.
  withFreeWebsite(true, () => {
    assert.equal(maxSitePublicGate({ sitePublishedAt: PUBLISHED, planKey: null }), false);
    assert.equal(
      maxSitePublicGate({ sitePublishedAt: PUBLISHED, planKey: undefined }),
      false,
    );
  });
});

test("gate: owner draft preview is open before publish and before any plan read", () => {
  for (const enabled of [false, true]) {
    withFreeWebsite(enabled, () => {
      assert.equal(
        maxSitePublicGate({
          sitePublishedAt: null,
          planKey: null,
          isOwnerDraftPreview: true,
        }),
        true,
      );
    });
  }
});

// ── scopeMaxSitePagesToPlan ──────────────────────────────────────────────────

const SITE = [
  page({ slug: "home", isHome: true, sortOrder: 0 }),
  page({ slug: "about", sortOrder: 1 }),
  page({ slug: "work", sortOrder: 2 }),
];

test("scoping, switch OFF: Max keeps every page; lower tiers never render anyway", () => {
  withFreeWebsite(false, () => {
    assert.deepEqual(
      scopeMaxSitePagesToPlan(SITE, "talent_portfolio").map((p) => p.slug),
      ["home", "about", "work"],
    );
  });
});

test("scoping, switch ON: Web Office keeps every page", () => {
  withFreeWebsite(true, () => {
    assert.deepEqual(
      scopeMaxSitePagesToPlan(SITE, "talent_portfolio").map((p) => p.slug),
      ["home", "about", "work"],
    );
  });
});

test("scoping, switch ON: free and grandfathered Pro get the home page only", () => {
  withFreeWebsite(true, () => {
    for (const planKey of ["talent_basic", "talent_pro"]) {
      assert.deepEqual(
        scopeMaxSitePagesToPlan(SITE, planKey).map((p) => p.slug),
        ["home"],
        `${planKey} must be scoped to home`,
      );
    }
  });
});

test("scoping never mutates the input array", () => {
  withFreeWebsite(true, () => {
    const input = SITE.slice();
    scopeMaxSitePagesToPlan(input, "talent_basic");
    assert.equal(input.length, 3, "the caller's page list is untouched");
    const full = scopeMaxSitePagesToPlan(input, "talent_portfolio");
    assert.notEqual(full, input, "a copy is returned, never the same reference");
  });
});

test("scoping falls back to the lowest-sorted published page when no row is is_home", () => {
  withFreeWebsite(true, () => {
    const pages = [
      page({ slug: "later", sortOrder: 5 }),
      page({ slug: "first", sortOrder: 1 }),
    ];
    assert.deepEqual(
      scopeMaxSitePagesToPlan(pages, "talent_basic").map((p) => p.slug),
      ["first"],
    );
  });
});

test("scoping prefers a PUBLISHED page over a draft home", () => {
  withFreeWebsite(true, () => {
    const pages = [
      page({ slug: "home", isHome: true, sortOrder: 0, status: "draft" }),
      page({ slug: "live", sortOrder: 1 }),
    ];
    assert.deepEqual(
      scopeMaxSitePagesToPlan(pages, "talent_basic").map((p) => p.slug),
      ["live"],
      "a scoped visitor must land on a page that actually serves",
    );
  });
});

test("scoping an empty site yields an empty list, never a throw", () => {
  withFreeWebsite(true, () => {
    assert.deepEqual(scopeMaxSitePagesToPlan([], "talent_basic"), []);
    assert.deepEqual(scopeMaxSitePagesToPlan([], "talent_portfolio"), []);
  });
});
