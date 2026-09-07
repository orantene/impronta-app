import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `tenantId` MUST ride the no-data early return.
 *
 * `loadBuilderNodeDataSources` skips its queries when no block on the page
 * declares a data need. That is a cost optimisation and it is correct, but it
 * used to `return { publicOrigin }`, dropping the tenant id, which is not a
 * query result at all. It is an argument already in hand.
 *
 * WHAT THAT COST, on 2026-09-06: El Paisa's live Reservas page. Its only
 * dynamic block is `reserve_table`, which deliberately declares no data need
 * (the island loads availability through its own server action). So every
 * need was false, the early return fired, `dataSources.tenantId` was
 * undefined, the renderer's `?? ""` made it an empty string, and the server
 * action rejected "" as a non-uuid and answered `unavailable`. The guest read
 * "no pudimos cargar los horarios, inténtalo en un momento", on a 200, with
 * no console error, permanently.
 *
 * A STATIC TEST rather than a call: the function opens Supabase clients and
 * reads env, and the property under test is a shape guarantee about one
 * `return` statement. Asserting the source keeps the guard honest about what
 * it actually checks.
 */

const SRC = join(process.cwd(), "src/components/home/homepage-cms-data-sources.ts");

test("the no-data early return still carries tenantId", () => {
  const source = readFileSync(SRC, "utf8");

  // The bare form that caused the outage. Matching on the exact statement
  // rather than "does tenantId appear somewhere", it appears many times in
  // this file, so a loose search would pass on the broken code.
  assert.ok(
    !/return\s*\{\s*publicOrigin\s*\}\s*;/.test(source),
    "found `return { publicOrigin };`, the early return dropped tenantId again. " +
      "Every block may read dataSources.tenantId; it must not depend on whether " +
      "some OTHER block needed a query.",
  );

  assert.ok(
    /return\s*\{\s*tenantId:\s*dataTenantId,\s*publicOrigin\s*\}\s*;/.test(source),
    "the early return must be `return { tenantId: dataTenantId, publicOrigin };`",
  );
});

test("the guard is reading the file it thinks it is", () => {
  // A guard that silently measures nothing is worse than no guard. If this
  // file is renamed or restructured, fail here rather than passing vacuously.
  const source = readFileSync(SRC, "utf8");
  assert.match(source, /export async function loadBuilderNodeDataSources/);
  assert.match(source, /const dataTenantId = previewSubject\?\.id \?\? tenantId;/);
});
