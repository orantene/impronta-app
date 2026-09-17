import assert from "node:assert/strict";
import { test } from "node:test";

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PDFDocument } from "pdf-lib";

/**
 * `deliverTicketsForOrder` / `deliverTicketForAdmission` against a scripted
 * PostgREST fake. Each `from(table)` returns a chain that records the
 * filters and the update payload, then resolves from `rows[table]`.
 *
 * The e-mail sender is the real `sendEmailResult`, which with no
 * RESEND_API_KEY returns `skipped` and writes the DEV OUTBOX (NODE_ENV is
 * forced to "development" here and EMAIL_DEV_OUTBOX_DIR points at a temp
 * dir). That outbox is how these tests observe the send: the .html, the
 * .json envelope and the attached .pdf land as files, exactly what a guest
 * would receive. `skipped` counts as delivered outside production.
 */
process.env.GUEST_COOKIE_SECRET ??= "test-secret-test-secret-test-secret-1234";
// `NODE_ENV` is typed read-only; the outbox is gated on it being "development".
(process.env as Record<string, string | undefined>).NODE_ENV = "development";
const OUTBOX = mkdtempSync(join(tmpdir(), "ticket-outbox-"));
process.env.EMAIL_DEV_OUTBOX_DIR = OUTBOX;

import { deliverTicketsForOrder, deliverTicketForAdmission, pickTicketLocale } from "./ticket-delivery";

/**
 * The NEWEST outbox message: its .html, its .json envelope and the .pdf
 * written beside it (all three share the `<stamp>_<slug>` base). Read
 * right after a send so the message observed is the one just sent.
 */
function outboxDelta(): { html: string; envelope: Record<string, unknown>; pdf: Uint8Array | null } {
  const names = readdirSync(OUTBOX).sort();
  const htmlName = names.filter((n) => n.endsWith(".html")).at(-1);
  assert.ok(htmlName, `an .html was written (${names.join(", ")})`);
  const base = htmlName.slice(0, -".html".length);
  const pdfName = names.find((n) => n.startsWith(`${base}_`) && n.endsWith(".pdf"));
  return {
    html: readFileSync(join(OUTBOX, htmlName), "utf8"),
    envelope: JSON.parse(readFileSync(join(OUTBOX, `${base}.json`), "utf8")) as Record<string, unknown>,
    pdf: pdfName ? new Uint8Array(readFileSync(join(OUTBOX, pdfName))) : null,
  };
}
process.on("exit", () => rmSync(OUTBOX, { recursive: true, force: true }));

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> };

function fakeAdmin(rows: Record<string, Row[]>, calls: Call[]) {
  return {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      let result: Row[] = rows[table] ?? [];
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      const filter = (op: string) => (col: string, val: unknown) => {
        call.filters.push([col, op, val]);
        if (op === "eq") result = result.filter((r) => r[col] === val);
        if (op === "in") result = result.filter((r) => (val as unknown[]).includes(r[col]));
        if (op === "is" && val === null) result = result.filter((r) => r[col] == null);
        return chain;
      };
      Object.assign(chain, {
        select: () => chain,
        update: (payload: unknown) => { call.op = "update"; call.payload = payload; return chain; },
        eq: filter("eq"), in: filter("in"), is: filter("is"),
        order: self, limit: self,
        maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: result, error: null }).then(res),
      });
      return chain;
    },
  };
}

const T = "11111111-1111-4111-8111-111111111111";
const ADM = "22222222-2222-4222-8222-222222222222";
const ADM2 = "33333333-3333-4333-8333-333333333333";
const LINE = "line-1"; const ORDER = "order-1"; const SESSION = "sess-1"; const EVENT = "ev-1";

function world(over: Partial<Record<string, Row[]>> = {}) {
  return {
    order_lines: [{ id: LINE, order_id: ORDER, label: "Entrada general", tenant_id: T }],
    admissions: [
      { id: ADM, tenant_id: T, token_version: 1, holder_name: "Ana", holder_email: "ana@example.com", session_id: SESSION, order_line_id: LINE, customer_id: null, party_size: 1, status: "valid", delivery: null },
    ],
    orders: [{ id: ORDER, tenant_id: T, customer_id: null, receipt_code: "R1" }],
    sessions: [{ id: SESSION, tenant_id: T, starts_at: "2026-10-03T23:00:00Z", event_id: EVENT }],
    events: [{ id: EVENT, tenant_id: T, title: "LUMINA", venue_id: null }],
    agencies: [{ id: T, timezone: "America/Cancun", default_locale: "es" }],
    booking_transactions: [],
    customers: [],
    ...over,
  };
}

test("delivers once per admission: the second pass claims nothing and sends nothing", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world(), calls);
  const first = await deliverTicketsForOrder(admin, { tenantId: T, orderId: ORDER });
  assert.deepEqual(first, { ok: true, sent: 1, skipped: 0 });
  const claim = calls.find((c) => c.table === "admissions" && c.op === "update");
  assert.ok(claim, "the claim UPDATE happened");
  assert.ok(claim.filters.some(([c, op, v]) => c === "delivery" && op === "is" && v === null), "claimed only undelivered rows");
  assert.ok(claim.filters.some(([c, , v]) => c === "tenant_id" && v === T), "tenant-scoped");
  const stamp = calls.filter((c) => c.table === "admissions" && c.op === "update").at(-1)!;
  assert.match(JSON.stringify(stamp.payload), /"sent_at"/);

  // Second pass: the row now carries a delivery record.
  const calls2: Call[] = [];
  const admin2 = fakeAdmin(world({ admissions: [{ ...world().admissions[0], delivery: { method: "email", sent_at: "x" } }] }), calls2);
  const second = await deliverTicketsForOrder(admin2, { tenantId: T, orderId: ORDER });
  assert.deepEqual(second, { ok: true, sent: 0, skipped: 1 });
});

test("force (resend) sends despite an existing delivery record", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world({ admissions: [{ ...world().admissions[0], delivery: { method: "email", sent_at: "x" } }] }), calls);
  const res = await deliverTicketForAdmission(admin, { tenantId: T, admissionId: ADM, force: true });
  assert.deepEqual(res, { ok: true, sent: 1, skipped: 0 });
  const claim = calls.find((c) => c.table === "admissions" && c.op === "update")!;
  assert.ok(!claim.filters.some(([c]) => c === "delivery"), "no null filter on a forced resend");
  assert.match(JSON.stringify(calls.filter((c) => c.table === "admissions" && c.op === "update").at(-1)!.payload), /"resent_at"/);
});

test("recipient falls back holder → customer → payer; none releases the claim", async () => {
  const noHolder = { ...world().admissions[0], holder_email: null };
  // customer
  let calls: Call[] = [];
  let res = await deliverTicketsForOrder(
    fakeAdmin(world({ admissions: [noHolder], orders: [{ id: ORDER, tenant_id: T, customer_id: "c1", receipt_code: "R1" }], customers: [{ id: "c1", tenant_id: T, email: "cust@example.com", locale: "en" }] }), calls),
    { tenantId: T, orderId: ORDER },
  );
  assert.equal(res.ok, true);
  // payer
  calls = [];
  res = await deliverTicketsForOrder(
    fakeAdmin(world({ admissions: [noHolder], booking_transactions: [{ source_tenant_id: T, order_id: ORDER, payer_email: "payer@example.com" }] }), calls),
    { tenantId: T, orderId: ORDER },
  );
  assert.equal(res.ok, true);
  // nobody
  calls = [];
  res = await deliverTicketsForOrder(fakeAdmin(world({ admissions: [noHolder] }), calls), { tenantId: T, orderId: ORDER });
  assert.deepEqual(res, { ok: false, reason: "channel_unavailable" });
  const updates = calls.filter((c) => c.table === "admissions" && c.op === "update");
  assert.deepEqual(updates.at(-1)!.payload, { delivery: null }, "the claim was released");
});

test("two admissions on one order go out in one mail, both stamped", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world({ admissions: [world().admissions[0], { ...world().admissions[0], id: ADM2, party_size: 10 }] }), calls);
  const res = await deliverTicketsForOrder(admin, { tenantId: T, orderId: ORDER });
  assert.deepEqual(res, { ok: true, sent: 2, skipped: 0 });
  const stamp = calls.filter((c) => c.table === "admissions" && c.op === "update").at(-1)!;
  assert.deepEqual(stamp.filters.find(([c]) => c === "id")?.[2], [ADM, ADM2]);
});

test("a cancelled admission is never delivered", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world({ admissions: [{ ...world().admissions[0], status: "cancelled" }] }), calls);
  const res = await deliverTicketForAdmission(admin, { tenantId: T, admissionId: ADM });
  // Nothing claimable → nothing sent. Reported as "skipped", not as an error:
  // the caller (a webhook retry, a desk tap) has nothing to do about it.
  assert.deepEqual(res, { ok: true, sent: 0, skipped: 1 });
  assert.ok(!calls.some((c) => c.table === "admissions" && c.op === "update" && /sent_at/.test(JSON.stringify(c.payload))));
});

test("the mail carries the PDF (one page per admission) and the body says it is attached", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(
    world({
      admissions: [world().admissions[0], { ...world().admissions[0], id: ADM2, party_size: 10, order_line_id: "line-2" }],
      order_lines: [
        { id: LINE, order_id: ORDER, label: "Entrada general", units: 1, unit_cents: 35000, total_cents: 35000, tenant_id: T },
        { id: "line-2", order_id: ORDER, label: "Mesa para 10", units: 1, unit_cents: 1500000, total_cents: 1500000, tenant_id: T },
      ],
      orders: [{ id: ORDER, tenant_id: T, customer_id: null, receipt_code: "R7K2Q9", currency: "MXN", subtotal_cents: 1535000, discount_cents: 0, tip_cents: 0, total_cents: 1535000 }],
      booking_transactions: [{ source_tenant_id: T, order_id: ORDER, provider: "manual", metadata: { paid_via: "cash" }, paid_at: "2026-09-17T02:00:00Z", created_at: "2026-09-17T02:00:00Z" }],
      events: [{ id: EVENT, tenant_id: T, title: "LUMINA", venue_id: "v1", refund_cutoff_hours: 48 }],
      venues: [{ id: "v1", name: "El Paisa", timezone: "America/Cancun", address_line1: "Av. Tulum 123", city: "Cancún", region: "Q.R.", postal_code: "77500" }],
      agency_business_identity: [{ tenant_id: T, default_locale: "es" }],
    }),
    calls,
  );
  const res = await deliverTicketsForOrder(admin, { tenantId: T, orderId: ORDER });
  assert.deepEqual(res, { ok: true, sent: 2, skipped: 0 });

  const out = outboxDelta();
  assert.ok(out.pdf, "a .pdf was written next to the .html");
  const attachments = out.envelope.attachments as Array<{ filename: string; contentType: string | null }>;
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]!.filename, "entrada-R7K2Q9.pdf", "ES filename from the receipt code");
  assert.equal(attachments[0]!.contentType, "application/pdf");
  const doc = await PDFDocument.load(out.pdf);
  assert.equal(doc.getPageCount(), 2, "one page per admission");
  assert.match(doc.getSubject() ?? "", /R7K2Q9/);

  assert.match(out.html, /<html lang="es">/);
  assert.match(out.html, /adjunto el PDF entrada-R7K2Q9\.pdf/, "the body names the attachment");
  assert.match(out.html, /sábado 3 de octubre, 18:00 h \(hora de Cancún\)/, "venue zone as a city, never EST");
  assert.doesNotMatch(out.html, /\bEST\b|GMT-/);
  assert.match(out.html, /Lugar: El Paisa/);
  const stamp = calls.filter((c) => c.table === "admissions" && c.op === "update").at(-1)!;
  assert.match(JSON.stringify(stamp.payload), /"attachment":"entrada-R7K2Q9\.pdf"/);
});

test("locale chain (D-163): guest → customer → workspace public default → brand → en; never the desk", async () => {
  // Pure chain.
  assert.equal(pickTicketLocale({ explicit: "es-MX", customer: "en", tenantDefault: "en", brand: "en" }), "es");
  assert.equal(pickTicketLocale({ explicit: null, customer: "es", tenantDefault: "en", brand: "en" }), "es");
  assert.equal(pickTicketLocale({ explicit: null, customer: null, tenantDefault: "es", brand: "en" }), "es");
  assert.equal(pickTicketLocale({ explicit: null, customer: null, tenantDefault: null, brand: "es" }), "es");
  assert.equal(pickTicketLocale({ explicit: null, customer: null, tenantDefault: null, brand: null }), "en");
  assert.equal(pickTicketLocale({ explicit: "", customer: "  ", tenantDefault: "fr", brand: null }), "en", "an unsupported locale reads English, not a blank");

  // Wired: a staff-triggered send passes no locale, the workspace's public
  // site is Spanish, the (English-speaking) desk never gets a vote. Before
  // this, `agencies.default_locale` decided the night label while the
  // brand decided the copy, and Impronta's mails went out in English.
  const spanishSite = world({ agency_business_identity: [{ tenant_id: T, default_locale: "es" }], agencies: [{ id: T, timezone: "America/Cancun" }] });
  let res = await deliverTicketForAdmission(fakeAdmin(spanishSite, []), { tenantId: T, admissionId: ADM, locale: null });
  assert.equal(res.ok, true);
  let out = outboxDelta();
  assert.match(out.html, /<html lang="es">/);
  assert.match(out.html, /hora de Cancún/);
  assert.equal((out.envelope.attachments as Array<{ filename: string }>)[0]!.filename, "entrada-R1.pdf");

  // The customer's own locale beats the site default.
  const englishCustomer = world({
    agency_business_identity: [{ tenant_id: T, default_locale: "es" }],
    admissions: [{ ...world().admissions[0], holder_email: null }],
    orders: [{ id: ORDER, tenant_id: T, customer_id: "c1", receipt_code: "R1" }],
    customers: [{ id: "c1", tenant_id: T, email: "cust@example.com", locale: "en-US" }],
  });
  res = await deliverTicketsForOrder(fakeAdmin(englishCustomer, []), { tenantId: T, orderId: ORDER });
  assert.equal(res.ok, true);
  out = outboxDelta();
  assert.match(out.html, /<html lang="en">/);
  assert.match(out.html, /Saturday, October 3, 6:00 PM \(Cancún time\)/);
  assert.equal((out.envelope.attachments as Array<{ filename: string }>)[0]!.filename, "ticket-R1.pdf");

  // An explicit GUEST locale (the page they bought on) beats both.
  res = await deliverTicketsForOrder(fakeAdmin(englishCustomer, []), { tenantId: T, orderId: ORDER, locale: "es" });
  assert.equal(res.ok, true);
  assert.match(outboxDelta().html, /<html lang="es">/);
});
