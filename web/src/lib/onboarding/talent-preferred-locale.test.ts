import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fillTalentPreferredLocale, talentPreferredLocaleToFill } from "./talent-preferred-locale";

/** Records the chain and behaves like `update ... is null`: only a NULL column is written. */
function fakeAdmin(stored: { preferred_locale: string | null }, opts: { error?: boolean; throws?: boolean } = {}) {
  const calls: string[] = [];
  const admin = {
    from(table: string) {
      calls.push(`from:${table}`);
      return {
        update(patch: { preferred_locale: string }) {
          calls.push(`update:${patch.preferred_locale}`);
          return {
            eq(col: string, val: string) {
              calls.push(`eq:${col}=${val}`);
              return {
                async is(col2: string, val2: null) {
                  calls.push(`is:${col2}=${val2}`);
                  if (opts.throws) throw new Error("boom");
                  if (opts.error) return { error: { message: "nope" } };
                  if (stored.preferred_locale === val2) stored.preferred_locale = patch.preferred_locale;
                  return { error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

test("only en and es are worth storing", () => {
  assert.equal(talentPreferredLocaleToFill("es"), "es");
  assert.equal(talentPreferredLocaleToFill("en"), "en");
  assert.equal(talentPreferredLocaleToFill("fr"), null);
  assert.equal(talentPreferredLocaleToFill(""), null);
  assert.equal(talentPreferredLocaleToFill(null), null);
});

test("a NULL preferred_locale is filled with the flow language", async () => {
  const stored = { preferred_locale: null as string | null };
  const { admin, calls } = fakeAdmin(stored);
  await fillTalentPreferredLocale(admin, "tp1", "es");
  assert.equal(stored.preferred_locale, "es");
  assert.ok(calls.includes("eq:id=tp1"));
  assert.ok(calls.includes("is:preferred_locale=null"), "the null guard is part of the write itself");
});

test("a stored choice is never overwritten", async () => {
  const stored = { preferred_locale: "en" as string | null };
  const { admin } = fakeAdmin(stored);
  await fillTalentPreferredLocale(admin, "tp1", "es");
  assert.equal(stored.preferred_locale, "en");
});

test("an unsupported flow locale or missing id writes nothing", async () => {
  const stored = { preferred_locale: null as string | null };
  const { admin, calls } = fakeAdmin(stored);
  await fillTalentPreferredLocale(admin, "tp1", "fr");
  await fillTalentPreferredLocale(admin, "", "es");
  assert.deepEqual(calls, []);
  assert.equal(stored.preferred_locale, null);
});

test("a Supabase error or a throw never fails the build", async () => {
  const stored = { preferred_locale: null as string | null };
  await assert.doesNotReject(fillTalentPreferredLocale(fakeAdmin(stored, { error: true }).admin, "tp1", "es"));
  await assert.doesNotReject(fillTalentPreferredLocale(fakeAdmin(stored, { throws: true }).admin, "tp1", "es"));
  assert.equal(stored.preferred_locale, null);
});
