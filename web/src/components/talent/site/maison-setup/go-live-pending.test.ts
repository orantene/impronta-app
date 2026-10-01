import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { goLiveHasPending } from "./go-live-pending";

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
