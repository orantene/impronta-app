import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = readFileSync(join(HERE, "admin-talent-field-values.ts"), "utf8");

test("INVARIANT admin catalog value writes are gated by the shared resolver", () => {
  assert.match(
    SRC,
    /import \{ resolveTalentFields \} from "\@\/lib\/field-engine\/resolve-talent-fields";/,
  );
  assert.match(
    SRC,
    /async function requireResolvedAdminCatalogField[\s\S]*?resolveTalentFields\([\s\S]*?viewerRole: "agency_admin"/,
  );
  assert.match(
    SRC,
    /import \{ isResolvedFieldVisibleInAdminEditor \} from "\@\/lib\/field-engine\/resolved-field-surfaces";/,
  );
  assert.match(
    SRC,
    /!field \|\| !isResolvedFieldVisibleInAdminEditor\(field\)/,
  );
  assert.equal(
    (SRC.match(/requireResolvedAdminCatalogField\(/g) ?? []).length >= 3,
    true,
  );
  assert.match(
    SRC,
    /return \{ ok: false, error: "This field is not available for this talent\." \};/,
  );
});

test("INVARIANT admin catalog visibility changes use the same resolver gate as value writes", () => {
  assert.match(
    SRC,
    /setTalentFieldVisibility[\s\S]*?const resolvedField = await requireResolvedAdminCatalogField/,
  );
});
