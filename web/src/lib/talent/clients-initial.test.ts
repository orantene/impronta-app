import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { seedInitialClients, takeInitialClients } from "./clients-initial";

test("seed is one-shot and talent-scoped", () => {
  seedInitialClients("t1", { ok: true, items: [] });
  assert.equal(takeInitialClients("t2"), null);
  assert.deepEqual(takeInitialClients("t1"), { ok: true, items: [] });
  assert.equal(takeInitialClients("t1"), null);
  assert.equal(takeInitialClients(null), null);
});

test("initial Clients load no longer waits for mount", () => {
  const page = readFileSync(
    new URL("../../components/admin/shell/internal/talent/pages/ClientsPage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /useState\(\(\) => takeInitialClients\(talentId\)\)/);
  assert.match(page, /skipFirstFetch\.current/);
  const route = readFileSync(
    new URL("../../app/(workspace)/talent/clients/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /await loadTalentClients\(talentId\)/);
  assert.match(route, /<ClientsInitialSeed/);
});
