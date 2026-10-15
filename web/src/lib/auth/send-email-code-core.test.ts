import assert from "node:assert/strict";
import { test } from "node:test";

import {
  sendEmailCodeCore,
  type OtpSendClient,
  type SendEmailCodeDeps,
} from "./send-email-code-core";

type Call = { email: string; options: { shouldCreateUser: boolean; emailRedirectTo: string; data?: Record<string, unknown> } };

function fakeClient(error: unknown): { client: OtpSendClient; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      auth: {
        async signInWithOtp(args) {
          calls.push(args);
          return { error };
        },
      },
    },
  };
}

function deps(client: OtpSendClient | null, over: Partial<SendEmailCodeDeps> = {}): SendEmailCodeDeps {
  return {
    t: (key) => key,
    consumeFloor: () => true,
    checkDurable: async () => true,
    getClient: async () => client,
    envHelp: "env",
    emailRedirectTo: "https://app.example/auth/confirm",
    ...over,
  };
}

const LOGIN = { ip: "1.2.3.4", resent: false, shouldCreateUser: false };

test("login: known email gets the sent notice and never creates a user", async () => {
  const { client, calls } = fakeClient(null);
  const out = await sendEmailCodeCore({ ...LOGIN, email: "known@example.com" }, deps(client));
  assert.deepEqual(out, {
    step: "sent",
    email: "known@example.com",
    resent: false,
    notice: "public.auth.passwordless.sentNotice",
  });
  assert.equal(calls[0]?.options.shouldCreateUser, false);
});

for (const err of [
  { code: "otp_disabled", message: "Signups not allowed for otp" },
  { code: "signup_disabled", message: "Signups not allowed" },
  { code: "user_not_found", message: "User not found" },
  { status: 500, message: "Database error finding user" },
]) {
  test(`login: unknown email (${err.message}) gets the SAME answer as a known one`, async () => {
    const known = await sendEmailCodeCore(
      { ...LOGIN, email: "same@example.com" },
      deps(fakeClient(null).client),
    );
    const unknown = await sendEmailCodeCore(
      { ...LOGIN, email: "same@example.com" },
      deps(fakeClient(err).client),
    );
    assert.deepEqual(unknown, known);
  });
}

test("login: a thrown client error is also answered generically", async () => {
  const client: OtpSendClient = {
    auth: {
      async signInWithOtp() {
        throw new Error("boom");
      },
    },
  };
  const out = await sendEmailCodeCore({ ...LOGIN, email: "x@example.com" }, deps(client));
  assert.equal(out?.step, "sent");
});

test("login: Supabase rate limit still surfaces (not account dependent)", async () => {
  const { client } = fakeClient({ code: "over_email_send_rate_limit", message: "rate" });
  const out = await sendEmailCodeCore({ ...LOGIN, email: "x@example.com" }, deps(client));
  assert.deepEqual(out, {
    step: "email",
    error: "public.auth.passwordless.errors.tooMany",
    email: "x@example.com",
  });
});

test("signup path keeps surfacing send errors", async () => {
  const { client } = fakeClient({ code: "otp_disabled", message: "x" });
  const out = await sendEmailCodeCore(
    { ...LOGIN, shouldCreateUser: true, email: "x@example.com" },
    deps(client),
  );
  assert.equal(out?.step, "email");
});

test("rate limit floor blocks before any email is sent, and spends both budgets", async () => {
  const { client, calls } = fakeClient(null);
  const keys: string[] = [];
  const out = await sendEmailCodeCore(
    { ...LOGIN, email: "x@example.com" },
    deps(client, {
      consumeFloor: (key) => {
        keys.push(key);
        return !key.startsWith("auth-otp-send:");
      },
    }),
  );
  assert.equal(out?.step, "email");
  assert.equal(calls.length, 0);
  assert.deepEqual(keys, ["auth-otp-send:x@example.com", "auth-otp-send-ip:1.2.3.4"]);
});

test("durable limiter blocks before any email is sent; resend stays on the code step", async () => {
  const { client, calls } = fakeClient(null);
  const out = await sendEmailCodeCore(
    { ...LOGIN, resent: true, email: "x@example.com" },
    deps(client, { checkDurable: async () => false }),
  );
  assert.deepEqual(out, {
    step: "code",
    error: "public.auth.passwordless.errors.tooMany",
    email: "x@example.com",
  });
  assert.equal(calls.length, 0);
});

test("TUL-814: the signup language rides on the new user so the email hook can still pick ES", async () => {
  const { client, calls } = fakeClient(null);
  await sendEmailCodeCore({ email: "a@b.co", ip: "1.2.3.4", resent: false, shouldCreateUser: true }, deps(client, { newUserData: { lang: "es" } }));
  assert.deepEqual(calls[0].options.data, { lang: "es" });
  const plain = fakeClient(null);
  await sendEmailCodeCore({ email: "a@b.co", ip: "1.2.3.4", resent: false, shouldCreateUser: true }, deps(plain.client));
  assert.equal("data" in plain.calls[0].options, false);
});
