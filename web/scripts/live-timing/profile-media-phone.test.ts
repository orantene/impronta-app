import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

import {
  CAPTION_TEST_TEXT,
  assertSafeBookingAction,
  captionMatchesOriginal,
  formatCaptionTiming,
  formatMediaPhoneTable,
  phoneTapVerdict,
  pickCaptionAsset,
  planCaptionRestore,
  readCaptionOriginal,
  scrollSteps,
  storedCaptionFor,
  summarizeDurations,
  writeCaptionBackup,
} from "./profile-media-phone";
import { deleteTempState } from "./timing-harness";

const PROFILE = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";

test("summarizeDurations: median, min, max, mean; drops junk; empty is zeros", () => {
  assert.deepEqual(summarizeDurations([300, 100, 200]), { n: 3, minMs: 100, maxMs: 300, medianMs: 200, meanMs: 200 });
  assert.equal(summarizeDurations([100, 200, 300, 400]).medianMs, 250);
  assert.equal(summarizeDurations([100, Number.NaN, -5, Infinity]).n, 1);
  assert.deepEqual(summarizeDurations([]), { n: 0, minMs: 0, maxMs: 0, medianMs: 0, meanMs: 0 });
});

test("formatCaptionTiming: verdict follows the budget; null means NOT CONFIRMED", () => {
  assert.match(formatCaptionTiming({ actionResponseMs: 400, clickToSavedMs: 900, actionLabel: "POST 200" }), /within budget/);
  assert.match(formatCaptionTiming({ actionResponseMs: 400, clickToSavedMs: 9000, actionLabel: "POST 200" }), /OVER budget/);
  assert.match(formatCaptionTiming({ actionResponseMs: null, clickToSavedMs: null, actionLabel: "none" }), /NOT CONFIRMED/);
});

test("readCaptionOriginal: absent keys are null, never an empty string; does not mutate", () => {
  assert.deepEqual(readCaptionOriginal(null), { caption: null, captionI18n: null });
  const meta = { caption: "Hola", caption_i18n: { en: "Hello", bad: 3 }, albumId: "a" };
  const copy = JSON.stringify(meta);
  assert.deepEqual(readCaptionOriginal(meta), { caption: "Hola", captionI18n: { en: "Hello" } });
  assert.equal(JSON.stringify(meta), copy);
});

test("planCaptionRestore: keyed on asset id AND owner profile id, other metadata carried through", () => {
  const original = readCaptionOriginal({ caption: "Original", caption_i18n: { en: "Orig" } });
  const plan = planCaptionRestore({
    code: "TAL-93900",
    profileId: PROFILE,
    assetId: ASSET,
    assetOwnerProfileId: PROFILE,
    original,
    current: { caption: CAPTION_TEST_TEXT, albumId: "a1", alt_i18n: { en: "x" } },
  });
  assert.equal(plan.table, "media_assets");
  assert.deepEqual(plan.match, { id: ASSET, owner_talent_profile_id: PROFILE });
  assert.deepEqual(plan.metadata, { caption: "Original", albumId: "a1", alt_i18n: { en: "x" }, caption_i18n: { en: "Orig" } });
});

test("planCaptionRestore: a caption that did not exist is deleted again, not blanked", () => {
  const plan = planCaptionRestore({
    code: "TAL-93900",
    profileId: PROFILE,
    assetId: ASSET,
    assetOwnerProfileId: PROFILE,
    original: { caption: null, captionI18n: null },
    current: { caption: CAPTION_TEST_TEXT, caption_i18n: { en: "t" }, note: "keep" },
  });
  assert.deepEqual(plan.metadata, { note: "keep" });
  assert.equal("caption" in plan.metadata, false);
});

test("planCaptionRestore refuses non TAL-93900, Jorgelina, missing keys and a foreign owner", () => {
  const base = { profileId: PROFILE, assetId: ASSET, assetOwnerProfileId: PROFILE, original: { caption: null, captionI18n: null }, current: {} };
  assert.throws(() => planCaptionRestore({ ...base, code: "TAL-93938" }), /REFUSED/);
  assert.throws(() => planCaptionRestore({ ...base, code: "TAL-1" }), /REFUSED/);
  assert.throws(() => planCaptionRestore({ ...base, code: "TAL-93900", profileId: "" }), /no profile id/);
  assert.throws(() => planCaptionRestore({ ...base, code: "TAL-93900", assetId: "" }), /no asset id/);
  assert.throws(() => planCaptionRestore({ ...base, code: "TAL-93900", assetOwnerProfileId: "someone-else" }), /does not belong/);
  assert.throws(() => planCaptionRestore({ ...base, code: "TAL-93900", assetOwnerProfileId: null }), /does not belong/);
});

test("captionMatchesOriginal proves the restore, key order does not matter", () => {
  const original = readCaptionOriginal({ caption: "A", caption_i18n: { en: "x", es: "y" } });
  assert.equal(captionMatchesOriginal({ caption: "A", caption_i18n: { es: "y", en: "x" } }, original), true);
  assert.equal(captionMatchesOriginal({ caption: CAPTION_TEST_TEXT, caption_i18n: { en: "x", es: "y" } }, original), false);
  assert.equal(captionMatchesOriginal({}, { caption: null, captionI18n: null }), true);
  assert.equal(captionMatchesOriginal({ caption: "" }, { caption: null, captionI18n: null }), false);
});

test("storedCaptionFor reads the field the UI writes: primary to caption, other languages to caption_i18n", () => {
  const meta = { caption: "Hola", caption_i18n: { en: "Hello" } };
  assert.equal(storedCaptionFor(meta, "es", "es"), "Hola");
  assert.equal(storedCaptionFor(meta, "en-US", "es"), "Hello");
  assert.equal(storedCaptionFor(meta, "fr", "es"), "");
  assert.equal(storedCaptionFor(null, "es", "es"), "");
});

test("writeCaptionBackup: 0600 file in a dir deleteTempState owns; refuses a non-test talent", () => {
  const file = writeCaptionBackup({ code: "TAL-93900", profileId: PROFILE, assetId: ASSET, original: { caption: "A", captionI18n: null } });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).assetId, ASSET);
  assert.equal(deleteTempState(file), true);
  assert.throws(() => writeCaptionBackup({ code: "TAL-93938", profileId: PROFILE, assetId: ASSET, original: { caption: null, captionI18n: null } }), /REFUSED/);
});

test("pickCaptionAsset takes the first real image, skips videos and qa-harness files", () => {
  const rows = [
    { id: "v", storage_path: "a/clip.mp4" },
    { id: "q", storage_path: "a/qa-harness-1.png" },
    { id: "n", storage_path: null },
    { id: "ok", storage_path: "a/photo.JPG" },
    { id: "later", storage_path: "a/other.webp" },
  ];
  assert.equal(pickCaptionAsset(rows)?.id, "ok");
  assert.equal(pickCaptionAsset([{ id: "v", storage_path: "a/clip.mp4" }]), null);
});

test("assertSafeBookingAction refuses submit, book now, confirm, reserve, pay (and ES forms)", () => {
  for (const bad of ["submit booking", "Book now", "book  now", "confirm booking", "Confirmar", "reserve slot", "Reservar cita", "pay for this", "pay deposit", "Pagar", "Enviar solicitud", "checkout"]) {
    assert.throws(() => assertSafeBookingAction(bad), /REFUSED/, bad);
  }
  for (const ok of ["tap sticky bar", "select service", "continue to the booking sheet", "save caption", "open photos entry"]) {
    assert.equal(assertSafeBookingAction(ok), ok);
  }
});

test("scrollSteps: window.scrollTo offsets from 0 to max, ends exactly at max, never empty", () => {
  assert.deepEqual(scrollSteps(1000, 400), [0, 400, 800, 1000]);
  assert.deepEqual(scrollSteps(800, 400), [0, 400, 800]);
  assert.deepEqual(scrollSteps(0), [0]);
  assert.deepEqual(scrollSteps(-5), [0]);
  assert.deepEqual(scrollSteps(Number.NaN), [0]);
});

test("phoneTapVerdict: sheet or menu in view passes; nothing or an overflowing bar fails", () => {
  assert.equal(phoneTapVerdict({ sheetOpen: true, menuInView: false, barFitsViewport: true }).ok, true);
  assert.equal(phoneTapVerdict({ sheetOpen: false, menuInView: true, barFitsViewport: true }).ok, true);
  assert.equal(phoneTapVerdict({ sheetOpen: false, menuInView: false, barFitsViewport: true }).ok, false);
  assert.equal(phoneTapVerdict({ sheetOpen: true, menuInView: true, barFitsViewport: false }).ok, false);
});

test("formatMediaPhoneTable counts passes and failures", () => {
  const t = formatMediaPhoneTable([
    { ticket: "TUL-224", name: "caption", pass: true, ms: 1200 },
    { ticket: "TUL-106", name: "phone", pass: false, ms: 900, note: "no sheet" },
  ]);
  assert.match(t, /1 passed, 1 failed/);
  assert.match(t, /FAIL/);
  assert.match(t, /no sheet/);
});
