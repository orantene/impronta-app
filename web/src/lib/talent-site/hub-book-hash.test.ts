import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { BookEntry } from "./book-entry";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { hubBookHashIntent } from "./hub-book-hash";

const DETAIL = { offeringId: "a" } as OfferingRequestDetail;
const SHEET: BookEntry = {
  kind: "sheet",
  offeringId: "a",
  eventName: "tulala:offering-request",
  detail: DETAIL,
};

test("#book with a bookable entry opens the booking sheet channel", () => {
  assert.deepEqual(hubBookHashIntent("#book", SHEET), {
    channel: "sheet",
    eventName: "tulala:offering-request",
    detail: SHEET.detail,
  });
  assert.deepEqual(hubBookHashIntent("/t/TAL-00031#book", SHEET)?.channel, "sheet");
});

test("#book with no bookable services falls back to inquire (chat)", () => {
  assert.deepEqual(hubBookHashIntent("#book", { kind: "inquire" }), { channel: "chat" });
  assert.deepEqual(hubBookHashIntent("#book", null), { channel: "chat" });
});

test("non-book hashes ask for nothing", () => {
  assert.equal(hubBookHashIntent("#about", SHEET), null);
  assert.equal(hubBookHashIntent("#talent-ask", SHEET), null);
  assert.equal(hubBookHashIntent("", SHEET), null);
});

test("hub hash bridge cold-loads once and listens for hashchange + #book clicks", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/t/[profileCode]/hub-book-hash-bridge.tsx"),
    "utf8",
  );
  assert.match(src, /coldLoadHandledFor = window\.location\.href;\s*onHash\(\);/);
  assert.match(src, /addEventListener\("hashchange", onHash\)/);
  assert.match(src, /hubBookHashIntent/);
  assert.match(src, /requestTalentOpen/);
  assert.match(src, /id="book" data-hub-book-target=""/);
});
