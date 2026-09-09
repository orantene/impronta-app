/**
 * Read-only probe of the isolated `qa-journeys` branch.
 *
 * WHY THIS EXISTS. START-HERE claimed "seed applied" and listed a paragraph of
 * hand-repaired functions, and NOTHING in the repo could check either claim.
 * `check:migrations-applied` cannot: it calls `list_applied_migrations`, and
 * that RPC was never replayed onto this branch, so the one drift detector we
 * own reports an error rather than a state. A claim no tool can falsify is not
 * evidence, and this program's whole discipline is that absence must be
 * structurally distinct from a value.
 *
 * So this asks Postgres directly, over `DATABASE_URL`, and prints what IS
 * there: the engine functions the journeys depend on, the objects today's
 * migrations add, and the fixture rows. It writes nothing. Every statement is
 * a catalog read or a COUNT, and the connection is opened read-only so a typo
 * cannot become a mutation.
 *
 * Isolated target only. The shared guard refuses production, Impronta and
 * `.env.vercel.local` before a socket is opened.
 *
 *   JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local \
 *     scripts/probe-journeys-isolated.mjs
 *
 * Exit codes: 0 everything expected is present, 1 something expected is
 * missing, 2 refused (wrong target or no flag).
 */

import pg from "pg";
import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

const target = assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[probe] DATABASE_URL is required. It lives in the gitignored isolated env file.");
  process.exit(2);
}

/**
 * Functions the 48 journeys actually call. Grouped so a failure names the
 * capability that is broken rather than a bare identifier.
 */
const FUNCTIONS = {
  "capacity engine": [
    "reserve_capacity",
    "reserve_capacity_batch",
    "release_capacity",
    "upsert_capacity_pool",
    "_capacity_reserve_locked",
    "extend_capacity_hold",
  ],
  "multi-resource commitment": ["reserve_resource_set"],
  "POS draft (20261230000700)": [
    "pos_apply_draft_totals",
    "pos_mutate_draft_line",
    "pos_cancel_draft",
  ],
  entitlements: ["drawdown_lesson_package"],
  "door and tickets": ["check_in", "refund_admission"],
  "event cancellation (20261230000800)": ["cancel_event_cascade"],
  "outbox (20261230001300)": ["claim_outbox_messages"],
  "inquiry engine": ["engine_send_offer", "engine_submit_approval"],
};

/** Tables and columns today's migrations add. Drift shows up here first. */
const TABLES = [
  "capacity_pools",
  "capacity_allocations",
  "admissions",
  "events",
  "sessions",
  "orders",
  "order_lines",
  "talent_holds",
  "talent_bookings",
  "agency_bookings",
  "booking_transactions",
  "ticket_refund_intents",
  "calendar_feed_tokens",
  "command_idempotency",
  "outbox_messages",
];

const COLUMNS = [
  ["orders", "age_gate_min_age"],
  ["orders", "age_gate_confirmed_age"],
  ["orders", "age_gate_confirmed_at"],
  ["admissions", "line_seq"],
  ["sessions", "event_id"],
];

const INDEXES = [
  "agency_bookings_order_uniq",
  "talent_holds_firm_no_overlap",
  "talent_bookings_no_overlap",
  "command_idempotency_key_unique",
  "outbox_messages_dedupe_unique",
  "calendar_feed_tokens_live_per_user",
];

const TENANT_A = process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
const TENANT_B = "33333333-3333-4333-8333-333333333334";

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
// Belt as well as braces: the guard picked the target, this makes the SESSION
// incapable of writing to it whatever the statements below turn out to say.
await client.query("SET default_transaction_read_only = on");

const missing = [];

function report(label, ok, detail = "") {
  console.log(`  ${ok ? "OK  " : "MISS"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) missing.push(label);
}

console.log(`\n[probe] isolated target ${target.allowedRef}  (read-only session)\n`);

console.log("FUNCTIONS");
for (const [group, names] of Object.entries(FUNCTIONS)) {
  console.log(` ${group}`);
  for (const name of names) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n, bool_or(prokind = 'f') AS is_fn
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`,
      [name],
    );
    const n = rows[0]?.n ?? 0;
    report(name, n > 0, n > 1 ? `(${n} overloads)` : "");
  }
}

console.log("\nTABLES");
for (const table of TABLES) {
  const { rows } = await client.query(
    `SELECT to_regclass('public.' || $1) IS NOT NULL AS present`,
    [table],
  );
  report(table, rows[0]?.present === true);
}

console.log("\nCOLUMNS");
for (const [table, column] of COLUMNS) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  report(`${table}.${column}`, (rows[0]?.n ?? 0) > 0);
}

console.log("\nINDEXES AND CONSTRAINTS");
for (const name of INDEXES) {
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM pg_class WHERE relname = $1)
          + (SELECT count(*) FROM pg_constraint WHERE conname = $1) AS n`,
    [name],
  );
  report(name, Number(rows[0]?.n ?? 0) > 0);
}

// ── Fixture. Counted per workspace, because "seeded" for workspace A while B
// is empty is exactly the half-state the two-workspace isolation cases need to
// distinguish, and a single total would hide it.
console.log("\nFIXTURE ROWS (workspace A / workspace B)");
const FIXTURE_TABLES = [
  "spaces",
  "talent_offerings",
  "sessions",
  "capacity_pools",
  "customers",
  "orders",
];
for (const table of FIXTURE_TABLES) {
  const present = await client.query(`SELECT to_regclass('public.' || $1) IS NOT NULL AS p`, [table]);
  if (present.rows[0]?.p !== true) {
    report(table, false, "(table absent)");
    continue;
  }
  const { rows } = await client.query(
    `SELECT
       count(*) FILTER (WHERE tenant_id = $1)::int AS a,
       count(*) FILTER (WHERE tenant_id = $2)::int AS b
     FROM public.${table}`,
    [TENANT_A, TENANT_B],
  );
  const a = rows[0]?.a ?? 0;
  const b = rows[0]?.b ?? 0;
  report(table, a > 0, `A=${a} B=${b}`);
}

const tenants = await client.query(
  `SELECT id, slug FROM public.agencies WHERE id = ANY($1::uuid[]) ORDER BY id`,
  [[TENANT_A, TENANT_B]],
);
console.log("\nWORKSPACES");
for (const [label, id] of [["A", TENANT_A], ["B", TENANT_B]]) {
  const row = tenants.rows.find((r) => r.id === id);
  report(`workspace ${label}`, row !== undefined, row?.slug ?? "");
}

// Browser journeys resolve the storefront by Host header, so a seeded
// workspace with no domain row is still unreachable in a browser.
console.log("\nHOSTS (agency_domains — browser journeys resolve by Host)");
const domains = await client.query(
  `SELECT tenant_id, hostname, status FROM public.agency_domains
    WHERE tenant_id = ANY($1::uuid[]) ORDER BY hostname`,
  [[TENANT_A, TENANT_B]],
);
for (const [label, id] of [["A", TENANT_A], ["B", TENANT_B]]) {
  const hosts = domains.rows.filter((r) => r.tenant_id === id);
  report(
    `workspace ${label} host`,
    hosts.some((r) => r.status === "active"),
    hosts.map((r) => `${r.hostname} (${r.status})`).join(", "),
  );
}

await client.end();

console.log("");
if (missing.length > 0) {
  console.error(`[probe] ${missing.length} expected object(s) missing:\n  - ${missing.join("\n  - ")}\n`);
  console.error("[probe] Isolated branch only. Repair there; never re-apply to production.");
  process.exit(1);
}
console.log("[probe] every expected function, table, column, index and fixture row is present.\n");
process.exit(0);
