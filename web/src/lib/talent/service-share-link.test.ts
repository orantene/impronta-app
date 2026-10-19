import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { BookEntry } from "@/lib/talent-site/book-entry";
import { hubBookHashIntent } from "@/lib/talent-site/hub-book-hash";
import { resolveServiceBySlug } from "@/lib/talent-site/service-page";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

import { hubServiceHash, offeringId8, parseHubServiceHash, serviceShareUrl } from "./service-share-link";

const ID = "3f2a9c1b-0000-4000-8000-000000000001";
const PROFILE = { id: "directory", href: "/t/TAL-00031" };
const WEBSITE = { id: "website", href: "https://ana.tulala.digital/" };

test("TUL-1270 #13: a website link is the id-based service page and survives a rename", () => {
  const before = serviceShareUrl({
    offering: { id: ID, title: "Uñas gel", kind: "service", visibility: "public" },
    destinations: [PROFILE, WEBSITE],
    origin: "https://app.tulala.digital",
  });
  assert.equal(before?.via, "website");
  assert.equal(before?.url, "https://ana.tulala.digital/servicio-unas-gel-3f2a9c1b");
  // The owner renames the service: the OLD link still resolves to the same row.
  const renamed = [{ id: ID, title: "Manicura gel premium", kind: "service" as const, visibility: "public" as const, description: null, priceDisplay: "exact", amountCents: 1, currency: "MXN", durationMinutes: 60 }];
  const oldSlug = before!.url.split("/").pop()!;
  assert.equal(resolveServiceBySlug(renamed, oldSlug)?.id, ID);
});

test("TUL-1270 #13: without a website the link is the profile plus a stable #book-<id8>", () => {
  const a = serviceShareUrl({
    offering: { id: ID, title: "Uñas gel", kind: "service" },
    destinations: [PROFILE],
    origin: "https://app.tulala.digital/",
  });
  const b = serviceShareUrl({
    offering: { id: ID, title: "Otro nombre", kind: "service" },
    destinations: [PROFILE],
    origin: "https://app.tulala.digital/",
  });
  assert.equal(a?.via, "profile");
  assert.equal(a?.url, "https://app.tulala.digital/t/TAL-00031#book-3f2a9c1b");
  assert.equal(a?.url, b?.url, "a rename never changes the link");
  assert.doesNotMatch(a!.url, /service=/, "no expiring signed token");
});

test("TUL-1270 #13: a product (no service page) shares the profile link even with a website", () => {
  const r = serviceShareUrl({
    offering: { id: ID, title: "Gift card", kind: "product" },
    destinations: [PROFILE, WEBSITE],
    origin: "https://app.tulala.digital",
  });
  assert.equal(r?.via, "profile");
});

test("TUL-1270 #13: no destinations, no link", () => {
  assert.equal(serviceShareUrl({ offering: { id: ID, title: "x", kind: "service" }, destinations: [], origin: "https://x" }), null);
});

test("id8 + hub hash helpers", () => {
  assert.equal(offeringId8(ID), "3f2a9c1b");
  assert.equal(hubServiceHash(ID), "#book-3f2a9c1b");
  assert.equal(parseHubServiceHash("/t/TAL-1#book-3f2a9c1b"), "3f2a9c1b");
  assert.equal(parseHubServiceHash("#book"), null);
  assert.equal(parseHubServiceHash("#book-zz"), null);
});

const detail = (offeringId: string) => ({ offeringId }) as OfferingRequestDetail;
const SHEET: BookEntry = {
  kind: "sheet",
  offeringId: "preferred",
  eventName: "tulala:offering-request",
  detail: detail("preferred"),
  targets: { "3f2a9c1b": { eventName: "tulala:offering-instant", detail: detail(ID) } },
};

test("TUL-1270 #13: the hub opens THAT service's sheet from #book-<id8>", () => {
  assert.deepEqual(hubBookHashIntent("#book-3f2a9c1b", SHEET), {
    channel: "sheet",
    eventName: "tulala:offering-instant",
    detail: detail(ID),
  });
  assert.equal(hubBookHashIntent("https://x/t/TAL-1#book-3f2a9c1b", SHEET)?.channel, "sheet");
});

test("TUL-1270 #13: an unknown or no-longer-bookable id8 falls back to plain #book", () => {
  assert.deepEqual(hubBookHashIntent("#book-deadbeef", SHEET), {
    channel: "sheet",
    eventName: "tulala:offering-request",
    detail: detail("preferred"),
  });
  assert.deepEqual(hubBookHashIntent("#book-deadbeef", { kind: "inquire" }), { channel: "chat" });
});

test("TUL-1270 #13: the hub book entry carries every bookable service by id8", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/hub-profile-book-entry.ts"), "utf8");
  assert.match(src, /targets/);
  assert.match(src, /offeringId8\(/);
});

test("TUL-1270 #13: Share in the Services list opens the share sheet (link + QR), not the profile root", () => {
  const home = readFileSync(join(process.cwd(), "src/components/talent/services/ServicesHome.tsx"), "utf8");
  assert.match(home, /onShare=\{\(\) => setShareItem\(item\)\}/);
  assert.match(home, /<ServiceShareSheet/);
  assert.doesNotMatch(home, /writeText\(window\.location\.origin \+ dest\)/);
  const sheet = readFileSync(join(process.cwd(), "src/components/talent/services/ServiceShareSheet.tsx"), "utf8");
  assert.match(sheet, /encodeQr\(/);
  assert.match(sheet, /serviceShareUrl\(/);
  assert.match(sheet, /clipboard\.writeText/);
});
