import assert from "node:assert/strict";
import { test } from "node:test";

import { DEMO_CODE_RE, FORBIDDEN_PROFILE_CODES } from "../lib/demo-alt-i18n.mjs";
import { THEME_DEMOS } from "../../src/lib/talent-site/theme-catalog/theme-demos";
import { demoAltAllowList } from "./demo-alt-allowlist";

test("allow-list is derived from code, demo-shaped, and never holds a forbidden talent", () => {
  const { allowed } = demoAltAllowList();
  assert.ok(allowed.size >= 10, `expected the seeded demos, got ${allowed.size}`);
  for (const c of allowed) assert.match(c, DEMO_CODE_RE);
  for (const f of FORBIDDEN_PROFILE_CODES) assert.equal(allowed.has(f), false, f);
});

test("every THEME_DEMOS talent is on the allow-list", () => {
  const { allowed } = demoAltAllowList();
  for (const d of THEME_DEMOS) assert.ok(allowed.has(d.profileCode), d.profileCode);
});
