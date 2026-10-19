import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedQaEmail, refFromSupabaseUrl, run } from "./staging-signup-code.core.mjs";

const STAGING_URL = "https://fxlankepwnvelxjrahwk.supabase.co";
const PROD_URL = "https://pluhdapdnuiulvxmyspd.supabase.co";
const GOOD_EMAIL = "qa-onb-choice+story-a-1@impronta.test";

function harness(overrides = {}) {
  const calls = { factory: 0, fetch: 0, generate: [] };
  const lines = { out: [], err: [] };
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => {
    calls.fetch += 1;
    throw new Error("network must not be used");
  };
  const result = {
    props: { email_otp: "123456", action_link: "https://example.invalid/link" },
    error: null,
  };
  const deps = {
    argv: ["--email", GOOD_EMAIL],
    env: { NEXT_PUBLIC_SUPABASE_URL: STAGING_URL, SUPABASE_SERVICE_ROLE_KEY: "svc-secret-value" },
    createAdminClient: () => {
      calls.factory += 1;
      return {
        auth: {
          admin: {
            generateLink: async (arg) => {
              calls.generate.push(arg);
              return { data: result.error ? null : { properties: result.props }, error: result.error };
            },
          },
        },
      };
    },
    out: (l) => lines.out.push(l),
    err: (l) => lines.err.push(l),
    ...overrides,
  };
  return { deps, calls, lines, result, restore: () => (globalThis.fetch = origFetch) };
}

async function expectRefusal(overrides) {
  const h = harness(overrides);
  try {
    const code = await run(h.deps);
    assert.equal(code, 2);
    assert.equal(h.calls.factory, 0, "client factory must never be called");
    assert.equal(h.calls.fetch, 0, "fetch must never be called");
    assert.deepEqual(h.lines.out, []);
    assert.ok(!h.lines.err.join("\n").includes("svc-secret-value"));
  } finally {
    h.restore();
  }
}

test("refuses a wrong (non-staging) project ref", () =>
  expectRefusal({ env: { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" } }));

test("refuses the production ref", () =>
  expectRefusal({ env: { NEXT_PUBLIC_SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: "k" } }));

test("refuses when the production ref hides elsewhere in the env", () =>
  expectRefusal({
    env: { NEXT_PUBLIC_SUPABASE_URL: STAGING_URL, SUPABASE_SERVICE_ROLE_KEY: "k", DATABASE_URL: "postgres://u@db.pluhdapdnuiulvxmyspd.supabase.co/x" },
  }));

test("refuses an email that is not on the allow-list", () => expectRefusal({ argv: ["--email", "someone@gmail.com"] }));

test("refuses lookalike emails", async () => {
  for (const e of ["qa-onb-choice+x@impronta.test.evil.com", "qa-onb-choice@impronta.test", "x@tulalaqa+y.com", "a@evilmail.grokbot.com", "tulalaqa@x.com"]) {
    assert.equal(isAllowedQaEmail(e), false, e);
  }
  await expectRefusal({ argv: ["--email", "qa-onb-choice+x@impronta.test.evil.com"] });
});

test("refuses a missing --email", () => expectRefusal({ argv: [] }));

test("refuses missing env", async () => {
  await expectRefusal({ env: {} });
  await expectRefusal({ env: { NEXT_PUBLIC_SUPABASE_URL: STAGING_URL } });
});

test("allow-list accepts the three documented patterns", () => {
  assert.ok(isAllowedQaEmail("qa-onb-choice+story-a-1@impronta.test"));
  assert.ok(isAllowedQaEmail("tulalaqa+one@example.com"));
  assert.ok(isAllowedQaEmail("Anyone@mail.grokbot.com"));
});

test("ref parsing", () => {
  assert.equal(refFromSupabaseUrl(STAGING_URL), "fxlankepwnvelxjrahwk");
  assert.equal(refFromSupabaseUrl("https://fxlankepwnvelxjrahwk.supabase.co.evil.com"), "");
  assert.equal(refFromSupabaseUrl("nope"), "");
});

test("happy path prints only the code", async () => {
  const h = harness();
  try {
    const code = await run(h.deps);
    assert.equal(code, 0);
    assert.deepEqual(h.lines.out, ["123456"]);
    assert.equal(h.calls.factory, 1);
    assert.deepEqual(h.calls.generate, [{ type: "magiclink", email: GOOD_EMAIL }]);
    assert.ok(!h.lines.err.join("\n").includes("svc-secret-value"));
  } finally {
    h.restore();
  }
});

test("falls back to the action link when email_otp is absent", async () => {
  const h = harness();
  h.result.props = { action_link: "https://example.invalid/link" };
  try {
    const code = await run(h.deps);
    assert.equal(code, 0);
    assert.deepEqual(h.lines.out, ["https://example.invalid/link"]);
  } finally {
    h.restore();
  }
});

test("a lookup error exits 1 without leaking the key", async () => {
  const h = harness();
  h.result.error = { message: "User not found" };
  try {
    const code = await run(h.deps);
    assert.equal(code, 1);
    assert.deepEqual(h.lines.out, []);
    assert.ok(!h.lines.err.join("\n").includes("svc-secret-value"));
  } finally {
    h.restore();
  }
});
