import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { BookEntry } from "@/lib/talent-site/book-entry";
import { hubBookHashIntent } from "@/lib/talent-site/hub-book-hash";
import { resolveServiceBySlug } from "@/lib/talent-site/service-page";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

import { hubServiceHash, isServiceShareable, offeringId8, parseHubServiceHash, serviceShareUrl } from "./service-share-link";

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

test("TUL-1270 #13 review: the profile link uses the server's canonical /t host, never the dashboard origin", () => {
  const r = serviceShareUrl({
    offering: { id: ID, title: "Uñas gel", kind: "service" },
    destinations: [{ id: "directory", href: "/t/TAL-00031", shareUrl: "https://tulala.digital/t/TAL-00031" }],
    origin: "https://impronta.tulala.digital",
  });
  assert.equal(r?.url, "https://tulala.digital/t/TAL-00031#book-3f2a9c1b");
  const loader = readFileSync(join(process.cwd(), "src/lib/talent/services-settings-actions.ts"), "utf8");
  assert.match(loader, /shareUrl: await canonicalTalentUrl\(code\)/);
});

// ── TUL-1270 (staging): the copied link must open the page the host serves ──
import { serviceRouteVerdict, needsServiceLookup } from "@/lib/talent-site/route-verdict";
import { servicePageHrefs } from "@/lib/talent-site/service-page";

const LIVE = { id: ID, title: "QA Limpieza de casa", kind: "service" as const, visibility: "public" as const, description: null, priceDisplay: "exact", amountCents: 1, currency: "MXN", durationMinutes: 60 };
const HOST = { id: "website", href: "https://qa-fixture-g6-limpieza.staging.tulala.digital/" };

test("TUL-1270: the share URL is exactly the public page address and the route renders it", () => {
  const r = serviceShareUrl({
    offering: { ...LIVE, status: "published", moderationState: "approved" },
    destinations: [HOST],
    origin: "https://app.tulala.digital",
  });
  assert.equal(r?.url, "https://qa-fixture-g6-limpieza.staging.tulala.digital/servicio-qa-limpieza-de-casa-3f2a9c1b");
  const path = new URL(r!.url).pathname.slice(1);
  assert.equal(needsServiceLookup(path, undefined), true);
  assert.equal(serviceRouteVerdict(path, [LIVE], []), "render");
  // The home service cards link to the same address (one builder, cannot drift).
  assert.equal(servicePageHrefs([LIVE], "https://qa-fixture-g6-limpieza.staging.tulala.digital")[ID], r!.url);
});

test("TUL-1270: a draft, archived, unapproved or agency-only service is not shareable (no dead link)", () => {
  for (const o of [
    { status: "draft" },
    { status: "archived" },
    { status: "published", moderationState: "pending" },
    { status: "published", moderationState: "approved", visibility: "agency_only" },
  ]) {
    const offering = { ...LIVE, ...o };
    assert.equal(isServiceShareable(offering), false, JSON.stringify(o));
    assert.equal(serviceShareUrl({ offering, destinations: [HOST, PROFILE], origin: "https://x" }), null);
  }
  assert.equal(isServiceShareable({ ...LIVE, status: "published", moderationState: "approved" }), true);
});

test("TUL-1270: the share sheet explains a non-public service in en and es", () => {
  const sheet = readFileSync(join(process.cwd(), "src/components/talent/services/ServiceShareSheet.tsx"), "utf8");
  assert.match(sheet, /isServiceShareable\(item\)/);
  assert.match(sheet, /notPublic: "This service is not public yet/);
  assert.match(sheet, /notPublic: "Este servicio aún no es público/);
});

import { serviceHiddenAsTest } from "./service-share-link";
import { hideTestServiceOnPublicSite, QA_FIXTURE_TENANT_IDS } from "./qa-test-service";

test("TUL-1270: a QA-named service on a test/demo profile is flagged hidden, using the loader's own helper", () => {
  const T = "11111111-1111-4111-8111-111111111111";
  const qa = { title: "QA Limpieza de casa" };
  assert.equal(serviceHiddenAsTest(qa, T, true), true);
  assert.equal(serviceHiddenAsTest(qa, T, false), false, "a real talent keeps QA-named services");
  assert.equal(serviceHiddenAsTest({ title: "Limpieza de casa" }, T, true), false);
  assert.equal(serviceHiddenAsTest({ title: "x", titleI18n: { es: "Servicio E2E" } }, T, true), true);
  const house = [...QA_FIXTURE_TENANT_IDS][0];
  assert.equal(serviceHiddenAsTest({ ...qa, tenantId: house }, T, false), false, "talent-owned rows follow the profile flag");
  // Agrees with the public loader's decision for the same row.
  assert.equal(
    serviceHiddenAsTest(qa, T, true),
    hideTestServiceOnPublicSite({ ...qa, talent_profile_id: T }, { fixtureProfileIds: new Set([T]), fixtureTenantIds: QA_FIXTURE_TENANT_IDS }),
  );
});

test("TUL-1270: the sheet shows the rename message (en + es) and the server passes the profile flag", () => {
  const sheet = readFileSync(join(process.cwd(), "src/components/talent/services/ServiceShareSheet.tsx"), "utf8");
  assert.match(sheet, /hiddenTest: "This service is hidden on the public site because its name marks it as a test \(QA\/E2E\)\. Rename it to share it\."/);
  assert.match(sheet, /hiddenTest: "Este servicio está oculto en el sitio público porque su nombre lo marca como prueba \(QA\/E2E\)\. Cámbiale el nombre para compartirlo\."/);
  assert.match(sheet, /serviceHiddenAsTest\(item, talentId, hidesTest\)/);
  const act = readFileSync(join(process.cwd(), "src/lib/talent/services-settings-actions.ts"), "utf8");
  assert.match(act, /publicSiteHidesTestServices: flags\.is_demo === true \|\| flags\.is_test_account === true/);
});

test("TUL-1270 b9: the row menu offers Share for a draft too, and the sheet explains it is not public yet", () => {
  const chrome = readFileSync(join(process.cwd(), "src/components/talent/services/ServicesHomeRowChrome.tsx"), "utf8");
  assert.match(chrome, /<MenuBtn onClick=\{\(\) => \{ onShare\(\); onClose\(\); \}\}>\{copy\.t\("Share"\)\}<\/MenuBtn>/);
  assert.doesNotMatch(chrome, /word === "live" && <MenuBtn onClick=\{\(\) => \{ onShare/);
  // A draft that was never published: nothing to copy, so the sheet shows the not-public message.
  const draft = { ...LIVE, status: "draft" };
  assert.equal(serviceShareUrl({ offering: draft, destinations: [HOST, PROFILE], origin: "https://x" }), null);
  assert.equal(isServiceShareable(draft), false);
});
