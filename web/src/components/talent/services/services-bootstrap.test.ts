import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { resetServicesBootstrap, seedServicesBootstrap, takeServicesSeed } from "./services-bootstrap";

const ok = { ok: true as const, items: [], defaultCurrency: "MXN", legacyImportable: false, usdRates: null };

test("TUL-824: seed is browser-only (module state never leaks across server requests)", () => {
  resetServicesBootstrap();
  seedServicesBootstrap({ talentProfileId: "t1", result: ok });
  assert.equal(takeServicesSeed("t1"), null); // node: no window
});

test("TUL-824: the route seeds the list and the editor takes it for the first load only", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const page = read("src/app/(workspace)/talent/services/page.tsx");
  assert.match(page, /loadServicesBootstrap\(\)/);
  assert.match(page, /<ServicesBootstrapSeed bundle=\{bundle\} \/>/);
  const hook = read("src/components/talent/services/use-offerings-editor.ts");
  assert.match(hook, /loadTick > 0 \? null : takeServicesSeed\(talentId\)/);
  const store = read("src/components/talent/services/services-bootstrap.ts");
  assert.match(store, /seeded\.talentProfileId !== talentProfileId/);
  assert.match(store, /FRESH_MS/);
});
