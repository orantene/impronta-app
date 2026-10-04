import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { websiteRewardCopy, websiteRewardState } from "./website-reward";

describe("websiteRewardState", () => {
  it("is live when the site is published even at low completion (W23)", () => {
    assert.equal(websiteRewardState({ completionPercent: 40, siteStatus: "published" }), "live");
  });
  it("waits on an unfinished profile below 100", () => {
    assert.equal(websiteRewardState({ completionPercent: 50, siteStatus: null }), "profile_unfinished");
    assert.equal(websiteRewardState({ completionPercent: 80, siteStatus: null }), "profile_unfinished");
    assert.equal(websiteRewardState({ completionPercent: 99, siteStatus: null }), "profile_unfinished");
  });
  it("unlocks only at 100% with no site (W19)", () => {
    assert.equal(websiteRewardState({ completionPercent: 100, siteStatus: null }), "unlocked_not_activated");
  });
  it("is setup unfinished for a draft site", () => {
    assert.equal(websiteRewardState({ completionPercent: 100, siteStatus: "draft" }), "setup_unfinished");
  });
  it("is ready to publish when unpublished", () => {
    assert.equal(websiteRewardState({ completionPercent: 100, siteStatus: "unpublished" }), "ready_to_publish");
  });
});

describe("websiteRewardCopy", () => {
  it("uses §4.1 header titles", () => {
    assert.equal(
      websiteRewardCopy("profile_unfinished", 83, "en").title,
      "Unlock your free website",
    );
    assert.equal(
      websiteRewardCopy("unlocked_not_activated", 100, "en").title,
      "Activate your website",
    );
    assert.equal(
      websiteRewardCopy("setup_unfinished", 100, "en").title,
      "Finish website setup",
    );
    assert.equal(websiteRewardCopy("live", 40, "en").title, "Website live");
  });
  it("never returns Unlock title for live state", () => {
    const copy = websiteRewardCopy("live", 10, "en");
    assert.equal(copy.title.includes("Unlock"), false);
  });
});
