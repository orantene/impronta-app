import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// TUL-548 (Batch 2 retest): "bookings off" was worded three ways across a
// talent's pages and flows ("Send an inquiry instead", "You can still send an
// inquiry", impersonal Spanish next to first-person Spanish). One sentence per
// language now, matching the public pause banner.

const EN = "Not taking new bookings right now. You can still send an inquiry.";
const ES = "No estoy tomando nuevas reservas por ahora. Puedes consultarme.";

const read = (p: string) => readFileSync(p, "utf8");

test("every English bookings-off sentence is the banner sentence", () => {
  for (const p of ["src/lib/scheduling/instant-book-gates.ts", "src/lib/scheduling/instant-book-run.ts", "src/lib/talent-site/contact-channels.ts"]) {
    assert.ok(read(p).includes(EN), `${p} drifted from the banner sentence`);
  }
  assert.doesNotMatch(read("src/lib/scheduling/instant-book-gates.ts"), /Send an inquiry instead/);
  const en = JSON.parse(read("messages/en.json"));
  assert.equal(en.public.instantBook.refusal.notAccepting, EN);
});

test("Spanish uses one first-person sentence, in the catalog and in the chat action", () => {
  const es = JSON.parse(read("messages/es.json"));
  assert.equal(es.public.instantBook.refusal.notAccepting, ES);
  assert.equal(es.public.talentSite.contact.bookingsPaused, ES);
  assert.ok(read("src/app/t/[profileCode]/_actions/guest-chat-actions.ts").includes(ES));
});
