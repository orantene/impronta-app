/**
 * TUL-1464: the match-me actions authenticate, scope and notify. Static wiring checks (the decisions
 * themselves are covered in rules.test.ts / candidates.test.ts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { findCatalogEntries } from "@/lib/notifications/catalog";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const actions = read("src/lib/match-me/match-me-actions.ts");

test("requestMatch: client only, signed in, rate limited, this site's workspace, never impersonating", () => {
  const fn = actions.slice(actions.indexOf("export async function requestMatch"), actions.indexOf("export type AcceptMatchResult"));
  assert.match(fn, /assertNotImpersonating\(\)/);
  assert.match(fn, /accountSurfaceEnabledForRequest\(\)/);
  assert.match(fn, /isClientAccountEligible\(/);
  assert.match(fn, /tryConsumeRateLimit\(`match-request:\$\{session\.user\.id\}`/);
  assert.match(fn, /loadMatchCandidates\(tenant\.tenantId\)/);
  assert.match(fn, /clientUserId: session\.user\.id/, "the client id is the session's, never an input");
  assert.doesNotMatch(fn, /input\.(tenantId|clientUserId)/);
});

test("acceptMatchAsTalent: the caller is the signed-in talent; the request's tenant scopes acceptMatch; losers and client are told", () => {
  const fn = actions.slice(actions.indexOf("export async function acceptMatchAsTalent"));
  assert.match(fn, /requireTalentSelf\(\)/);
  assert.match(fn, /acceptMatch\(parsed\.data\.requestId, me\.talentProfile\.id, \{ tenantId: row\.tenant_id, callerUserId: me\.session\.user\.id \}\)/);
  assert.ok(fn.indexOf("acceptMatch(") < fn.indexOf("notifyMatchTaken("), "notify only after the win");
  assert.match(fn, /notifyMatchAccepted\(/);
});

test("the three bells exist, in-app, ES and EN, and never carry client contact details", () => {
  const recipient = (locale: string) => ({ locale, displayName: "X" }) as never;
  const ev = (type: string, payload: Record<string, unknown>) => ({ type, tenantId: "t", eventId: "e", payload }) as never;
  for (const [type, payload, en, es] of [
    ["match.offered", { summary: "Clean my flat" }, "A new job for you", "Nuevo trabajo para ti"],
    ["match.taken", {}, "That job was taken", "Ese trabajo ya fue tomado"],
    ["match.accepted", { proName: "Ana" }, "Ana accepted your job", "Ana aceptó tu trabajo"],
  ] as const) {
    const [e] = findCatalogEntries(type);
    assert.ok(e, type);
    assert.deepEqual([...e!.defaultChannels], ["in_app"]);
    assert.equal(e!.in_app!.title(ev(type, payload), recipient("en")), en);
    assert.equal(e!.in_app!.title(ev(type, payload), recipient("es")), es);
    for (const text of [e!.in_app!.body!(ev(type, payload), recipient("en")), e!.in_app!.body!(ev(type, payload), recipient("es"))]) {
      assert.ok(text && !text.includes("—") && !/@|\d{6,}/.test(text), type);
    }
  }
});

test("the producers dedupe per request + person and never put contact details in a payload", () => {
  const src = read("src/lib/notifications/producers/match-notify.ts");
  assert.match(src, /`match-offered:\$\{p\.requestId\}:\$\{talentId\}`/);
  assert.match(src, /`match-taken:\$\{p\.requestId\}:\$\{talentId\}`/);
  assert.match(src, /`match-accepted:\$\{p\.requestId\}`/);
  assert.doesNotMatch(src, /\b(email|phone|contactEmail)\s*:/i);
});
