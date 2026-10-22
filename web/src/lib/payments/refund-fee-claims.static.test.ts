/**
 * TUL-1595: no page or receipt says the Tulala service fee is never refunded. Approved O3: the fee IS refunded when the
 * business cancels. The customer-cancels rule (F5) and card processing fees (F6) stay unstated by this copy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const en = read("src/app/(marketing)/legal/refunds/page.tsx").replace(/\s+/g, " ");
const es = read("src/app/(marketing)/legal/refunds/refunds-es.tsx").replace(/\s+/g, " ");

test("the refunds page states the approved line in EN and ES", () => {
  assert.match(en, /When the business cancels, the Tulala service fee is refunded\./);
  assert.match(es, /Cuando el negocio cancela, se reembolsa el cargo por servicio de Tulala\./);
});

test("the absolute 'service fee is not refunded' claims are gone", () => {
  assert.doesNotMatch(en, /service fee paid by the client is not refunded/i);
  assert.doesNotMatch(es, /Tampoco se reembolsa la (tarifa|cargo)/i);
  assert.doesNotMatch(read("src/lib/payments/booking-confirmation-pdf.ts").replace(/\/\/.*$/gm, ""), /non-refundable/i);
});

test("nothing new is said about customer cancels or card processing fees", () => {
  assert.doesNotMatch(en, /If you cancel, the Tulala service fee/);
  assert.match(en, /Card processing fees are non-refundable\./, "the processing-fee sentence is left exactly as it was (F6, legal)");
});
