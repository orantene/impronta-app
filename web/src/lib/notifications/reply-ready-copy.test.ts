/**
 * UNIT TEST — EN/ES parity for the inquiry email loop's visitor-facing copy
 * (reply-mirror email + the per-conversation unsubscribe page).
 *
 * Every string an INQUIRER sees ships in both languages. Key-set parity for
 * the email fragment is already enforced at compile time
 * (`CLIENT_ES: typeof CLIENT_EN`), but that cannot catch an ES value left as
 * the English sentence — the copy-paste failure that actually happens. These
 * assertions pin: both locales resolve, the loop's new keys exist in both, and
 * the ES values are genuinely translated rather than echoing EN.
 *
 * Run: npx tsx --test src/lib/notifications/reply-ready-copy.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { getEmailCopy, getEmailSubject, interpolate } from "./email-copy";

/** The keys the reply-mirror template reads off `client.reply_ready`. */
const REPLY_READY_KEYS = [
  "subject",
  "preview",
  "heading",
  "intro",
  "note",
  "button",
  "loginNote",
  "loginButton",
  "stopLine",
] as const;

describe("client.reply_ready — EN/ES parity", () => {
  it("exposes every key the template reads, in both locales", () => {
    for (const locale of ["en", "es"]) {
      const copy = getEmailCopy(locale)["client.reply_ready"] as Record<string, string>;
      for (const key of REPLY_READY_KEYS) {
        assert.equal(typeof copy[key], "string", `${locale}.${key} must be a string`);
        assert.ok(copy[key].trim().length > 0, `${locale}.${key} must not be empty`);
      }
    }
  });

  it("ES is actually translated — no key silently left in English", () => {
    const en = getEmailCopy("en")["client.reply_ready"] as Record<string, string>;
    const es = getEmailCopy("es")["client.reply_ready"] as Record<string, string>;
    for (const key of REPLY_READY_KEYS) {
      assert.notEqual(
        es[key],
        en[key],
        `client.reply_ready.${key} is identical in ES and EN — untranslated`,
      );
    }
  });

  it("localizes the subject and interpolates the agency name in both locales", () => {
    const enSubject = getEmailSubject("en", "client.reply_ready");
    const esSubject = getEmailSubject("es", "client.reply_ready");
    assert.ok(enSubject && esSubject);
    assert.equal(
      interpolate(enSubject!, { brand: "Impronta Models" }),
      "Impronta Models replied about your inquiry",
    );
    assert.equal(
      interpolate(esSubject!, { brand: "Impronta Models" }),
      "Impronta Models respondió a tu solicitud",
    );
  });

  it("an unknown locale falls back to EN rather than throwing", () => {
    const copy = getEmailCopy("pt-BR")["client.reply_ready"] as Record<string, string>;
    assert.equal(copy.button, getEmailCopy("en")["client.reply_ready"].button);
  });
});
