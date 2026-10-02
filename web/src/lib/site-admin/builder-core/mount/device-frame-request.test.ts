import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { deviceFromFrameParam, isDeviceFrameRequest } from "./device-frame-request";

test("F133: ?iframe=1 is the device frame request", () => {
  assert.equal(isDeviceFrameRequest(new URLSearchParams("iframe=1&device=mobile")), true);
  assert.equal(isDeviceFrameRequest(new URLSearchParams("page=home")), false);
  assert.equal(isDeviceFrameRequest(null), false);
  assert.equal(deviceFromFrameParam(new URLSearchParams("device=mobile")), "mobile");
  assert.equal(deviceFromFrameParam(new URLSearchParams("device=bogus")), undefined);
});

test("F133: the shared builder mount returns the canvas-only frame BEFORE any editor chrome", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-core/mount/BuilderEditorMount.tsx"),
    "utf8",
  );
  const frame = src.indexOf("isDeviceFrameRequest(searchParams)");
  const shell = src.lastIndexOf("<EditShell");
  assert.ok(frame > 0 && shell > frame, "frame branch must precede <EditShell>");
  const branch = src.slice(frame, shell);
  assert.match(branch, /<IframeChild/);
  assert.match(branch, /<InEditorCanvasRegion/);
  assert.doesNotMatch(branch, /<EditShell|topbar|TopBar/);
});
