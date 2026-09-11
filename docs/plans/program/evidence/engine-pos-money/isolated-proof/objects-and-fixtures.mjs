import pg from "pg";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, params) => (await client.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const TENANT = "33333333-3333-4333-8333-333333333333";
const OWNER_USER = "33330001-0000-4000-8000-000000000001"; // role=owner, status=active -> pos_membership_is_manager true
const SPACE_START = "33330011-0000-4000-8000-000000000015"; // Table 5
const SPACE_A = "33330011-0000-4000-8000-000000000001"; // Table 1
const SPACE_B = "33330011-0000-4000-8000-000000000002"; // Room A

const out = [];
const log = (s) => { console.log(s); out.push(s); };

// ---------------------------------------------------------------------------
// TASK 1: object existence + privilege checks
// ---------------------------------------------------------------------------
log("## Task 1 — object existence + privileges\n");

const tableChecks = ["pos_approvals", "pos_device_sessions", "payment_links", "waitlist_offers", "pos_shift_movements"];
for (const t of tableChecks) {
  const r = await one(`select to_regclass('public.' || $1) as reg`, [t]);
  log(`table public.${t}: ${r.reg ? "EXISTS" : "MISSING"}`);
}

const colChecks = [
  ["orders", "tip_cents"],
  ["order_lines", "kind"],
  ["order_lines", "operator_user_id"],
  ["order_lines", "booking_id"],
  ["order_lines", "booking_kind"],
];
for (const [t, c] of colChecks) {
  const r = await one(
    `select data_type from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
    [t, c]
  );
  log(`column public.${t}.${c}: ${r ? "EXISTS (" + r.data_type + ")" : "MISSING"}`);
}

const funcSigs = [
  ["pos_approve_custom_amount", "uuid,uuid,uuid,text,uuid,text,text"],
  ["pos_link_booking", "uuid,uuid,text,uuid,text"],
  ["pos_set_tip", "uuid,uuid,bigint,text,integer"],
  ["visit_transfer", "uuid,uuid,uuid,text"],
  ["visit_split_check", "uuid,uuid,uuid[],text"],
  ["visit_merge_checks", "uuid,uuid,uuid,text"],
  ["visit_change_server", "uuid,uuid,uuid"],
  ["waitlist_offer_place", "uuid,uuid,text,integer"],
  ["waitlist_accept_offer", "uuid,uuid,text"],
  ["waitlist_decline_offer", "uuid,uuid"],
  ["pos_set_staff_pin", "uuid,uuid,uuid,text"],
  ["pos_reserve_collection", "uuid,uuid,text,bigint,text,uuid,integer,integer"],
];
for (const [fn, args] of funcSigs) {
  const sig = `public.${fn}(${args})`;
  const exists = await one(`select to_regprocedure($1) as reg`, [sig]);
  const anonEx = await one(`select has_function_privilege('anon', $1, 'execute') as ok`, [sig]);
  const svcEx = await one(`select has_function_privilege('service_role', $1, 'execute') as ok`, [sig]);
  const authEx = await one(`select has_function_privilege('authenticated', $1, 'execute') as ok`, [sig]);
  log(
    `function ${sig}: ${exists.reg ? "EXISTS" : "MISSING"} | anon.execute=${anonEx.ok} authenticated.execute=${authEx.ok} service_role.execute=${svcEx.ok}`
  );
}

// ---------------------------------------------------------------------------
// TASK 3 (done before 2 so approvals fixture in task2 area can reuse pin): PIN path
// ---------------------------------------------------------------------------
log("\n## Task 3 — manager PIN path via pos_set_staff_pin / pos_approve_custom_amount\n");

const pinSetOk = await one(
  `select public.pos_set_staff_pin($1,$2,$3,$4) as r`,
  [TENANT, OWNER_USER, OWNER_USER, "4321"]
);
log(`pos_set_staff_pin(tenant, owner-as-actor, owner-as-target, '4321') => ${JSON.stringify(pinSetOk.r)}`);

const pinOrder = await one(
  `insert into public.orders (tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents, total_cents, source_channel, guest_session_id, version)
   values ($1,'draft','USD',0,0,0,0,'pos','pin-proof-session',1) returning id`,
  [TENANT]
);
const pinOrderId = pinOrder.id;
const addLine = await one(
  `select public.pos_mutate_draft_line($1,$2,1,'add', jsonb_build_object('kind','custom','label','Custom PIN item','units',1,'unit_cents',1500,'total_cents',1500,'owner_tenant_id',$1::uuid)) as r`,
  [TENANT, pinOrderId]
);
log(`pos_mutate_draft_line add custom line => ${JSON.stringify(addLine.r)}`);
const lineId = addLine.r.line_id;

const wrongPin = await one(
  `select public.pos_approve_custom_amount($1,$2,$3,'pin-proof-op-wrong', $4, '0000', 'pin') as r`,
  [TENANT, pinOrderId, lineId, OWNER_USER]
);
log(`pos_approve_custom_amount with WRONG pin '0000' => ${JSON.stringify(wrongPin.r)}`);

const rightPin = await one(
  `select public.pos_approve_custom_amount($1,$2,$3,'pin-proof-op-right', $4, '4321', 'pin') as r`,
  [TENANT, pinOrderId, lineId, OWNER_USER]
);
log(`pos_approve_custom_amount with RIGHT pin '4321' => ${JSON.stringify(rightPin.r)}`);

const approvalRow = await q(`select id, kind, approver_user_id, method, operation_key from public.pos_approvals where line_id=$1`, [lineId]);
log(`ground truth pos_approvals row(s) for line ${lineId}: ${JSON.stringify(approvalRow)}`);

// cleanup PIN fixture
await q(`delete from public.pos_approvals where order_id=$1`, [pinOrderId]);
await q(`delete from public.order_lines where order_id=$1`, [pinOrderId]);
await q(`delete from public.orders where id=$1`, [pinOrderId]);
log(`cleaned up PIN-proof order ${pinOrderId} and its line/approval rows`);

// ---------------------------------------------------------------------------
// TASK 2a: payment-link reserve race fixture
// ---------------------------------------------------------------------------
log("\n## Task 2 — race scripts\n");
log("### verify-payment-link-reserve.mjs\n");

const plOrder = await one(
  `insert into public.orders (tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents, total_cents, source_channel, guest_session_id, version)
   values ($1,'draft','USD',0,0,0,0,'pos','paylink-race-session',1) returning id`,
  [TENANT]
);
const plOrderId = plOrder.id;
const plLine = await one(
  `select public.pos_mutate_draft_line($1,$2,1,'add', jsonb_build_object('kind','catalog','label','Fixture item','units',1,'unit_cents',5000,'total_cents',5000,'owner_tenant_id',$1::uuid)) as r`,
  [TENANT, plOrderId]
);
log(`fixture: created draft order ${plOrderId}, added catalog line => ${JSON.stringify(plLine.r)}`);

// ---------------------------------------------------------------------------
// TASK 2b: visit transfer race fixture
// ---------------------------------------------------------------------------
log("\n### verify-visit-transfer-race.mjs\n");
const visit = await one(
  `insert into public.visits (tenant_id, space_id, status, version, opened_by, service_kind, party_size, public_token)
   values ($1,$2,'open',1,$3,'table',2,$4) returning id`,
  [TENANT, SPACE_START, OWNER_USER, `xfer-race-${Date.now()}`]
);
const visitId = visit.id;
log(`fixture: created open visit ${visitId} at space ${SPACE_START} (Table 5); race targets space_a=${SPACE_A} (Table 1) space_b=${SPACE_B} (Room A)`);

// ---------------------------------------------------------------------------
// TASK 2c: waitlist offer race fixture
// ---------------------------------------------------------------------------
log("\n### verify-waitlist-offer-race.mjs\n");
const sessRow = await one(
  `select s.id as session_id, cp.id as pool_id
     from public.capacity_pools cp
     join public.sessions s on s.id = cp.subject_id
    where cp.tenant_id=$1 and cp.subject_kind='session_tier' and cp.pool_key='seat' and s.starts_at > now()
    order by s.starts_at limit 1`,
  [TENANT]
);
log(`fixture: using session ${sessRow.session_id} / pool ${sessRow.pool_id} for waitlist offer`);

const wlEntry = await one(
  `insert into public.session_waitlist_entries (tenant_id, session_id, customer_name, party_size, status)
   values ($1,$2,'Race Fixture Party',1,'waiting') returning id`,
  [TENANT, sessRow.session_id]
);
const wlEntryId = wlEntry.id;
const offerPlace = await one(
  `select public.waitlist_offer_place($1,$2,'waitlist-race-fixture-place', 900) as r`,
  [TENANT, wlEntryId]
);
log(`waitlist_offer_place(entry=${wlEntryId}) => ${JSON.stringify(offerPlace.r)}`);
const offerId = offerPlace.r.ok ? offerPlace.r.offer_id : null;

await client.end();

fs.writeFileSync("/tmp/proof-out.json", JSON.stringify({
  plOrderId, visitId, wlEntryId, offerId, pinOrderId: null,
}, null, 2));

log(`\n(fixture ids written for the driver script)`);
fs.writeFileSync(process.env.PROOF_LOG_OUT, out.join("\n"));
