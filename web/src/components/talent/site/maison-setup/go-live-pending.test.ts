import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { goLiveHasPending } from "./go-live-pending";
import { sitePublishEntryState, sitePublishEntryTarget, SITE_PUBLISH_BUILDER_HREF } from "./site-publish-entry";

test("TUL-427: review host off links to the builder publish panel, never a dead button", () => {
  for (const st of ["fix-first", "publish", "republish"] as const) {
    const off = sitePublishEntryTarget(st, false);
    assert.equal(off.kind, "link");
    assert.ok(off.kind === "link" && off.href.length > 0 && off.href === SITE_PUBLISH_BUILDER_HREF);
    assert.equal(sitePublishEntryTarget(st, true).kind, "button");
  }
  assert.match(SITE_PUBLISH_BUILDER_HREF, /^\/talent\/page-builder\?panel=publish$/);
  assert.equal(sitePublishEntryTarget("published", false).kind, "button");
  const src = readFileSync(join(process.cwd(), "src/components/talent/site/maison-setup/SitePublishEntry.tsx"), "utf8");
  assert.match(src, /target\.kind === "link"[\s\S]*data-testid="talent-site-publish"/);
});

test("F137: changed header + new location block counts as pending", () => {
  assert.equal(goLiveHasPending({ unpublishedCount: 2, firstPublish: null }), true);
  assert.equal(goLiveHasPending({ unpublishedCount: 0, firstPublish: { pages: 1, sections: 3 } }), true);
  assert.equal(goLiveHasPending({ unpublishedCount: 0, firstPublish: null }), false);
});

test("F137: the live card reads the go-live summary, not design options", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/talent/site/maison-setup/MyWebsiteCard.tsx"),
    "utf8",
  );
  assert.match(src, /takeOr\("goLive", "card", loadTalentGoLiveAction\)/);
  assert.match(src, /goLiveHasPending\(res\.summary\)/);
  assert.doesNotMatch(src, /hasLivePending|loadMaisonDesignOptionsStateAction/);
});

test("TUL-427: publish entry state per (published, publishable, pending)", () => {
  const s = sitePublishEntryState;
  assert.equal(s({ published: false, publishable: false, hasPending: null }), "fix-first");
  assert.equal(s({ published: false, publishable: true, hasPending: null }), "publish");
  assert.equal(s({ published: true, publishable: true, hasPending: true }), "republish");
  assert.equal(s({ published: true, publishable: true, hasPending: false }), "published");
  assert.equal(s({ published: true, publishable: true, hasPending: null }), "published");
});

test("TUL-427: the entry has a stable testid + aria-label and opens Review from both states", () => {
  const root = join(process.cwd(), "src/components/talent/site");
  const entry = readFileSync(join(root, "maison-setup/SitePublishEntry.tsx"), "utf8");
  assert.match(entry, /data-testid="talent-site-publish"/);
  assert.match(entry, /aria-label=\{label\}/);
  const mgr = readFileSync(join(root, "TalentMaxSiteManager.tsx"), "utf8");
  assert.match(mgr, /onOpenReview=\{\(\) => openSetup\("review"\)\}/);
  const card = readFileSync(join(root, "maison-setup/MyWebsiteCard.tsx"), "utf8");
  assert.match(card, /<SitePublishEntry/);
});
