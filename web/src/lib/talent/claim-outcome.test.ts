/**
 * Unit tests — presentClaimOutcome.
 *
 * The claim screen is the first thing a real talent sees after signing up, so
 * every RPC verdict must produce copy that (a) says what happened and (b)
 * offers a next step. presentClaimOutcome itself is pure and only returns
 * catalog KEYS under `public.auth.claim.*` (mirroring registerCopyKeys in
 * lib/auth/register-intent.ts) — the page resolves them with its translator
 * and fills the `{agency}` placeholder. So these tests pin two things:
 *
 * 1. The key mapping: no reason may map to an empty/missing key, and the two
 *    CTAs must only appear when they make sense.
 * 2. The catalog content those keys resolve to, in BOTH messages/en.json and
 *    messages/es.json (the register-intent.test.ts pattern) — a Spanish
 *    talent must never see English wrapped in Spanish chrome.
 *
 * Run: npx tsx --test src/lib/talent/claim-outcome.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { presentClaimOutcome, type ClaimReason } from "./claim-outcome";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

const ALL_REASONS: ClaimReason[] = [
  "claimed",
  "already_yours",
  "already_redeemed_by_you",
  "not_authenticated",
  "invite_not_found",
  "invite_revoked",
  "invite_already_redeemed",
  "invite_expired",
  "email_mismatch",
  "profile_unavailable",
  "profile_already_claimed",
  "claimer_has_profile",
];

/* ─────────────────────── catalog lookup helpers ─────────────────────── */

function lookup(catalog: unknown, key: string): unknown {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const CATALOGS = [
  ["en", en],
  ["es", es],
] as const;

/** Resolve a key against a catalog and fill {agency}, mirroring the page. */
function resolve(catalog: unknown, key: string, agency: string): string {
  const value = lookup(catalog, key);
  assert.equal(typeof value, "string", `missing catalog string at ${key}`);
  return (value as string).replace("{agency}", agency);
}

/* ───────────────────────── key-mapping behaviour ─────────────────────── */

test("every reason yields non-empty titleKey + bodyKey", () => {
  for (const reason of ALL_REASONS) {
    const p = presentClaimOutcome({ ok: reason === "claimed", reason });
    assert.ok(p.titleKey.length > 0, `${reason} has no titleKey`);
    assert.ok(p.bodyKey.length > 0, `${reason} has no bodyKey`);
  }
});

test("an unknown reason still maps to an explanatory key instead of nothing", () => {
  const p = presentClaimOutcome({ ok: false, reason: "some_future_reason" });
  assert.equal(p.success, false);
  assert.equal(p.titleKey, "public.auth.claim.unknownTitle");
  assert.equal(p.bodyKey, "public.auth.claim.unknownBody");
  assert.equal(p.showResendHint, true);
});

test("only the genuinely-owning outcomes are success", () => {
  const successes = ALL_REASONS.filter(
    (r) => presentClaimOutcome({ ok: true, reason: r }).success,
  );
  assert.deepEqual(successes.sort(), [
    "already_redeemed_by_you",
    "already_yours",
    "claimed",
  ]);
});

test("exclusive vs non-exclusive claim map to different body keys, same title", () => {
  const exclusive = presentClaimOutcome({
    ok: true,
    reason: "claimed",
    exclusive_confirmed: true,
  });
  const shared = presentClaimOutcome({
    ok: true,
    reason: "claimed",
    exclusive_confirmed: false,
  });
  assert.equal(exclusive.titleKey, shared.titleKey);
  assert.equal(exclusive.bodyKey, "public.auth.claim.claimedExclusiveBody");
  assert.equal(shared.bodyKey, "public.auth.claim.claimedSharedBody");
  assert.equal(exclusive.showDashboard, true);
});

test("duplicate-profile refusal still shows the dashboard CTA (they still have a profile)", () => {
  const p = presentClaimOutcome({
    ok: false,
    reason: "claimer_has_profile",
    existing_profile_id: "abc",
  });
  assert.equal(p.bodyKey, "public.auth.claim.claimerHasProfileBody");
  assert.equal(p.showDashboard, true);
});

test("shared reasons map invite_not_found/profile_unavailable to the same copy", () => {
  const a = presentClaimOutcome({ ok: false, reason: "invite_not_found" });
  const b = presentClaimOutcome({ ok: false, reason: "profile_unavailable" });
  assert.equal(a.titleKey, b.titleKey);
  assert.equal(a.bodyKey, b.bodyKey);
});

test("shared reasons map invite_already_redeemed/profile_already_claimed to the same copy", () => {
  const a = presentClaimOutcome({ ok: false, reason: "invite_already_redeemed" });
  const b = presentClaimOutcome({ ok: false, reason: "profile_already_claimed" });
  assert.equal(a.titleKey, b.titleKey);
  assert.equal(a.bodyKey, b.bodyKey);
});

/* ─────────────── every key resolves in both message catalogs ────────── */

test("every reason's titleKey and bodyKey resolve in both en.json and es.json", () => {
  for (const reason of ALL_REASONS) {
    for (const exclusive of [true, false]) {
      const p = presentClaimOutcome({
        ok: reason === "claimed",
        reason,
        exclusive_confirmed: exclusive,
      });
      for (const [locale, catalog] of CATALOGS) {
        for (const [slot, key] of [
          ["titleKey", p.titleKey],
          ["bodyKey", p.bodyKey],
        ] as const) {
          const value = lookup(catalog, key);
          assert.equal(
            typeof value,
            "string",
            `${locale}.json is missing ${key} (${reason}.${slot})`,
          );
          assert.ok(
            (value as string).trim().length > 0,
            `${locale}.json has an empty ${key}`,
          );
        }
      }
    }
  }
});

test("the unknown-reason fallback keys resolve in both en.json and es.json", () => {
  const p = presentClaimOutcome({ ok: false, reason: "totally_unmapped" });
  for (const [locale, catalog] of CATALOGS) {
    assert.equal(typeof lookup(catalog, p.titleKey), "string", locale);
    assert.equal(typeof lookup(catalog, p.bodyKey), "string", locale);
  }
});

/* ─────────────────────── resolved-copy behaviour (EN + ES) ───────────── */

for (const [locale, catalog] of CATALOGS) {
  test(`[${locale}] exclusive claim explains the agency keeps managing, and how to exit`, () => {
    const p = presentClaimOutcome({
      ok: true,
      reason: "claimed",
      exclusive_confirmed: true,
    });
    const body = resolve(catalog, p.bodyKey, "Impronta Models");
    assert.match(body, /Impronta Models/);
    // Localized "exclusively"/"en exclusiva" — checked per-locale below.
    if (locale === "en") assert.match(body, /exclusively/i);
    if (locale === "es") assert.match(body, /exclusiva/i);
    assert.equal(p.showDashboard, true);
  });

  test(`[${locale}] non-exclusive claim does NOT claim the agency manages them`, () => {
    const p = presentClaimOutcome({
      ok: true,
      reason: "claimed",
      exclusive_confirmed: false,
    });
    const body = resolve(catalog, p.bodyKey, "Free Studio");
    if (locale === "en") {
      assert.doesNotMatch(body, /exclusively/i);
      assert.match(body, /you decide/i);
    }
    if (locale === "es") {
      assert.doesNotMatch(body, /exclusiva/i);
      assert.match(body, /tú decides/i);
    }
  });

  test(`[${locale}] email mismatch never leaks who the invite was addressed to`, () => {
    const p = presentClaimOutcome({ ok: false, reason: "email_mismatch" });
    // Copy must not echo an address — the person holding the link may not be
    // the intended recipient. This body never even carries {agency}.
    const body = resolve(catalog, p.bodyKey, "Impronta Models");
    assert.doesNotMatch(body, /@/);
    assert.equal(p.showDashboard, false);
  });

  test(`[${locale}] duplicate-profile refusal reassures nothing was destroyed`, () => {
    const p = presentClaimOutcome({
      ok: false,
      reason: "claimer_has_profile",
      existing_profile_id: "abc",
    });
    const body = resolve(catalog, p.bodyKey, "Impronta Models");
    if (locale === "en") assert.match(body, /nothing has been lost/i);
    if (locale === "es") assert.match(body, /no se ha perdido nada/i);
    assert.equal(p.showDashboard, true);
  });

  test(`[${locale}] the agency-name fallback is a neutral, localized phrase`, () => {
    const fallback = lookup(catalog, "public.auth.claim.agencyFallback");
    assert.equal(typeof fallback, "string");
    assert.ok((fallback as string).trim().length > 0);
    if (locale === "en") assert.equal(fallback, "the agency");
    if (locale === "es") assert.equal(fallback, "la agencia");

    const p = presentClaimOutcome({ ok: false, reason: "invite_expired" });
    const body = resolve(catalog, p.bodyKey, fallback as string);
    assert.doesNotMatch(body, /null|undefined/);
    if (locale === "en") assert.match(body, /the agency/);
    if (locale === "es") assert.match(body, /la agencia/);
  });

  test(`[${locale}] no em dashes in claim outcome copy`, () => {
    const claimNamespace = lookup(catalog, "public.auth.claim") as Record<
      string,
      unknown
    >;
    for (const [key, value] of Object.entries(claimNamespace)) {
      if (typeof value === "string") {
        assert.doesNotMatch(value, /—/, `${locale}.json public.auth.claim.${key} has an em dash`);
      }
    }
  });
}
