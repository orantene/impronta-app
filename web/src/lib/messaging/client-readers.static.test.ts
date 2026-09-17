/**
 * D-MSG-2 · every client-facing reader of inquiry_messages excludes staff
 * internal notes, and the POS engine writes every staff message to the
 * client thread.
 *
 * Internal notes sit on the client thread ("private") beside the replies so
 * staff see one conversation. That makes the reader-side exclusion the only
 * thing between a note and a client, so this test greps each reader for it.
 * A new client reader must be added to READERS below.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

const NEQ_INTERNAL = /\.neq\(\s*"message_kind",\s*(?:"internal_note"|INTERNAL_NOTE_KIND)\s*\)/;

test("workspace client reader: the client wrapper reads private only and drops internal notes", () => {
  const bridge = src("app/(workspace)/[tenantSlug]/_data-bridge/inquiry-thread-messages.ts");
  const wrapper = bridge.slice(bridge.indexOf("export async function loadClientInquiryMessages"));
  const wrapperBody = wrapper.slice(0, wrapper.indexOf("\n}\n"));
  assert.match(wrapperBody, /CLIENT_THREAD/, "client wrapper must read the client thread");
  assert.match(wrapperBody, /audience:\s*"client"/, "client wrapper must ask for the client audience");
  assert.match(bridge, NEQ_INTERNAL, "loader must exclude internal_note for the client audience");
  assert.match(
    src("app/(workspace)/[tenantSlug]/_data-bridge/inquiries-messages.ts"),
    /loadClientInquiryMessages/,
    "barrel must export the client wrapper",
  );
});

test("client Messages page and /api/client/messages use the client reader, not the staff one", () => {
  for (const rel of [
    "app/(workspace)/[tenantSlug]/client/messages/page.tsx",
    "app/api/client/messages/route.ts",
  ]) {
    const text = src(rel);
    assert.match(text, /loadClientInquiryMessages\(/, `${rel} must call loadClientInquiryMessages`);
    assert.doesNotMatch(text, /\bloadInquiryMessages\(/, `${rel} must not call the staff reader`);
  }
});

test("guest dock reader (also /c/[inquiryId]) reads private and excludes internal notes", () => {
  const guest = src("app/t/[profileCode]/_actions/guest-chat-actions.ts");
  const fn = guest.slice(guest.indexOf("readGuestVisibleMessages"));
  const query = fn.slice(fn.indexOf('.from("inquiry_messages")'), fn.indexOf(".order("));
  assert.match(query, /\.eq\(\s*"thread_type",\s*"private"\s*\)/);
  assert.match(query, NEQ_INTERNAL);
  // /c/[inquiryId] renders through the same reader.
  assert.match(src("app/c/[inquiryId]/page.tsx"), /getGuestThreadMessages/);
});

test("POS token thread (/c/t/[token]) renders customerVisibleMessages, which drops internal and group rows", () => {
  assert.match(src("app/(public)/c/t/[token]/page.tsx"), /customerVisibleMessages\(/);
  const thread = src("lib/messaging/thread.ts");
  const fn = thread.slice(thread.indexOf("export function customerVisibleMessages"));
  assert.match(fn, /!message\.internal/);
  assert.match(fn, /message\.thread === CLIENT_THREAD/);
  assert.match(thread, /internal: row\.message_kind === INTERNAL_NOTE_KIND/);
});

test("talent inbox reader excludes internal notes (a coordinator on private is not staff)", () => {
  const talent = src("app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions.ts");
  const idx = talent.indexOf('.eq("thread_type", threadType)');
  assert.ok(idx > 0);
  assert.match(talent.slice(idx, idx + 600), NEQ_INTERNAL);
});

test("POS engine: replies and internal notes both land on the client thread via the rule", () => {
  const engine = src("lib/server-actions/messaging-engine.ts");
  // S4 moved the insert into lib/messaging/insert-message.ts; the rule lives there.
  const insert = src("lib/messaging/insert-message.ts");
  assert.match(insert, /thread_type:\s*threadTypeForStaffMessage\(input\.kind\)/);
  for (const [name, text] of [["engine", engine], ["insert-message", insert]] as const) {
    assert.doesNotMatch(text, /thread_type:\s*"group"/, `${name} must never write the talent thread`);
    assert.doesNotMatch(text, /\?\s*"private"\s*:\s*"group"/, `${name}: no kind-keyed thread switch`);
  }
  const reply = engine.slice(engine.indexOf("export async function messagingReply"), engine.indexOf("export async function messagingInternalNote"));
  assert.match(reply, /kind:\s*"text"/);
  const note = engine.slice(engine.indexOf("export async function messagingInternalNote"));
  assert.match(note.slice(0, note.indexOf("\n}\n")), /kind:\s*"internal_note"/);
});

test("DB trigger keys conversation state on message_kind, so a note never flips it", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231222000_pos_messaging_state.sql"),
    "utf8",
  );
  const fn = sql.slice(sql.indexOf("messaging_touch_inquiry_from_message"));
  assert.match(fn, /IF NEW\.message_kind = 'internal_note' THEN\s+RETURN NEW;/);
});

/**
 * S5 (D-MSG-30): a line's author, confirmation, price snapshot, discount and
 * tax are staff-side facts. The client sees a label, a quantity and a line
 * total. Every client-facing line reader selects an explicit column list;
 * this holds those lists closed against the S5 columns and the older
 * staff-only money columns.
 */
const STAFF_ONLY_LINE_COLUMNS = [
  "talent_cost",
  "talent_cost_cents",
  "coordinator_fee",
  "discount_cents",
  "discount_label",
  "tax_cents",
  "tax_label",
  "proposed_by",
  "confirmed_by",
  "price_snapshot_cents",
  "catalog_price_cents_at_add",
];

function selectArg(text: string, from: string): string {
  const at = text.indexOf(from);
  assert.ok(at >= 0, `${from} not found`);
  const sel = text.indexOf(".select(", at);
  const close = text.indexOf(")", sel);
  return text.slice(sel, close + 1);
}

test("client offer payload: the offer line select carries no staff-only column (S5)", () => {
  const details = src("app/(workspace)/[tenantSlug]/_data-bridge/client-inquiry-details.ts");
  const offerSelect = selectArg(details, 'inq.current_offer_id\n        ? readClient\n            .from("inquiry_offers")');
  assert.match(offerSelect, /inquiry_offer_line_items \(/, "offer select must embed the line items");
  for (const column of STAFF_ONLY_LINE_COLUMNS) {
    assert.doesNotMatch(offerSelect, new RegExp(`\\b${column}\\b`), `client offer select must not read ${column}`);
  }
  // ...and the mapped payload only carries the client-safe fields.
  const mapped = details.slice(details.indexOf("lines: (offerRow.inquiry_offer_line_items ?? [])"), details.indexOf("service_name:", details.indexOf("lines: (offerRow.inquiry_offer_line_items ?? [])")));
  for (const column of STAFF_ONLY_LINE_COLUMNS) {
    assert.doesNotMatch(mapped, new RegExp(`\\b${column}\\b`), `client offer payload must not carry ${column}`);
  }
});

test("pay page and the sent-basket snapshot read label, units and unit price only (S5)", () => {
  const pay = src("app/(public)/pay/[code]/page.tsx");
  assert.match(selectArg(pay, '.from("order_lines")'), /\.select\("label, units, unit_cents"\)/);
  const engine = src("lib/server-actions/messaging-engine.ts");
  const request = engine.slice(engine.indexOf("export async function messagingRequestPayment"));
  assert.match(selectArg(request, 'scoped(g.admin, "order_lines", g.tenantId)'), /\.select\("id, label, units, unit_cents"\)/);
});
