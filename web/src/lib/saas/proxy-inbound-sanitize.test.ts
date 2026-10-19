import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

import {
  ACTOR_HEADERS,
  isPlausibleForwardedActor,
} from "@/lib/saas/actor-headers";
import { stripInboundHostContextHeaders } from "@/lib/saas/proxy-inbound-sanitize";

const FORGED = "0f5c1e0a-1b2c-4d3e-8f90-a1b2c3d4e5f6";

test("TUL-1269: a forged x-impronta-actor-* header is stripped from the inbound request", () => {
  const headers: Record<string, string> = {};
  for (const h of ACTOR_HEADERS) headers[h] = h.endsWith("id") ? FORGED : "platform_admin";
  const out = stripInboundHostContextHeaders(
    new NextRequest("https://talent.example/", { headers }),
  );
  for (const h of ACTOR_HEADERS) assert.equal(out.get(h), null, `${h} must not survive`);
});

test("every actor header the middleware writes is in the stripped set", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/supabase/middleware.ts"), "utf8");
  for (const name of [
    "ACTOR_ID_HEADER",
    "ACTOR_EMAIL_HEADER",
    "ACTOR_APP_ROLE_HEADER",
    "ACTOR_STATUS_HEADER",
    "ACTOR_ONBOARDED_HEADER",
    "ACTOR_HOME_PREF_HEADER",
  ]) {
    assert.match(src, new RegExp(`\\b${name}\\b`), `${name} is imported by updateSession`);
  }
  assert.match(src, /from "@\/lib\/saas\/actor-headers"/);
  assert.equal(ACTOR_HEADERS.length, 6);
});

test("the fast path refuses a header that is not shaped like the proxy's output", () => {
  assert.equal(isPlausibleForwardedActor(FORGED, "talent", "active"), true);
  assert.equal(isPlausibleForwardedActor("admin", "talent", "active"), false);
  assert.equal(isPlausibleForwardedActor(null, null, null), false);
  assert.equal(isPlausibleForwardedActor(FORGED, "x; drop table", "active"), false);
  assert.equal(isPlausibleForwardedActor(FORGED, "talent", "A".repeat(80)), false);
});
