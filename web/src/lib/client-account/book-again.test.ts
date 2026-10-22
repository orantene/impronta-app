import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BookPageClient } from "@/app/(public)/book/BookPageClient";
import { bookAgainHref, canBookAgain, hostHasPublicBooking, pinnedServiceId } from "./book-again";

// Catches: "Book again" shown on cancelled / upcoming visits, or with no service to preselect.
test("TUL-65: Book again only for a completed visit that knows its service", () => {
  assert.equal(canBookAgain("completed", "off-1"), true);
  assert.equal(canBookAgain("COMPLETED", "off-1"), true);
  assert.equal(canBookAgain("completed", null), false);
  assert.equal(canBookAgain("completed", "  "), false);
  for (const s of ["cancelled", "declined", "expired", "confirmed", "pending", "", null]) {
    assert.equal(canBookAgain(s, "off-1"), false, String(s));
  }
});

test("TUL-65: the link is a same-host /book URL with the service encoded", () => {
  assert.equal(bookAgainHref("off-1"), "/book?service=off-1");
  assert.equal(bookAgainHref("a b&c"), "/book?service=a%20b%26c");
});

// Catches: a forged ?service= selecting something the visitor could not pick by hand.
test("TUL-65: pinnedServiceId accepts only a service in the list", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(pinnedServiceId(list, "c"), "c");
  assert.equal(pinnedServiceId(list, " c "), "c");
  assert.equal(pinnedServiceId(list, "zzz"), "");
  assert.equal(pinnedServiceId(list, undefined), "");
  assert.equal(pinnedServiceId(list, ["b", "c"]), "");
  assert.equal(pinnedServiceId([], "a"), "");
});

// Catches: Book again dead-ending on app/hub hosts, which serve no public booking page of a business.
test("TUL-65: Book again only where /book serves this business (talent site, agency host)", () => {
  assert.equal(hostHasPublicBooking("talent_site"), true);
  assert.equal(hostHasPublicBooking("agency"), true);
  assert.equal(hostHasPublicBooking("app"), false);
  assert.equal(hostHasPublicBooking("hub"), false);
  assert.equal(hostHasPublicBooking("marketing"), false);
  assert.equal(hostHasPublicBooking(null), false);
});

function off(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, title: `Service ${id}`, talentProfileId: "t1", visibility: "public", reserveMode: "free", allowPayInPerson: true,
    durationMinutes: 30, amountCents: 5000, currency: "USD", bookingMode: "request", ...extra,
  } as never;
}
function selectedOption(html: string) {
  return /<option value="([^"]+)" selected/.exec(html)?.[1] ?? null;
}

// Catches: a requested service losing the default to another one (#4045 picker prefers probed services).
test("TUL-65: the requested service stays selected, even unprobed behind a probed one", () => {
  const offerings = [off("a"), off("b", { hasOpenTimes: true }), off("c")];
  const html = (id?: string) =>
    renderToStaticMarkup(createElement(BookPageClient, { tenantSlug: "t", agencyName: "T", offerings, locale: "en", initialServiceId: id }));
  assert.equal(selectedOption(html("c")), "c");
  assert.equal(selectedOption(html("a")), "a");
  assert.equal(selectedOption(html("nope")), selectedOption(html()));
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-65: visit detail offers Book again, /book honours ?service=, copy exists in ES and EN", () => {
  const area = read("src/components/client-account/ClientAccountArea.tsx");
  assert.match(area, /canBookAgain\(v\.status, v\.offeringId\)/);
  assert.match(area, /bookAgainHref\(v\.offeringId\)/);
  assert.match(area, /a\("bookAgain"\)/);
  const page = read("src/app/(public)/book/page.tsx");
  assert.match(page, /initialServiceId=\{pinnedServiceId\(offerings, service\)\}/);
  const tenantArea = read("src/lib/client-account/render-tenant-area.tsx");
  assert.match(tenantArea, /bookHere=\{hostHasPublicBooking\(hostContext\)\}/);
  assert.match(read("src/lib/client-account/render-area.tsx"), /bookHere\b/);
  assert.match(area, /props\.bookHere && canBookAgain/);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(read(`messages/${l}.json`));
    assert.ok(m.public.clientAccountArea.bookAgain, l);
    assert.doesNotMatch(m.public.clientAccountArea.bookAgain, /—/);
  }
});

// Catches: the original visit's service dropped (QA-named on a test account, request-only, roster
// not released) so Book again opened the generic empty sheet instead of the service.
test("TUL-65: a pinned service that cannot be booked online is preselected with the contact path", () => {
  const offerings = [off("ok", { hasOpenTimes: true }), off("pinned", { bookingMode: "inquire", hasOpenTimes: false })];
  const render = (locale: string, id?: string, list = offerings) =>
    renderToStaticMarkup(createElement(BookPageClient, { tenantSlug: "t", agencyName: "T", offerings: list, locale, initialServiceId: id, contactHref: "/contact" }));
  const en = render("en", "pinned");
  assert.equal(selectedOption(en), "pinned");
  assert.match(en, /data-book-inquire-only="pinned"/);
  assert.match(en, /not open for online booking/);
  assert.match(en, /href="\/contact"/);
  assert.match(render("es", "pinned"), /aún no está abierto para reservar en línea/);
  // Alone in the list: no generic empty state.
  const alone = render("en", "pinned", [offerings[1]]);
  assert.doesNotMatch(alone, /data-book-empty/);
  assert.match(alone, /data-book-inquire-only="pinned"/);
  // Never the default when something bookable exists.
  assert.equal(selectedOption(render("en")), "ok");
});

test("TUL-65: loader keeps the pinned service past the QA strip and the mode filter", () => {
  const loader = read("src/lib/site-admin/server/load-book-page-offerings.ts");
  assert.match(loader, /r\.id === pinnedId \|\| !hideTestServiceOnPublicSite/);
  assert.match(loader, /mode !== "inquire" \|\| isPinned/);
  assert.match(loader, /priorityId: pinnedId/);
  assert.match(read("src/app/(public)/book/page.tsx"), /pinnedOfferingId: typeof service === "string"/);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(read(`messages/${l}.json`));
    assert.ok(m.public.bookPage.inquireOnly, l);
    assert.doesNotMatch(m.public.bookPage.inquireOnly, /—/);
  }
});
