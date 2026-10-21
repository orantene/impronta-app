/** TUL-1612: the owner's Station rent card shows whether a member pays automatically, and why no link is issued. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { RENT_COPY, rentRefusalText } from "./rent-copy";

const card = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/settings/rent/RentCard.tsx"), "utf8");
const page = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/settings/rent/page.tsx"), "utf8");

test("the page reads the plan's autopay status and the card shows it for live states", () => {
  assert.match(page, /autopay_status/);
  assert.match(card, /data-testid="rent-autopay-state"/);
  for (const k of ["ownerAutopayOn", "ownerAutopayPending", "ownerAutopayPaused", "ownerAutopayPastDue"]) assert.match(card, new RegExp(`c\\.${k}`));
});

test("a link refused because the month is automatic says so, in EN and ES", () => {
  assert.equal(rentRefusalText("autopay_on", RENT_COPY.en), "This month is paid automatically. No payment link is needed.");
  assert.equal(rentRefusalText("autopay_on", RENT_COPY.es), "Este mes se paga automáticamente. No hace falta enlace de pago.");
});
