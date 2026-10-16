import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClientApiRead, type ClientApiReadDeps } from "./client-api-read";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const A = "aaaaaaaa-staff-actor";
const B = "bbbbbbbb-impersonated-subject";
const RLS = { tag: "rls" } as unknown as SupabaseClient;
const ADMIN = { tag: "admin" } as unknown as SupabaseClient;

function deps(opts: {
  session?: string | null;
  identity?: { actor: string; effective: string; on: boolean } | null;
  admin?: boolean;
  rlsUser?: string | null;
}): ClientApiReadDeps {
  const session = opts.session === undefined ? A : opts.session;
  const rlsUser = opts.rlsUser === undefined ? session : opts.rlsUser;
  const rls = {
    tag: "rls",
    auth: { getUser: async () => ({ data: { user: rlsUser ? { id: rlsUser } : null }, error: null }) },
  } as unknown as SupabaseClient;
  return {
    sessionUserId: async () => session,
    identity: async () =>
      opts.identity
        ? { actorUser: { id: opts.identity.actor }, effectiveUserId: opts.identity.effective, isImpersonating: opts.identity.on }
        : null,
    rlsClient: async () => rls,
    adminClient: () => (opts.admin === false ? null : ADMIN),
  };
}

test("not impersonating: the session user and the RLS client", async () => {
  const r = await resolveClientApiRead(deps({ identity: null }));
  assert.ok(r);
  assert.equal(r.userId, A);
  assert.equal(r.impersonated, false);
  assert.notEqual(r.client, ADMIN);
});

test("verified impersonation: the subject and the admin client", async () => {
  const r = await resolveClientApiRead(deps({ identity: { actor: A, effective: B, on: true } }));
  assert.ok(r);
  assert.equal(r.userId, B);
  assert.equal(r.impersonated, true);
  assert.equal(r.client, ADMIN);
});

test("signed out: null", async () => {
  assert.equal(await resolveClientApiRead(deps({ session: null, identity: null })), null);
});

test("identity built for another actor degrades to the session user, never the admin client", async () => {
  const r = await resolveClientApiRead(deps({ identity: { actor: "someone-else", effective: B, on: true } }));
  assert.ok(r);
  assert.equal(r.userId, A);
  assert.equal(r.impersonated, false);
  assert.notEqual(r.client, ADMIN);
});

test("identity that does not claim impersonation is ignored", async () => {
  const r = await resolveClientApiRead(deps({ identity: { actor: A, effective: B, on: false } }));
  assert.ok(r);
  assert.equal(r.userId, A);
  assert.notEqual(r.client, ADMIN);
});

test("impersonation without an admin client fails closed", async () => {
  const r = await resolveClientApiRead(deps({ identity: { actor: A, effective: B, on: true }, admin: false }));
  assert.equal(r, null);
});

function read(rel: string): string {
  return readFileSync(join(WEB_ROOT, rel), "utf8");
}

test("TUL-255: /api/client routes key ownership on the effective client, not the session user", () => {
  for (const rel of [
    "src/app/api/client/messages/route.ts",
    "src/app/api/client/inquiry-details/route.ts",
    "src/app/api/client/pitches/count/route.ts",
  ]) {
    const src = read(rel);
    assert.match(src, /resolveClientApiRead\(\)/, rel);
    assert.doesNotMatch(src, /\.user\.id/, `${rel} must not key on the session user id`);
    assert.match(src, /read\.userId/, rel);
  }
  assert.match(read("src/app/api/client/messages/route.ts"), /read\.impersonated \? read\.userId : undefined/);
  assert.match(read("src/app/api/client/inquiry-details/route.ts"), /read\.impersonated \? read\.client : undefined/);
});
