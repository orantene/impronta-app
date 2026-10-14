/** TUL-607: the topbar website href must not branch on `window` during render. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = readFileSync(path.join(__dirname, "topbar.tsx"), "utf8");

test("workspaceWebsiteHref starts from the server value and resolves in an effect", () => {
  const start = src.indexOf("const serverWebsiteHref");
  assert.ok(start > 0, "serverWebsiteHref present");
  const block = src.slice(start, src.indexOf("const workspaceWebsiteHref", start));
  assert.match(block, /useEffect\(/);
  assert.match(block, /resolveWorkspaceAdminBaseForLocation\(/);
  const render = src.slice(src.indexOf("const workspaceWebsiteHref"), src.indexOf("const workspaceWebsiteHref") + 200);
  assert.doesNotMatch(render, /typeof window|window\.location/);
  assert.doesNotMatch(src, /useMemo\(\(\) => \{\s*if \(websiteSlug === ""\) return "\/admin\/site"/);
});
