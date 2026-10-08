import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { confirmBookingCopy } from "./talent-confirm-booking-copy";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const ACTION = "lib/server-actions/messaging-talent-confirm-booking.ts";

/** Body text of each exported async function, from its opening brace to the next export. */
function exportedActions(src: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /^export\s+async\s+function\s+(\w+)/gm;
  const starts: Array<{ name: string; at: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
    const chunk = src.slice(s.at, end);
    // The body opens at the first line that ends the signature: `}> {` or `) {`.
    const open = /\)\s*(?::[^{]*)?\{\n|>\s*\{\n/.exec(chunk);
    assert.ok(open, `could not find the body of ${s.name}`);
    out.push({ name: s.name, body: chunk.slice(open.index + open[0].length) });
  });
  return out;
}

test("every action's FIRST statement is the impersonation guard", () => {
  const actions = exportedActions(read(ACTION));
  assert.deepEqual(actions.map((a) => a.name).sort(), ["messagingTalentConfirmBooking", "messagingTalentConfirmBookingState"]);
  for (const a of actions) {
    const firstStatement = a.body.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)[0] ?? "";
    assert.match(firstStatement, /^if \(!\(await assertNotImpersonating\(\)\)\.ok\) return /, `${a.name} must start with the guard, got: ${firstStatement}`);
  }
});

test("the action file is a server file with only async exports, and takes the inquiry id alone", () => {
  const src = read(ACTION);
  assert.match(src, /^"use server";/);
  assert.equal((src.match(/^export /gm) ?? []).length, 2, "only the two actions are exported");
  // The tenant is never an input: both actions accept `{ inquiryId }` and nothing else.
  assert.doesNotMatch(src, /tenantId\s*:\s*z\./);
  assert.doesNotMatch(src, /input\.tenant|input\.talent/);
  assert.equal((src.match(/input: \{\n\s+inquiryId: string;\n\}/g) ?? []).length, 2);
});

test("ownership is resolved on the server: signed-in talent, a seat on THIS inquiry, her own sale", () => {
  const src = read(ACTION);
  assert.match(src, /loadTalentActor\(\)/);
  assert.match(src, /loadOwnedTalentInquiry\(actor\.admin, actor\.talentProfileId, inquiryId\)/);
  assert.match(src, /talentMaySell\(\{ isSeller: owned\.isSeller, participantStatus: owned\.participantStatus \}\)/);
  // The tenant handed to the store is the one the inquiry row names.
  assert.match(src, /tenantId: owned\.tenantId/);
});

test("NO new money logic: the write is the engine's own accept-to-payment function", () => {
  const files = [
    "lib/messaging/talent-confirm-booking.ts",
    "lib/messaging/talent-confirm-booking-store.ts",
    ACTION,
    "components/messages-v5/talent/TalentConfirmBookingBar.tsx",
  ];
  for (const f of files) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /stripe/i, `${f} must not touch Stripe`);
    assert.doesNotMatch(code, /createPaymentLink|createBookingTransaction|requestPayment|computeFee|platform_fee|commission/i, `${f} must not call money writers of its own`);
    assert.doesNotMatch(code, /\.(insert|update|upsert|delete)\(/, `${f} must not write rows itself`);
  }
  const store = read("lib/messaging/talent-confirm-booking-store.ts");
  assert.match(store, /ensureAcceptedOfferPayment\(c\.admin,/);
  assert.match(store, /previewAcceptedOfferCollection\(c\.admin,/);
});

test("the store scopes every read to the inquiry's tenant and checks every error", () => {
  const store = read("lib/messaging/talent-confirm-booking-store.ts");
  assert.doesNotMatch(store, /c\.admin\.from\(/, "all reads go through tenantScopedQuery");
  const reads = (store.match(/await scoped\(/g) ?? []).length;
  const errorChecks = (store.match(/if \(\w+Res\.error\)/g) ?? []).length;
  assert.equal(reads, 4);
  assert.equal(errorChecks, 4);
});

test("parity: acceptOfferFromRow maps the offer exactly like the client's own payAfterAccept", () => {
  const client = read("lib/server-actions/messaging-client.ts");
  const core = read("lib/messaging/talent-confirm-booking.ts");
  const store = read("lib/messaging/talent-confirm-booking-store.ts");
  // payAfterAccept: total = round(price * 100), currency upper-cased, deposit pct/cents null-or-Number.
  assert.match(client, /totalCents: Math\.round\(Number\(offer\.total_client_price \?\? 0\) \* 100\)/);
  assert.match(store, /Math\.round\(total \* 100\)/);
  assert.match(client, /currency: \(offer\.currency_code \?\? "USD"\)\.toUpperCase\(\)/);
  assert.match(core, /\.trim\(\)\.toUpperCase\(\)/);
  assert.match(client, /offerCreatedBy: offer\.created_by_user_id \?\? null/);
  assert.match(client, /ensureAcceptedOfferPayment\(l\.admin,/);
  assert.match(core, /depositPct: row\.depositPct,\n\s+depositCents: row\.depositCents,/);
});

test("the control is mounted next to the invitation bar on the talent Messages page", () => {
  const page = read("components/admin/shell/internal/talent/pages/messages/MessagesPage.tsx");
  assert.match(page, /<TalentConfirmBookingBar inquiryId=\{activeId\} locale=\{locale\} onToast=\{toast\} \/>/);
});

test("copy: es and en have the same strings filled, the spec labels, and no em dashes", () => {
  const en = confirmBookingCopy("en");
  const es = confirmBookingCopy("es-MX");
  assert.equal(en.button, "Confirm booking and request payment");
  assert.equal(es.button, "Confirmar reserva y pedir pago");
  assert.equal(es.done, "Reserva confirmada · pago solicitado");
  assert.match(es.dialogBody, /Se creará la reserva y se enviará la solicitud de pago al cliente por \{amount\}/);
  assert.deepEqual(Object.keys(en.errors).sort(), Object.keys(es.errors).sort());
  assert.equal(confirmBookingCopy("fr").button, en.button);
  for (const copy of [en, es]) {
    const flat = JSON.stringify(copy);
    assert.doesNotMatch(flat, /—/, "no em dashes in user-facing copy");
    for (const [k, v] of Object.entries(copy)) {
      if (typeof v === "string") assert.ok(v.trim().length > 0, `${k} is empty`);
    }
    for (const [k, v] of Object.entries(copy.errors)) assert.ok(v.trim().length > 0, `errors.${k} is empty`);
  }
});
