import assert from "node:assert/strict";
import test from "node:test";

import {
  detectDefaultCountry,
  guestPhoneError,
  normalizeGuestPhone,
  parseIntlPhonePaste,
  toE164,
} from "./guest-phone";

test("parse: +52 with spaces gives MX and national digits", () => {
  const p = parseIntlPhonePaste("+52 55 1234 5678");
  assert.equal(p?.iso, "MX");
  assert.equal(p?.dial, "+52");
  assert.equal(p?.national, "5512345678");
});

test("parse: +1 415 gives US", () => {
  const p = parseIntlPhonePaste("+1 415 555 0134");
  assert.equal(p?.iso, "US");
  assert.equal(p?.national, "4155550134");
});

test("parse: 0044 prefix gives GB", () => {
  const p = parseIntlPhonePaste("0044 20 7946 0958");
  assert.equal(p?.iso, "GB");
  assert.equal(p?.dial, "+44");
  assert.equal(p?.national, "2079460958");
});

test("parse: local number is not international", () => {
  assert.equal(parseIntlPhonePaste("55 1234 5678"), null);
});

test("detect: ip country wins", () => {
  assert.equal(detectDefaultCountry({ ipCountry: "es", languages: ["en-US"], timeZone: "America/Mexico_City", talentCountry: "AR" }), "ES");
});

test("detect: browser language region, then timezone, then talent, then MX", () => {
  assert.equal(detectDefaultCountry({ languages: ["es-CO"], talentCountry: "AR" }), "CO");
  assert.equal(detectDefaultCountry({ languages: ["en"], timeZone: "America/Mexico_City", talentCountry: "AR" }), "MX");
  assert.equal(detectDefaultCountry({ languages: ["en"], timeZone: "Etc/UTC", talentCountry: "ar" }), "AR");
  assert.equal(detectDefaultCountry({}), "MX");
  assert.equal(detectDefaultCountry({ ipCountry: "XX", languages: ["zz-ZZ"] }), "MX");
});

test("toE164 strips leading zeros and punctuation", () => {
  assert.equal(toE164("+52", "55 1234-5678"), "+525512345678");
  assert.equal(toE164("+52", ""), "");
});

test("normalize + validate: required and shape", () => {
  assert.equal(normalizeGuestPhone("+525512345678"), "+525512345678");
  assert.equal(normalizeGuestPhone("+52 55 1234 5678"), "+525512345678");
  assert.equal(normalizeGuestPhone("0044 20 7946 0958"), "+442079460958");
  assert.equal(normalizeGuestPhone("5512345678"), null);
  assert.equal(normalizeGuestPhone(""), null);
  assert.equal(normalizeGuestPhone(null), null);
  assert.equal(normalizeGuestPhone("+52123"), null);
  assert.equal(guestPhoneError(null, "es"), "Falta el teléfono (WhatsApp).");
  assert.equal(guestPhoneError("+525512345678", "es"), null);
  assert.match(guestPhoneError("abc", "en") ?? "", /phone/i);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { clampTaskBrief, withGuestNote } from "@/lib/talent/offering-task-brief";

test("guest note: clamped to 500 chars and survives the server re-clamp", () => {
  const b = withGuestNote(null, "x".repeat(900));
  assert.equal(b?.guest_note?.length, 500);
  assert.equal(clampTaskBrief(b)?.guest_note?.length, 500);
  assert.equal(withGuestNote(null, "   "), null);
});

test("server actions validate the phone before writing", () => {
  const root = join(process.cwd(), "src");
  const instant = readFileSync(join(root, "lib/server-actions/instant-book-action.ts"), "utf8");
  assert.ok(instant.indexOf("normalizeGuestPhone(payload.contactPhone)") > 0);
  assert.ok(instant.indexOf("normalizeGuestPhone(payload.contactPhone)") < instant.indexOf("placeInstantPurchase("));
  const contact = readFileSync(join(root, "app/(public)/contact/actions.ts"), "utf8");
  assert.ok(contact.indexOf("normalizeGuestPhone(contact_phone)") < contact.indexOf('rpc("ensure_guest_session"'));
  const pitch = readFileSync(join(root, "lib/pitch/pitch-public-actions.ts"), "utf8");
  assert.ok(pitch.includes("normalizeGuestPhone(input.contactInfo?.phone)"));
});

test("talentCountryIso reads a location embed's country, array or object", async () => {
  const { talentCountryIso } = await import("./guest-phone");
  assert.equal(talentCountryIso({ country_code: "mx" }), "MX");
  assert.equal(talentCountryIso([{ country_code: "CO" }]), "CO");
  assert.equal(talentCountryIso({ country_code: "ZZ" }), null);
  assert.equal(talentCountryIso(null), null);
});
