import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { localeSwitchRel } from "./locale-switch-rel";

test("?locale= links get nofollow, path hrefs do not", () => {
  assert.deepEqual(localeSwitchRel("?locale=es"), { rel: "nofollow" });
  assert.deepEqual(localeSwitchRel("/x?a=1&locale=es"), { rel: "nofollow" });
  assert.deepEqual(localeSwitchRel("/es/services"), {});
});

test("every ?locale= fallback anchor uses the shared helper", () => {
  for (const f of [
    "src/lib/site-admin/builder-node/utility-bar-block.tsx",
    "src/lib/site-admin/sections/site_header/header-site-chrome.tsx",
  ]) {
    assert.match(readFileSync(f, "utf8"), /localeSwitchRel\(/, f);
  }
});
