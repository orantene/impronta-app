import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { bookAgainHref, canBookAgain, serviceFirst } from "./book-again";

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

// Catches: a forged ?service= reordering or dropping offerings.
test("TUL-65: serviceFirst moves a known service to the front and ignores unknown ids", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(serviceFirst(list, "c").map((o) => o.id), ["c", "a", "b"]);
  assert.deepEqual(serviceFirst(list, "zzz").map((o) => o.id), ["a", "b", "c"]);
  assert.deepEqual(serviceFirst(list, undefined).map((o) => o.id), ["a", "b", "c"]);
  assert.deepEqual(serviceFirst(list, ["b", "c"]).map((o) => o.id), ["a", "b", "c"]);
  assert.equal(serviceFirst(list, "c").length, 3);
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-65: visit detail offers Book again, /book honours ?service=, copy exists in ES and EN", () => {
  const area = read("src/components/client-account/ClientAccountArea.tsx");
  assert.match(area, /canBookAgain\(v\.status, v\.offeringId\)/);
  assert.match(area, /bookAgainHref\(v\.offeringId\)/);
  assert.match(area, /a\("bookAgain"\)/);
  const page = read("src/app/(public)/book/page.tsx");
  assert.match(page, /serviceFirst\(loadedOfferings, service\)/);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(read(`messages/${l}.json`));
    assert.ok(m.public.clientAccountArea.bookAgain, l);
    assert.doesNotMatch(m.public.clientAccountArea.bookAgain, /—/);
  }
});
