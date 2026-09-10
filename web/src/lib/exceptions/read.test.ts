import test from "node:test";
import assert from "node:assert/strict";

import { loadExceptions } from "./read";

/**
 * read.test.ts — the reader's failure behaviour, which is most of its job.
 *
 * This inbox exists because things go wrong quietly. A reader that turns a
 * missing enrichment into a missing SECTION reproduces, inside the tool, the
 * exact failure the tool exists to catch: an operator is told the queue is
 * broken and walks away from a payment that is sitting right there in it.
 *
 * The fake below is a PostgREST-shaped builder, not a database. What it can
 * prove is which reads happen and what the reader does when one of them
 * fails; it proves nothing about tenant isolation (see `wiring.static.test.ts`
 * for that) and nothing about the SQL itself.
 */

type Row = Record<string, unknown>;

type Reply = { data: Row[] | null; error: { message: string } | null };

/**
 * A read is answered by the first responder whose table matches and whose
 * `when` accepts the selected columns. Selecting a column the database does
 * not have is how PostgREST fails, and it fails the WHOLE select, which is the
 * defect being reproduced here.
 */
type Responder = {
  table: string;
  when?: (columns: string) => boolean;
  reply: Reply;
};

function fakeAdmin(responders: Responder[]) {
  const selects: Array<{ table: string; columns: string }> = [];
  const admin = {
    from(table: string) {
      let columns = "";
      const api: Record<string, unknown> = {
        select: (c: string) => {
          columns = c;
          selects.push({ table, columns: c });
          return api;
        },
        eq: () => api,
        in: () => api,
        or: () => api,
        order: () => api,
        limit: () => settle(),
        then: (resolve: (value: Reply) => unknown) => settle().then(resolve),
      };
      function settle(): Promise<Reply> {
        const match = responders.find(
          (r) => r.table === table && (r.when ? r.when(columns) : true),
        );
        return Promise.resolve(match?.reply ?? { data: [], error: null });
      }
      return api;
    },
  };
  return { admin: admin as never, selects };
}

const LONG_AGO = new Date(Date.now() - 90 * 60_000).toISOString();

const UNRESOLVED: Row = {
  id: "txn-1",
  order_id: "ord-1",
  gross_amount_cents: 1800,
  currency: "usd",
  requested_at: LONG_AGO,
  created_at: LONG_AGO,
};

const EMPTY: Reply = { data: [], error: null };

test("THE REGRESSION: a database with no metadata column still shows the stalled payment", async () => {
  // WHAT WENT WRONG. `metadata` was added to the unresolved-collections select
  // to find the provider request id. `booking_transactions.metadata` does not
  // exist in production, and a select naming a column PostgREST cannot find
  // fails the entire read — so a section that had worked for months became a
  // "could not read" banner, on every workspace, for the sake of a button.
  const { admin } = fakeAdmin([
    {
      table: "booking_transactions",
      when: (c) => c.includes("metadata"),
      reply: { data: null, error: { message: 'column booking_transactions.metadata does not exist' } },
    },
    { table: "booking_transactions", reply: { data: [UNRESOLVED], error: null } },
    { table: "pos_collection_recoveries", reply: EMPTY },
  ]);

  const load = await loadExceptions(admin, { tenantId: "ten-1", tenantSlug: "acme" });

  assert.deepEqual(
    load.unavailable,
    [],
    "a missing enrichment must not take the card-payments section down with it",
  );
  const row = load.rows.find((r) => r.source === "unresolved_collection");
  assert.ok(row, "the stalled payment vanished from the inbox");
  assert.match(row.detail, /18\.00 USD/);
  // No provider reference could be read, so the honest offer is to look, not
  // to arm a worker over a payment whose request id is unknown.
  assert.equal(row.nextAction.kind, "inspect");
});

test("with the column present the row can be asked about", async () => {
  const { admin } = fakeAdmin([
    {
      table: "booking_transactions",
      when: (c) => c.includes("metadata"),
      reply: {
        data: [{ id: "txn-1", metadata: { collection_payment_request_id: "cs_live_1" } }],
        error: null,
      },
    },
    { table: "booking_transactions", reply: { data: [UNRESOLVED], error: null } },
    {
      table: "pos_collection_recoveries",
      reply: {
        data: [
          {
            transaction_id: "txn-1",
            attempts: 8,
            last_state: "unknown",
            updated_at: LONG_AGO,
            escalated_at: LONG_AGO,
          },
        ],
        error: null,
      },
    },
  ]);

  const load = await loadExceptions(admin, { tenantId: "ten-1", tenantSlug: "acme" });
  const row = load.rows.find((r) => r.source === "unresolved_collection");
  assert.ok(row);
  assert.equal(row.nextAction.kind, "resume");
  assert.equal(row.attempts, 8);
  // The worker has spent its budget, and the row says so rather than implying
  // that something is still working on it.
  assert.match(row.title, /asking has stopped/i);
});

test("a failed read of the transactions themselves IS a failed section", async () => {
  // The other half of the rule. Degrading an enrichment is right; degrading
  // the read that decides whether the exception exists at all would be the
  // "nothing is wrong" screen this module was written to prevent.
  const { admin } = fakeAdmin([
    {
      table: "booking_transactions",
      reply: { data: null, error: { message: "connection reset" } },
    },
  ]);

  const load = await loadExceptions(admin, { tenantId: "ten-1", tenantSlug: "acme" });
  assert.deepEqual(load.unavailable, ["Card payments"]);
});

test("the recovery history is read once, for the transactions already found", async () => {
  const { admin, selects } = fakeAdmin([
    { table: "booking_transactions", when: (c) => c.includes("metadata"), reply: EMPTY },
    { table: "booking_transactions", reply: { data: [UNRESOLVED], error: null } },
    { table: "pos_collection_recoveries", reply: EMPTY },
  ]);

  await loadExceptions(admin, { tenantId: "ten-1", tenantSlug: "acme" });
  const recoveryReads = selects.filter((s) => s.table === "pos_collection_recoveries");
  assert.equal(recoveryReads.length, 1);
  assert.match(recoveryReads[0].columns, /escalated_at/);
});

test("no unresolved collections means neither enrichment is read at all", async () => {
  const { admin, selects } = fakeAdmin([{ table: "booking_transactions", reply: EMPTY }]);

  await loadExceptions(admin, { tenantId: "ten-1", tenantSlug: "acme" });
  assert.equal(
    selects.filter((s) => s.table === "booking_transactions").length,
    1,
    "an empty queue must not pay for two extra reads",
  );
  assert.equal(selects.filter((s) => s.table === "pos_collection_recoveries").length, 0);
});

// ── Mint shortfall lines that have already become refunds ─────────────

const SHORTFALL_LINE: Row = {
  order_line_id: "line-lost",
  order_id: "ord-lost",
  expected_rows: 1,
  minted_rows: 0,
  missing_rows: 1,
  order_updated_at: LONG_AGO,
};

test("a shortfall line with a refund intent is the money desk's row, not a second critical one", async () => {
  // PROVEN ON THE QA FIXTURE: pressing "Issue the missing tickets" on a seat
  // lost after payment writes the intent and the line stayed in the view,
  // still critical, still offering the button, above the refund it became.
  const { admin } = fakeAdmin([
    { table: "admissions_mint_shortfall", reply: { data: [SHORTFALL_LINE], error: null } },
    {
      table: "ticket_refund_intents",
      when: (columns) => columns === "order_line_id",
      reply: { data: [{ order_line_id: "line-lost" }], error: null },
    },
  ]);
  const load = await loadExceptions(admin, { tenantId: "ten-1", tenantSlug: "acme" });
  assert.equal(
    load.rows.filter((r) => r.source === "mint_shortfall").length,
    0,
    "the decided line must not be listed as a shortfall",
  );
});

test("a shortfall line with NO refund intent is still the door's problem", async () => {
  const { admin } = fakeAdmin([
    { table: "admissions_mint_shortfall", reply: { data: [SHORTFALL_LINE], error: null } },
  ]);
  const load = await loadExceptions(admin, { tenantId: "ten-1", tenantSlug: "acme" });
  const rows = load.rows.filter((r) => r.source === "mint_shortfall");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.nextAction.kind, "resume");
});

test("a failed intents read hides nothing", async () => {
  // The loud direction: a line shown twice beats a line shown never.
  const { admin } = fakeAdmin([
    { table: "admissions_mint_shortfall", reply: { data: [SHORTFALL_LINE], error: null } },
    {
      table: "ticket_refund_intents",
      when: (columns) => columns === "order_line_id",
      reply: { data: null, error: { message: "relation is being rebuilt" } },
    },
  ]);
  const load = await loadExceptions(admin, { tenantId: "ten-1", tenantSlug: "acme" });
  assert.equal(load.rows.filter((r) => r.source === "mint_shortfall").length, 1);
});
