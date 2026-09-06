/**
 * UNIT TEST — the guest acknowledgement in the tenant's language.
 *
 * The headline case is the one that was broken: a Spanish tenant's visitor
 * must read Spanish. The rest guard the trap underneath it — the latency
 * fragment arrives in English, and half-translating a sentence is worse than
 * not promising a latency at all.
 *
 * Run: npx tsx --test src/lib/inquiry/guest-ack-copy.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  buildGuestAckBody,
  normalizeAckLocale,
  translateReplyFragment,
} from "./guest-ack-copy";
import { _formatLatency } from "./guest-reply-latency";

describe("guest acknowledgement copy", () => {
  it("a Spanish tenant's visitor reads Spanish", () => {
    const body = buildGuestAckBody({ locale: "es", replyFragment: null });
    assert.equal(body, "Listo, recibimos tu mensaje. Te respondemos muy pronto.");
    assert.match(body, /recibimos tu mensaje/);
  });

  it("an English tenant's visitor still reads English", () => {
    assert.equal(
      buildGuestAckBody({ locale: "en", replyFragment: null }),
      "Got it, we've received your message and will be in touch shortly.",
    );
  });

  it("the latency promise survives translation instead of being dropped", () => {
    assert.equal(
      buildGuestAckBody({ locale: "es", replyFragment: "in ~2 hours" }),
      "Listo, recibimos tu mensaje. Normalmente respondemos en ~2 horas.",
    );
    assert.equal(
      buildGuestAckBody({ locale: "en", replyFragment: "in ~2 hours" }),
      "Got it, we've received your message. We typically reply in ~2 hours.",
    );
  });

  // The guard on the whole approach: every branch of the producer must have a
  // translation. Add an eighth branch to _formatLatency without one here and
  // this fails, rather than emitting an English fragment inside a Spanish
  // sentence in front of a customer.
  it("EVERY _formatLatency branch has a Spanish translation", () => {
    const msPerMin = 60_000;
    const msPerHour = 3_600_000;
    const samples = [
      10 * msPerMin, // in minutes
      1.5 * msPerHour, // in ~1 hour
      3 * msPerHour, // in ~3 hours
      8 * msPerHour, // within a few hours
      20 * msPerHour, // the same day
      30 * msPerHour, // within a day
      72 * msPerHour, // within 2–3 days
    ];
    const missing: string[] = [];
    for (const ms of samples) {
      const english = _formatLatency(ms);
      if (translateReplyFragment(english, "es") === null) missing.push(english);
    }
    assert.deepEqual(
      missing,
      [],
      `These _formatLatency outputs have no Spanish translation, so a Spanish ` +
        `visitor would silently lose the latency promise:\n  ${missing.join("\n  ")}`,
    );
  });

  it("an UNKNOWN fragment yields the no-latency sentence, never English inside Spanish", () => {
    const body = buildGuestAckBody({ locale: "es", replyFragment: "by next Tuesday" });
    assert.equal(body, "Listo, recibimos tu mensaje. Te respondemos muy pronto.");
    assert.doesNotMatch(body, /next Tuesday/);
  });

  it("neither language uses an em dash or agency vocabulary", () => {
    const bodies = [
      buildGuestAckBody({ locale: "es", replyFragment: null }),
      buildGuestAckBody({ locale: "es", replyFragment: "in minutes" }),
      buildGuestAckBody({ locale: "en", replyFragment: null }),
      buildGuestAckBody({ locale: "en", replyFragment: "in minutes" }),
    ];
    for (const b of bodies) {
      assert.equal(b.includes("—"), false, `em dash in: ${b}`);
      assert.equal(
        /\b(talent|talento|casting|roster|agency|agencia)\w*\b/i.test(b),
        false,
        `agency vocabulary in: ${b}`,
      );
    }
  });

  it("normalizes stored locale values, defaulting to English", () => {
    assert.equal(normalizeAckLocale("es"), "es");
    assert.equal(normalizeAckLocale("es-MX"), "es");
    assert.equal(normalizeAckLocale("ES_mx"), "es");
    assert.equal(normalizeAckLocale("en-US"), "en");
    assert.equal(normalizeAckLocale(null), "en");
    assert.equal(normalizeAckLocale(""), "en");
    assert.equal(normalizeAckLocale("pt"), "en");
  });
});
