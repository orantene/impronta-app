import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isPathAllowedForHostKind } from "@/lib/saas/gate";
import { publicEntryRequestHref } from "./public-hub-request";
import { rosterRequestHref, WORKSPACE_REQUEST_PATH } from "./roster-request";

const web = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

test("TUL-1844: the request path resolves on a business host, /contact does not", () => {
  assert.equal(WORKSPACE_REQUEST_PATH, "/book/request");
  assert.equal(isPathAllowedForHostKind("agency", WORKSPACE_REQUEST_PATH), true);
  // /contact is an owner-made CMS page on an agency host: a workspace without one 404s.
  assert.equal(isPathAllowedForHostKind("agency", "/contact"), false);
  assert.ok(existsSync(join(web, "src/app/(public)/book/request/page.tsx")));
});

test("TUL-1844: the request page reuses the contact inquiry form and the ?message= prefill", () => {
  const src = read("src/app/(public)/book/request/page.tsx");
  assert.match(src, /ContactInquiryForm/);
  assert.match(src, /contactMessagePrefill\(await searchParams\)/);
  assert.match(src, /index: false/);
});

test("TUL-1844: hub entries, roster rows and the Services widget all point at the request path", () => {
  const entry = { name: "Sesion de fotos", who: ["Valeria Costa"] };
  assert.match(publicEntryRequestHref(WORKSPACE_REQUEST_PATH, entry, "es"), /^\/book\/request\?message=Quiero%20solicitar/);
  const item = { listingId: "l", offeringId: "o", title: "Sesion de fotos", talentProfileId: null, talentName: null, priceCents: null, currency: null, from: false, bookingType: "request" as const };
  assert.match(rosterRequestHref(`/w/x${WORKSPACE_REQUEST_PATH}`, item as never, "en"), /^\/w\/x\/book\/request\?message=/);

  const book = read("src/app/(public)/book/page.tsx");
  assert.doesNotMatch(book, /\/contact`/);
  assert.equal((book.match(/WORKSPACE_REQUEST_PATH/g) ?? []).length >= 4, true);
  const render = read("src/lib/site-admin/builder-node/render.tsx");
  const call = render.slice(render.indexOf("rosterGridEntries("), render.indexOf("rosterGridEntries(") + 260);
  assert.match(call, /WORKSPACE_REQUEST_PATH/);
  assert.doesNotMatch(call, /"\/contact"/);
});
