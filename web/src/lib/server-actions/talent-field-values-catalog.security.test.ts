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
    /tenantScopedQuery\([\s\S]*?"agency_talent_roster"[\s\S]*?tenantId[\s\S]*?\)[\s\S]*?\.eq\("talent_profile_id", v\.talent_profile_id\)[\s\S]*?\.eq\("status", "active"\)/,
  );
  assert.match(
    SRC,
    /tenantScopedQuery\([\s\S]*?"agency_talent_roster"[\s\S]*?tenantId[\s\S]*?\)[\s\S]*?\.eq\("talent_profile_id", input\.talent_profile_id\)[\s\S]*?\.eq\("status", "active"\)/,
  );
});

test("INVARIANT talent self values read/write through tenantScopedQuery", () => {
  assert.match(
    SRC,
    /import \{ tenantScopedQuery \} from "\@\/lib\/supabase\/tenant-scoped-query";/,
  );
  assert.equal(
    (SRC.match(/tenantScopedQuery\([\s\S]*?"talent_profile_field_values"/g) ?? []).length >= 4,
    true,
  );
});

test("INVARIANT talent catalog writes are gated by the shared resolver", () => {
  assert.match(
    SRC,
    /async function requireResolvedTalentCatalogField[\s\S]*?resolveTalentFields\([\s\S]*?viewerRole: "talent"/,
  );
  assert.match(
    SRC,
    /import \{ isResolvedFieldVisibleInTalentEditor \} from "\@\/lib\/field-engine\/resolved-field-surfaces";/,
  );
  assert.match(
    SRC,
    /!field \|\| !isResolvedFieldVisibleInTalentEditor\(field\)/,
  );
  assert.equal(
    (SRC.match(/requireResolvedTalentCatalogField\(/g) ?? []).length >= 3,
    true,
  );
  assert.match(
    SRC,
    /return \{ ok: false, error: "This field is not available for your profile\." \};/,
  );
});

test("INVARIANT talent visibility changes keep the same editable-field gate as value writes", () => {
  assert.match(
    SRC,
    /setTalentFieldVisibilityAsTalent[\s\S]*?\.from\("profile_field_definitions"\)[\s\S]*?talent_editable[\s\S]*?def\.talent_editable === false/,
  );
});

test("INVARIANT talent field list is filtered to the talent-editable surface", () => {
  assert.match(
    SRC,
    /fields: resolved\.fields\.filter\(isResolvedFieldVisibleInTalentEditor\)/,
  );
});
