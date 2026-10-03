import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(process.cwd(), "src/app/api/health/flags/route.ts"), "utf8");

test("/api/health/flags gates with platform admin or CRON_SECRET bearer", () => {
  assert.match(SRC, /decideRebuildAuth/);
  assert.match(SRC, /isPlatformAdmin/);
  assert.match(SRC, /CRON_SECRET/);
  assert.match(SRC, /resolveProdGatingFlags/);
  assert.doesNotMatch(SRC, /SUPPORT_DESK_ENABLED\s*=/);
});
