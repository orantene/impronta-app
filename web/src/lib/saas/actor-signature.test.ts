import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { actorSecret, signActorFields, verifyActorSignature, type ActorFields } from "@/lib/saas/actor-signature";
import { allowDevSurfacesFor } from "@/lib/saas/dev-surfaces";

const F: ActorFields = {
  id: "0f5c1e0a-1b2c-4d3e-8f90-a1b2c3d4e5f6",
  email: "a@b.test",
  appRole: "talent",
  status: "active",
  onboarded: "1",
  homePref: null,
};

test("TUL-1269: a request that skips the proxy and carries forged headers is not trusted", async () => {
  // The forger knows the header shape but not the secret: no signature, or one made with another key.
  assert.equal(await verifyActorSignature("server-secret", { ...F, appRole: "super_admin" }, null), false);
  const forgedWithOtherKey = await signActorFields("attacker-guess", { ...F, appRole: "super_admin" });
  assert.equal(await verifyActorSignature("server-secret", { ...F, appRole: "super_admin" }, forgedWithOtherKey), false);
});

test("a proxy-signed set verifies; changing any single field breaks it", async () => {
  const sig = await signActorFields("server-secret", F);
  assert.equal(await verifyActorSignature("server-secret", F, sig), true);
  for (const tweak of [
    { id: "9a8b7c6d-1111-4222-8333-444455556666" },
    { email: "other@b.test" },
    { appRole: "super_admin" },
    { status: "suspended" },
    { onboarded: "0" },
    { homePref: "admin" },
  ]) {
    assert.equal(await verifyActorSignature("server-secret", { ...F, ...tweak }, sig), false, JSON.stringify(tweak));
  }
  assert.equal(await verifyActorSignature("server-secret", F, sig.slice(0, -1)), false, "truncated");
});

test("no secret fails closed; only development has a fallback", async () => {
  assert.equal(actorSecret({ NODE_ENV: "production" }), null);
  assert.equal(actorSecret({}), null);
  assert.equal(actorSecret({ ACTOR_HEADER_SECRET: " abc " }), "abc");
  assert.ok(actorSecret({ NODE_ENV: "development" }));
  const sig = await signActorFields("x", F);
  assert.equal(await verifyActorSignature(null, F, sig), false);
});

test("INVARIANT the reader verifies before trusting, the writer signs, team-invite goes through the reader", () => {
  const rd = readFileSync(join(process.cwd(), "src/lib/server/request-cache.ts"), "utf8");
  assert.match(rd, /verifyActorSignature\([\s\S]*?\);\s*if \(!signed\) return null;[\s\S]*?return \{\s*supabase,/);
  const wr = readFileSync(join(process.cwd(), "src/lib/supabase/middleware.ts"), "utf8");
  assert.match(wr, /forwardedHeaders\.set\(\s*ACTOR_SIG_HEADER,\s*await signActorFields/);
  const inv = readFileSync(join(process.cwd(), "src/app/team-invite/[id]/route.ts"), "utf8");
  assert.match(inv, /getCachedActorSession\(\)/);
});

test("dev surfaces: a client Host header never opens them on Vercel production", () => {
  const prod = { VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" };
  assert.equal(allowDevSurfacesFor(prod, "evil.local"), false);
  assert.equal(allowDevSurfacesFor(prod, "evil.local:3000"), false);
  assert.equal(allowDevSurfacesFor({ VERCEL_ENV: "preview" }, "x.test"), true);
  assert.equal(allowDevSurfacesFor({ NODE_ENV: "development" }, "x.test"), true);
  assert.equal(allowDevSurfacesFor({ NODE_ENV: "production" }, "harness.local:3102"), true, "isolated harness off Vercel");
  assert.equal(allowDevSurfacesFor({ NODE_ENV: "production" }, "app.tulala.digital"), false);
});

test("INVARIANT proxy.ts keeps every dev-surface env read as a literal (Edge inlining) and stays within max-lines", () => {
  const src = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
  for (const name of ["TULALA_ALLOW_DEV_SURFACES", "NODE_ENV", "VERCEL_ENV", "VERCEL"]) {
    assert.match(src, new RegExp(`${name}: process\\.env\\.${name}\\b`), `${name} read by literal name`);
  }
  assert.doesNotMatch(src, /allowDevSurfacesFor\(process\.env/);
  assert.ok(src.split("\n").length <= 800, "proxy.ts must stay within the 800-line ESLint max-lines cap");
});
