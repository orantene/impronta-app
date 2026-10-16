/**
 * Vercel preview hosts resolve as the platform `app` host, in preview only.
 *
 * QA needs to open a branch preview (`tulala-git-<branch>-oran-tenes-projects
 * .vercel.app`) and see the app instead of the 404 "Host not registered" page.
 * Production must never accept a vercel.app host: the env gate is the whole
 * security boundary, so both sides are asserted.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { previewHostContext } from "./preview-host";
import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";

const GIT_HOST = "tulala-git-integ-now-w24a-account-icon-oran-tenes-projects.vercel.app";
const HASH_HOST = "tulala-abc123xyz-oran-tenes-projects.vercel.app";

test("preview env: branch and hash preview hosts resolve as the app host", () => {
  for (const host of [GIT_HOST, HASH_HOST, GIT_HOST.toUpperCase() + ":443"]) {
    assert.deepEqual(previewHostContext(host, "preview"), {
      kind: "app",
      tenantId: null,
      hostname: host.split(":")[0].toLowerCase(),
    });
  }
});

test("production env: a preview host is still rejected", () => {
  assert.equal(previewHostContext(GIT_HOST, "production"), null);
  assert.equal(previewHostContext(HASH_HOST, "production"), null);
});

test("unset or unknown env: rejected (fail closed)", () => {
  assert.equal(previewHostContext(GIT_HOST, undefined), null);
  assert.equal(previewHostContext(GIT_HOST, "development"), null);
});

test("preview env: hosts outside the Tulala project pattern are rejected", () => {
  for (const host of [
    "evil-oran-tenes-projects.vercel.app", // other project in the team
    "tulala-x-someone-else.vercel.app", // other team
    "tulala-x-oran-tenes-projects.vercel.app.evil.com", // suffix trick
    "a.tulala-x-oran-tenes-projects.vercel.app", // extra label
    "tulala-oran-tenes-projects.vercel.app", // no deployment segment
    "tulala.digital",
    "",
  ]) {
    assert.equal(previewHostContext(host, "preview"), null, host);
  }
});

test("auth cookies on a preview host stay host-only (never .vercel.app)", () => {
  assert.equal(cookieDomainForHost(GIT_HOST), undefined);
  assert.equal(cookieDomainForHost(HASH_HOST), undefined);
});

// The real gate: `resolveTenantContext` is what proxy.ts 404s on. Supabase env
// is cleared so the DB lookup cannot help; only the preview rule can.
async function resolveWith(env: string | undefined, host: string) {
  const { resolveTenantContext } = await import("./host-context");
  const saved = { v: process.env.VERCEL_ENV, u: process.env.NEXT_PUBLIC_SUPABASE_URL };
  if (env === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = env;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    const req = { cookies: { getAll: () => [] } } as unknown as Parameters<typeof resolveTenantContext>[0];
    return await resolveTenantContext(req, host);
  } finally {
    if (saved.v === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = saved.v;
    if (saved.u !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.u;
  }
}

test("gate: preview env resolves a preview host to kind app", async () => {
  const ctx = await resolveWith("preview", HASH_HOST);
  assert.equal(ctx.kind, "app");
});

test("gate: production env still returns not_found for a preview host", async () => {
  const ctx = await resolveWith("production", "tulala-other1-oran-tenes-projects.vercel.app");
  assert.equal(ctx.kind, "not_found");
});
