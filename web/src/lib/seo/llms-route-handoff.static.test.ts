/**
 * TUL-589 (QA Batch 18: staging.tulala.digital/llms.txt answered a bare "Not found").
 *
 * `src/app/llms.txt/route.ts` (Posts v1) is a filesystem route, and a filesystem route beats the
 * `/llms.txt -> /api/llms` rewrite in next.config.ts. So the marketing host never reached the platform
 * handler. The Posts route must hand off to it when the host is not an agency or talent post site.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "src");
const postsRoute = readFileSync(join(root, "app/llms.txt/route.ts"), "utf8");
const platformRoute = readFileSync(join(root, "app/api/llms/route.ts"), "utf8");

test("the Posts llms.txt route hands a non-post-site host to the platform handler instead of 404", () => {
  assert.match(postsRoute, /import \{ GET as \w+ \} from "@\/app\/api\/llms\/route"/);
  assert.match(postsRoute, /if \(!site\) return \w+\(\)/);
  assert.doesNotMatch(postsRoute, /if \(!site\) return new Response\("Not found"/);
});

test("the platform handler still serves the marketing route and 404s unknown hosts", () => {
  assert.match(platformRoute, /decision\.route === "marketing"/);
  assert.match(platformRoute, /decision\.route === "not_found"/);
});
