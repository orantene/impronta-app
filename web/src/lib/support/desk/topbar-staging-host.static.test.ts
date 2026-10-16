import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { supportDeskOpenFromHqHref } from "./desk-url";

const dir = join(process.cwd(), "src/app/(workspace)/platform/admin");
const layout = readFileSync(join(dir, "layout.tsx"), "utf8");
const topbar = readFileSync(join(dir, "platform-topbar.tsx"), "utf8");

test("HQ top bar Support link goes to the staging desk on staging hosts", () => {
  assert.equal(
    supportDeskOpenFromHqHref("app.staging.tulala.digital"),
    "https://support.staging.tulala.digital/desk",
  );
  assert.equal(
    supportDeskOpenFromHqHref("app.tulala.digital"),
    "https://support.tulala.digital/desk",
  );
});

test("the server-seen host reaches the top bar, so first paint is not the prod desk", () => {
  assert.match(layout, /requestHostHint=\{requestHost\}/);
  assert.match(topbar, /useRequestHost\(\) \?\? requestHostHint/);
});
