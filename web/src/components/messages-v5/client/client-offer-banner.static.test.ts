/**
 * TUL-954: the "Ver oferta" banner lives on the signed /c/t page and the offer email links to it.
 * The hub talent route app/t/[profileCode] is locked: the PR diff must show no file in it (review check).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { CLIENT_OFFER_ACTION_SELECTOR, jumpToClientOffer } from "./jump-to-offer";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("jumpToClientOffer scrolls and focuses the NEWEST offer action, and reports false when there is none", () => {
  const calls: string[] = [];
  const el = (name: string) => ({ scrollIntoView: (o: { behavior: string; block: string }) => calls.push(`${name}:${o.behavior}:${o.block}`), focus: () => calls.push(`${name}:focus`) });
  const root = (list: ReturnType<typeof el>[]) => ({ querySelectorAll: (sel: string) => (sel === CLIENT_OFFER_ACTION_SELECTOR ? list : []) });
  assert.equal(jumpToClientOffer(root([]), false), false);
  assert.equal(jumpToClientOffer(null, false), false);
  assert.equal(jumpToClientOffer(root([el("old"), el("new")]), true), true);
  assert.deepEqual(calls, ["new:auto:center", "new:focus"]);
  assert.match(CLIENT_OFFER_ACTION_SELECTOR, /accept_offer/);
  assert.match(CLIENT_OFFER_ACTION_SELECTOR, /data-client-offer-sign-in/);
});

test("the thread renders the banner only for a live ('sent') offer and honours ?focus=offer from the page", () => {
  const thread = read("src/components/messages-v5/client/ClientThread.tsx");
  assert.match(thread, /offerCardState\(o, now\) === "sent"/);
  assert.match(thread, /<ClientOfferBanner pending=\{pendingOffer\} focusOnArrival=\{props\.focusOffer === true\}/);
  const page = read("src/app/(public)/c/t/[token]/page.tsx");
  assert.match(page, /focusOffer=\{\(query\.focus \|\| ""\)\.toLowerCase\(\) === "offer"\}/);
});

test("banner copy exists in en, es and fr", () => {
  for (const l of ["en", "es", "fr"]) {
    const banner = JSON.parse(read(`messages/${l}.json`)).dashboard.messagesV5.client.link.offerBanner;
    assert.ok(banner.hint && banner.cta, l);
    assert.doesNotMatch(`${banner.hint}${banner.cta}`, /—/);
  }
});

test("the offer-ready email uses the signed-link helper", () => {
  const src = read("src/lib/notifications/catalog-entries-inquiry.ts");
  assert.match(src, /offerUrl: clientOfferUrl\(/);
});
