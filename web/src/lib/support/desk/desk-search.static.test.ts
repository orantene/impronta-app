import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("desk server search wiring (TUL-624)", () => {
  const actions = read("../hq-actions.ts");
  const action = actions.slice(actions.indexOf("export async function hqSearchTicketsAction"));
  const loader = read("../load-hq-search.ts");

  it("the action validates input and checks HQ access before touching the DB", () => {
    assert.ok(action.indexOf("safeParse") < action.indexOf("assertHqAccess"));
    assert.ok(action.indexOf("assertHqAccess") < action.indexOf("searchHqSupportTickets"));
  });

  it("the loader only searches parsed terms and pages with range()", () => {
    assert.match(loader, /parseDeskSearch\(raw\)/);
    assert.match(loader, /\.range\(/);
    assert.doesNotMatch(loader, /\.rpc\(|\.sql\(|raw\s*\}/);
  });

  it("the queue client uses the server search and has ES/EN/FR labels", () => {
    const client = read("../../../app/(workspace)/platform/admin/support/SupportQueueClient.tsx");
    assert.match(client, /useServerTicketSearch\(q\)/);
    for (const l of ["en", "es", "fr"]) {
      const m = read(`../../../../messages/${l}.json`);
      assert.match(m, /"searchLoadMore"/);
      assert.match(m, /"searchLoading"/);
    }
  });
});
