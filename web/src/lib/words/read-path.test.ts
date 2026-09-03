import test from "node:test";
import assert from "node:assert/strict";

import { resolveWords, INDUSTRY_PRESETS, wordsInputFromSettings } from "./index";

/**
 * read-path.test.ts — the rules the public surfaces depend on (F2b).
 *
 * These are not tests of `resolveWords` itself (that is `words.test.ts`). They
 * pin the two decisions the header and the chat launcher make ON TOP of it,
 * because both decisions are about NOT regressing a live storefront and both
 * are invisible until a real tenant hits them.
 */

/** Mirrors the header: an explicit CTA wins, otherwise the preset verb. */
function headerCta(settings: unknown, explicitLabel: string | null, explicitHref: string | null) {
  const words = resolveWords(wordsInputFromSettings(settings), "en");
  const presetLabel =
    words.preset.id === "custom" ? "" : words.headerVerbLabel().trim();
  return {
    label: explicitLabel || (presetLabel || null),
    href: explicitHref || (presetLabel ? "?inquiry=open" : null),
  };
}

/** Mirrors the launcher: the operator's greeting wins, then the preset voice. */
function chatGreeting(settings: unknown, operatorGreeting: string | undefined) {
  const words = resolveWords(wordsInputFromSettings(settings), "en");
  const presetVoice =
    words.preset.id === "custom" ? undefined : words.preset.chatVoice[words.locale];
  return operatorGreeting?.trim() || presetVoice;
}

// ─── The no-regression rule, which is the whole point ────────────────────

test("a workspace with no preset keeps exactly today's header and greeting", () => {
  // Every workspace that exists today predates presets. `industry_preset` is
  // absent, which resolves to "custom". If "custom" supplied a verb or a voice,
  // this change would silently rewrite the header button and the chat opener on
  // every live storefront on the platform.
  for (const settings of [null, {}, { industry_preset: null }, "nonsense"]) {
    const cta = headerCta(settings, null, null);
    assert.equal(cta.label, null, "no preset must not invent a header button");
    assert.equal(cta.href, null);
    assert.equal(chatGreeting(settings, undefined), undefined, "no preset must not change the opener");
  }
});

test("an operator who explicitly picks Custom also keeps today's behaviour", () => {
  const settings = { industry_preset: "custom" };
  assert.equal(headerCta(settings, null, null).label, null);
  assert.equal(chatGreeting(settings, undefined), undefined);
});

// ─── The operator always wins ────────────────────────────────────────────

test("an operator's own CTA beats the preset verb", () => {
  const cta = headerCta({ industry_preset: "restaurant" }, "Book the chef's table", "/p/chefs-table");
  assert.equal(cta.label, "Book the chef's table");
  assert.equal(cta.href, "/p/chefs-table");
});

test("an operator's own greeting beats the preset voice", () => {
  assert.equal(
    chatGreeting({ industry_preset: "restaurant" }, "  Buenas, que se te antoja?  "),
    "Buenas, que se te antoja?",
  );
});

// ─── What a real preset actually produces ────────────────────────────────

test("a preset supplies a verb that points at the chat, never at a route", () => {
  const cta = headerCta({ industry_preset: "restaurant" }, null, null);
  assert.equal(cta.label, "Reserve");
  assert.equal(cta.href, "?inquiry=open");

  // `?inquiry=open` is path-relative and prefix-safe: `prefixPublicHref`
  // returns a non-"/" href untouched, so it works on an apex tenant and a
  // path-prefixed one alike, and on every page it renders on.
  assert.ok(!cta.href.startsWith("/"), "a rooted href would be tenant-prefixed");
});

test("the header verb follows the words layer per preset, not a hardcode", () => {
  assert.equal(headerCta({ industry_preset: "bar_club" }, null, null).label, "Tickets");
  assert.equal(headerCta({ industry_preset: "sports_venue" }, null, null).label, "Book a court");
  assert.equal(headerCta({ industry_preset: "salon_barber" }, null, null).label, "Book");
  // "ask" presets render a real label rather than an empty button.
  assert.equal(headerCta({ industry_preset: "agency" }, null, null).label, "Get in touch");
});

test("a terminology pick still reaches the header verb", () => {
  // The barber who chose Agenda in Appointments settings sees that word on the
  // public button, which is the thing terminology never reached before F2.
  const cta = headerCta(
    { industry_preset: "salon_barber", appointments: { terminology: "agenda" } },
    null,
    null,
  );
  assert.equal(cta.label, "Book");
});

test("every non-custom preset yields a non-empty verb and voice in both languages", () => {
  for (const preset of INDUSTRY_PRESETS) {
    if (preset.id === "custom") continue;
    for (const locale of ["en", "es"] as const) {
      const words = resolveWords({ presetId: preset.id }, locale);
      assert.ok(
        words.headerVerbLabel().trim().length > 0,
        `${preset.id} ${locale}: blank header verb`,
      );
      assert.ok(
        preset.chatVoice[locale].trim().length > 0,
        `${preset.id} ${locale}: blank chat voice`,
      );
    }
  }
});

test("a corrupt settings blob cannot blank a live header", () => {
  for (const settings of [{ words: "not an object" }, { industry_preset: 7 }, []]) {
    const cta = headerCta(settings, null, null);
    // Degrades to "no preset", which is today's behaviour, never to an empty
    // button with a live href.
    assert.equal(cta.label, null);
    assert.equal(cta.href, null);
  }
});
