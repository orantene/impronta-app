import test from "node:test";
import assert from "node:assert/strict";

import { releaseCountsForChannels } from "./release-design.server";

const TALENT = ["optin", "default"];
const DEMOS = ["demos", "optin", "default"];

test("optin/default count only when published", () => {
  assert.equal(releaseCountsForChannels({ channel: "optin", status: "published" }, TALENT), true);
  assert.equal(releaseCountsForChannels({ channel: "default", status: "published" }, TALENT), true);
  assert.equal(releaseCountsForChannels({ channel: "optin", status: "draft" }, TALENT), false);
  assert.equal(releaseCountsForChannels({ channel: "default", status: "paused" }, DEMOS), false);
});

test("REGRESSION: a demos-channel release (stored status draft) counts for the demos loader", () => {
  assert.equal(releaseCountsForChannels({ channel: "demos", status: "draft" }, DEMOS), true);
  assert.equal(releaseCountsForChannels({ channel: "demos", status: "published" }, DEMOS), true);
});

test("demos releases never count for a talent apply", () => {
  assert.equal(releaseCountsForChannels({ channel: "demos", status: "draft" }, TALENT), false);
  assert.equal(releaseCountsForChannels({ channel: "demos", status: "published" }, TALENT), false);
});

test("a paused or archived demos release does not count; the draft channel never does", () => {
  assert.equal(releaseCountsForChannels({ channel: "demos", status: "paused" }, DEMOS), false);
  assert.equal(releaseCountsForChannels({ channel: "demos", status: "archived" }, DEMOS), false);
  assert.equal(releaseCountsForChannels({ channel: "draft", status: "draft" }, DEMOS), false);
});
