/**
 * TUL-92 + TUL-93 regression: what a guest sees and who is told after
 * "Confirmar cita" on a talent site. Source-level guards (the paths run behind
 * server actions and host headers a unit test cannot stand up).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("TUL-92: /c/[inquiryId] never redirects into workspace routes on a talent host", () => {
  const src = read("app/c/[inquiryId]/page.tsx");
  assert.match(src, /hostKind === "talent_site"/);
  // The relative, host-safe redirect only runs when NOT on a talent site.
  assert.match(src, /if \(!onTalentSite\)\s*\{[\s\S]*hostSafeRedirectDestination/);
  // Fallback for a talent-host visitor that does not own the guest cookie is the app host.
  assert.match(src, /ownerRedirect = `\$\{getAppUrl\(\)\}/);
});

test("TUL-92: a booking with nothing to pay online confirms on the same page", () => {
  const src = read("components/public-booking/use-catalog-booking-confirm.ts");
  assert.match(src, /outcome\.path\.startsWith\("\/c\/"\)/);
  assert.match(src, /input\.setStep\("done"\)/);
});

test("TUL-92: the captcha widget waits for the vendor API and cleans up on unmount", () => {
  const src = read("components/public-booking/GuestCaptchaField.tsx");
  assert.match(src, /tryRender/);
  assert.match(src, /api\?\.remove\?\.\(widgetId\)/);
});

test("TUL-93: a booking with no online charge emits booking.confirmed", () => {
  const src = read("lib/server-actions/instant-book-action.ts");
  assert.match(src, /notifyBookingConfirmed\(\{/);
  assert.match(src, /else if \(booked\.bookingId && booked\.inquiryId\)/);
});

test("TUL-93: live-qa pack selects event_kind (not kind) on notification_dispatch_log", () => {
  const pack = readFileSync(
    join(process.cwd(), "e2e-isolated/live-qa-pack.spec.ts"),
    "utf8",
  );
  const tul93 = pack.slice(pack.indexOf('test("TUL-93'));
  const body = tul93.slice(0, tul93.indexOf('test("TUL-146'));
  assert.match(body, /event_kind/);
  assert.ok(
    !body.includes("channel, kind"),
    "pack must not select nonexistent column `kind` (false empty rows)",
  );
});

test("TUL-93: the talent gets an in-app notification and malformed emails are skipped", () => {
  const cat = read("lib/notifications/catalog-entries-inquiry.ts");
  const talent = cat.slice(cat.indexOf('id: "booking.confirmed.talent"'));
  assert.match(talent.slice(0, 700), /defaultChannels: \["email", "in_app"\]/);
  const email = read("lib/notifications/channels/email.ts");
  assert.match(email, /\[\^\\s@,;<>\]\+@/);
});
