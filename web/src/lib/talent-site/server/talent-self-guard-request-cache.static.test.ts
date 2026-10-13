/**
 * PERF-SITE: the self-profile read behind requireTalentSelf is deduped per
 * request, so the parallel /talent/site bootstrap loaders share one read.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const guard = readFileSync(join(process.cwd(), "src/lib/server/talent-self-guard.ts"), "utf8");
const bootstrap = readFileSync(
  join(process.cwd(), "src/lib/talent-site/server/public-page-bootstrap.server.ts"),
  "utf8",
);

test("default self-guard deps use a per-request cached profile loader", () => {
  assert.match(guard, /import \{ cache \} from "react"/);
  assert.match(guard, /cache\(loadTalentSelfProfileByUser\)/);
  assert.match(guard, /loadProfileByUser: loadProfileByUserOncePerRequest/);
});

test("the /talent/site bootstrap stays a single Promise.all fan-out", () => {
  assert.match(bootstrap, /await Promise\.all\(\[/);
});
