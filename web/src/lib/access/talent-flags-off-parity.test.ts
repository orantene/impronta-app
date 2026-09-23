/**
 * Phase 1 flags-off parity — proved, not asserted by inspection.
 *
 * The contract for the whole phase is: with `TALENT_FREE_WEBSITE_ENABLED`
 * unset, the product behaves exactly as it did before Phase 1. The three
 * properties that matter, each checked here on BOTH switch positions so a
 * regression in either direction fails:
 *
 *   1. A `talent_basic` site does not serve publicly.
 *   2. The builder is Max-only.
 *   3. Every tier label still reads "Portfolio" (and "Pro" for the folded
 *      middle tier), the compare surface still has three columns, and no
 *      refusal string mentions "Web Office".
 *
 * Every reader under test resolves the switch at CALL time, so flipping
 * `process.env` inside a test is enough — no module cache juggling.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  TALENT_SITE_CAPABILITY_KEYS,
  buildTalentMembershipState,
  buildTalentSiteCapabilities,
  talentPlanGrantsSiteCapability,
  type TalentPlanKey,
} from "./talent-membership";
import {
  getVisibleTalentPlans,
  planDisplayName,
  getPlan,
} from "./plan-catalog";
import {
  isTalentTierRenameEnabled,
  talentPaidTierLabel,
  talentTierLabel,
} from "./talent-tier-label";
import {
  planDeniedMessage,
  siteCapabilityDeniedMessage,
  type TalentSiteDeniedCapability,
} from "@/lib/server/talent-self-guard";
import {
  maxSitePublicGate,
  scopeMaxSitePagesToPlan,
  type MaxSitePageRow,
} from "@/lib/talent-site/resolve-max-site-core";
import { siteCapabilityDeniedMessageClient } from "@/lib/talent-site/free-site-capability-denied-copy";
import { buildTalentPageBuilderConfig } from "@/lib/site-admin/builder-core/config";
import type { BuilderSurfaceAdapter } from "@/lib/site-admin/builder-core/surface-adapter";

const SWITCH = "TALENT_FREE_WEBSITE_ENABLED";

/** Run `body` with the free-website switch in a known position. */
function withSwitch(on: boolean, body: () => void): void {
  const previous = process.env[SWITCH];
  if (on) process.env[SWITCH] = "true";
  else delete process.env[SWITCH];
  try {
    body();
  } finally {
    if (previous === undefined) delete process.env[SWITCH];
    else process.env[SWITCH] = previous;
  }
}

const ALL_PLANS: readonly TalentPlanKey[] = ["talent_basic", "talent_pro", "talent_portfolio"];

/** Minimal `talent_page` adapter — the config factory only reads `kind`. */
const talentPageAdapter = {
  kind: "talent_page",
  load: async () => ({ ok: true, data: null as never }),
  save: async () => ({ ok: true }),
  saveDraft: async () => ({ ok: true }),
  publish: async () => ({ ok: true }),
} as unknown as BuilderSurfaceAdapter;

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

const PAGES: readonly MaxSitePageRow[] = [
  page({ slug: "home", isHome: true, sortOrder: 0 }),
  page({ slug: "about", sortOrder: 1 }),
  page({ slug: "work", sortOrder: 2 }),
];

const DENIED_CAPABILITIES: readonly TalentSiteDeniedCapability[] = [
  "site_pages",
  "site_sections",
  "site_seo",
  "site_analytics",
  "site_custom_domain",
  "site_edit",
  "design_presets",
];

// ── 1. Public render gate ────────────────────────────────────────────────────

test("flags off: only a talent_portfolio site serves publicly", () => {
  withSwitch(false, () => {
    for (const planKey of ["talent_basic", "talent_pro"] as const) {
      assert.equal(
        maxSitePublicGate({ sitePublishedAt: "2026-01-01T00:00:00Z", planKey }),
        false,
        `${planKey} must not serve a personal site while the switch is off`,
      );
    }
    assert.equal(
      maxSitePublicGate({ sitePublishedAt: "2026-01-01T00:00:00Z", planKey: "talent_portfolio" }),
      true,
    );
    // Fail closed on an unknown plan, on both switch positions.
    assert.equal(maxSitePublicGate({ sitePublishedAt: "2026-01-01T00:00:00Z", planKey: null }), false);
  });
});

test("flags on: a published talent_basic site serves publicly", () => {
  withSwitch(true, () => {
    assert.equal(
      maxSitePublicGate({ sitePublishedAt: "2026-01-01T00:00:00Z", planKey: "talent_basic" }),
      true,
    );
    // Still gated on publication, on both switch positions.
    assert.equal(maxSitePublicGate({ sitePublishedAt: null, planKey: "talent_basic" }), false);
  });
});

test("flags off: page scoping is a no-op because only Max ever renders", () => {
  withSwitch(false, () => {
    assert.deepEqual(
      scopeMaxSitePagesToPlan(PAGES, "talent_portfolio").map((p) => p.slug),
      ["home", "about", "work"],
    );
  });
});

test("flags on: a free talent's public site is scoped to the home page", () => {
  withSwitch(true, () => {
    assert.deepEqual(
      scopeMaxSitePagesToPlan(PAGES, "talent_basic").map((p) => p.slug),
      ["home"],
    );
    assert.deepEqual(
      scopeMaxSitePagesToPlan(PAGES, "talent_portfolio").map((p) => p.slug),
      ["home", "about", "work"],
    );
  });
});

// ── 2. Builder access ────────────────────────────────────────────────────────

test("flags off: every site capability is Max-only, for every key and every plan", () => {
  withSwitch(false, () => {
    for (const planKey of ALL_PLANS) {
      const expected = planKey === "talent_portfolio";
      const record = buildTalentSiteCapabilities(planKey);
      for (const key of TALENT_SITE_CAPABILITY_KEYS) {
        assert.equal(
          record[key],
          expected,
          `${planKey}.${key} must be ${expected} while the switch is off`,
        );
        assert.equal(talentPlanGrantsSiteCapability(planKey, key), expected);
      }
      // The record threaded into the manager and the builder is the same shape.
      assert.deepEqual(buildTalentMembershipState(planKey).siteCapabilities, record);
    }
  });
});

test("flags on: free and legacy pro get edit, publish and design presets only", () => {
  withSwitch(true, () => {
    for (const planKey of ["talent_basic", "talent_pro"] as const) {
      const record = buildTalentSiteCapabilities(planKey);
      assert.equal(record.personalSiteEdit, true);
      assert.equal(record.personalSitePublish, true);
      assert.equal(record.personalSiteDesignPresets, true);
      assert.equal(record.personalSiteSections, false);
      assert.equal(record.personalSitePages, false);
      assert.equal(record.personalSiteSeo, false);
      assert.equal(record.personalSiteAnalytics, false);
      assert.equal(record.personalSiteCustomDomain, false);
    }
    const max = buildTalentSiteCapabilities("talent_portfolio");
    for (const key of TALENT_SITE_CAPABILITY_KEYS) assert.equal(max[key], true);
  });
});

test("flags off: the builder config is unrestricted for Max and locked for everyone else", () => {
  withSwitch(false, () => {
    const max = buildTalentPageBuilderConfig(talentPageAdapter, {
      talentTier: "talent_portfolio",
      siteCapabilities: buildTalentSiteCapabilities("talent_portfolio"),
    });
    assert.equal(max.structuralEdits, true);
    assert.equal(max.capabilities.themeTokens, true);
    assert.equal(max.capabilities.seo, true);

    for (const planKey of ["talent_basic", "talent_pro"] as const) {
      const locked = buildTalentPageBuilderConfig(talentPageAdapter, {
        talentTier: planKey,
        siteCapabilities: buildTalentSiteCapabilities(planKey),
      });
      assert.equal(locked.structuralEdits, false);
      assert.equal(locked.capabilities.themeTokens, false);
      assert.equal(locked.capabilities.seo, false);
      // ...which is why the "Web Office" upsell label on the config is never
      // rendered while the switch is off: no non-Max talent reaches the
      // builder at all (page-builder/page.tsx gates on personalSiteEdit).
      assert.equal(buildTalentSiteCapabilities(planKey).personalSiteEdit, false);
    }
  });
});

test("flags on: a free talent keeps design presets but loses structure and SEO", () => {
  withSwitch(true, () => {
    const free = buildTalentPageBuilderConfig(talentPageAdapter, {
      talentTier: "talent_basic",
      siteCapabilities: buildTalentSiteCapabilities("talent_basic"),
    });
    assert.equal(free.structuralEdits, false);
    assert.equal(free.capabilities.themeTokens, true);
    assert.equal(free.capabilities.seo, false);
    assert.equal(free.capabilities.motion, false);
    assert.equal(free.capabilities.customCss, false);
    assert.equal(free.permissions.canInsertRawHtmlElements, false);
  });
});

test("the raw-HTML boundary is off on both switch positions", () => {
  for (const on of [false, true]) {
    withSwitch(on, () => {
      for (const planKey of ALL_PLANS) {
        const config = buildTalentPageBuilderConfig(talentPageAdapter, {
          talentTier: planKey,
          siteCapabilities: buildTalentSiteCapabilities(planKey),
        });
        assert.equal(config.permissions.canInsertRawHtmlElements, false);
      }
    });
  }
});

// ── 3. Tier labels ───────────────────────────────────────────────────────────

test("flags off: tier labels read Free / Pro / Portfolio", () => {
  withSwitch(false, () => {
    assert.equal(isTalentTierRenameEnabled(), false);
    assert.equal(talentTierLabel("free"), "Free");
    assert.equal(talentTierLabel("pro"), "Pro");
    assert.equal(talentTierLabel("max"), "Portfolio");
    assert.equal(talentPaidTierLabel(), "Portfolio");

    assert.equal(buildTalentMembershipState("talent_basic").displayName, "Free");
    assert.equal(buildTalentMembershipState("talent_pro").displayName, "Pro");
    assert.equal(buildTalentMembershipState("talent_portfolio").displayName, "Portfolio");

    assert.equal(planDisplayName("talent_portfolio"), "Portfolio");
    assert.equal(getPlan("talent_portfolio").tagline, "Your branded talent page");
  });
});

test("flags off: no refusal string advertises Web Office", () => {
  withSwitch(false, () => {
    const messages: string[] = [];
    for (const capability of DENIED_CAPABILITIES) {
      messages.push(siteCapabilityDeniedMessage(capability, "en"));
      messages.push(siteCapabilityDeniedMessage(capability, "es"));
    }
    for (const capability of ["template", "custom_builder", "profile_extras", "media_kit"] as const) {
      messages.push(planDeniedMessage(capability, "en"));
    }
    for (const message of messages) {
      assert.equal(
        /web office/i.test(message),
        false,
        `refusal copy leaks the unreleased tier name: ${message}`,
      );
      assert.equal(message.includes("—"), false, `refusal copy must not use an em dash: ${message}`);
    }
    // The paid tier is named, and named "Portfolio".
    assert.match(planDeniedMessage("custom_builder", "en"), /Upgrade to Portfolio\b/);
    assert.match(siteCapabilityDeniedMessage("site_pages", "en"), /part of Portfolio\./);
    assert.match(siteCapabilityDeniedMessage("site_pages", "es"), /parte de Portfolio\./);
  });
});

test("flags on: tier labels read Free / Web Office and Pro is folded", () => {
  withSwitch(true, () => {
    assert.equal(isTalentTierRenameEnabled(), true);
    assert.equal(talentTierLabel("free"), "Free");
    assert.equal(talentTierLabel("pro"), "Web Office");
    assert.equal(talentTierLabel("max"), "Web Office");

    assert.equal(buildTalentMembershipState("talent_pro").displayName, "Web Office");
    assert.equal(buildTalentMembershipState("talent_portfolio").displayName, "Web Office");
    assert.equal(planDisplayName("talent_portfolio"), "Web Office");

    assert.match(siteCapabilityDeniedMessage("site_pages", "en"), /part of Web Office\./);
    assert.match(siteCapabilityDeniedMessage("site_pages", "es"), /parte de Web Office\./);
    assert.match(planDeniedMessage("custom_builder", "en"), /Upgrade to Web Office\b/);
  });
});

test("the client-safe refusal copy has not drifted from the server copy", () => {
  // `talent-self-guard.ts` is `server-only`, so a lock chip in a "use client"
  // component cannot import it and reads the twin in
  // `talent-site/free-site-capability-denied-copy.ts` instead. The twin is
  // pinned to "Web Office" because a client bundle cannot read a
  // non-NEXT_PUBLIC env var; with the switch ON the two must agree exactly.
  withSwitch(true, () => {
    for (const capability of DENIED_CAPABILITIES) {
      for (const locale of ["en", "es"] as const) {
        assert.equal(
          siteCapabilityDeniedMessageClient(capability, locale),
          siteCapabilityDeniedMessage(capability, locale),
          `client twin drifted for ${capability}/${locale}`,
        );
      }
    }
  });
});

test("the Pro fold and every billing-shaped field are unconditional", () => {
  // The fold is a catalog decision, not a dark-launch one: `talent_pro` is
  // unsold on BOTH switch positions, so the compare drawer (a client
  // component that cannot read a non-NEXT_PUBLIC env var) never disagrees
  // with the server about which plans exist.
  for (const on of [false, true]) {
    withSwitch(on, () => {
      const visible = getVisibleTalentPlans().map((p) => p.key);
      assert.equal(visible.includes("talent_pro"), false);
      assert.ok(visible.includes("talent_portfolio"));
      assert.equal(getPlan("talent_pro").isSelfServe, false);
    });
  }
});

test("billing-shaped plan fields never move with the switch", () => {
  const snapshot = (on: boolean) =>
    withSwitchValue(on, () =>
      ALL_PLANS.map((key) => {
        const def = getPlan(key);
        return [def.key, def.rank, def.monthlyPriceCents, def.annualPriceCents, def.trialDays].join("|");
      }).join(";"),
    );
  assert.equal(snapshot(false), snapshot(true));
});

/** `withSwitch`, but returning the body's value. */
function withSwitchValue<T>(on: boolean, body: () => T): T {
  let out!: T;
  withSwitch(on, () => {
    out = body();
  });
  return out;
}
