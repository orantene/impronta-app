import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { websiteRewardState } from "./website-reward";

describe("websiteRewardState", () => {
  it("is live when the site is published", () => {
    assert.equal(websiteRewardState({ completionPercent: 40, siteStatus: "published" }), "live");
  });
  it("waits on an unfinished profile", () => {
    assert.equal(websiteRewardState({ completionPercent: 50, siteStatus: null }), "profile_unfinished");
  });
  it("unlocks when the score is high and there is no site", () => {
    assert.equal(websiteRewardState({ completionPercent: 80, siteStatus: null }), "unlocked_not_activated");
  });
  it("is setup unfinished for a draft site", () => {
    assert.equal(websiteRewardState({ completionPercent: 90, siteStatus: "draft" }), "setup_unfinished");
  });
  it("is ready to publish when unpublished", () => {
    assert.equal(websiteRewardState({ completionPercent: 90, siteStatus: "unpublished" }), "ready_to_publish");
  });
});
