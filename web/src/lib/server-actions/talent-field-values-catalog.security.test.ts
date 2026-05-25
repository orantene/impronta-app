import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = readFileSync(join(HERE, "talent-field-values-catalog.ts"), "utf8");

test("INVARIANT talent self catalog actions gate by ownership-based requireTalentSelfAction (not role-gated requireTalent)", () => {
  assert.match(
    SRC,
    /import \{ requireTalentSelfAction \} from "\@\/lib\/saas\/admin-scope";/,
  );
  assert.doesNotMatch(
    SRC,
    /import \{ requireTalent \} from "\@\/lib\/server\/action-guards";/,
  );
  assert.equal(
    (SRC.match(/requireTalentSelfAction\(/g) ?? []).length >= 4,
    true,
  );
});

test("INVARIANT roster tenant lookups are scoped to the active tenant before write/resolve", () => {
  assert.match(
    SRC,
    /\.from\("agency_talent_roster"\)[\s\S]*?\.eq\("talent_profile_id", v\.talent_profile_id\)[\s\S]*?\.eq\("tenant_id", tenantId\)[\s\S]*?\.eq\("status", "active"\)/,
  );
  assert.match(
    SRC,
    /\.from\("agency_talent_roster"\)[\s\S]*?\.eq\("talent_profile_id", input\.talent_profile_id\)[\s\S]*?\.eq\("tenant_id", tenantId\)[\s\S]*?\.eq\("status", "active"\)/,
  );
});
