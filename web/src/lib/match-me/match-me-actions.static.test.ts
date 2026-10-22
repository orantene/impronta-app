/**
 * TUL-1464: the match-me actions authenticate, scope and notify. Static wiring checks (the decisions
 * themselves are covered in rules.test.ts / candidates.test.ts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { findCatalogEntries } from "@/lib/notifications/catalog";
import { matchOfferSummary } from "./views";

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

test("P1 privacy: the match.offered bell never carries the client's email, phone or links", () => {
  const raw = "Wedding photos. Text me 984 123 4567 or +1 (305) 555-0199, ana.lopez@gmail.com, https://ana.site/me, instagram.com/ana_ph, @ana_ph";
  // The producer masks before dispatch: the payload is built from matchOfferSummary, never the raw text.
  const src = read("src/lib/notifications/producers/match-notify.ts");
  assert.match(src, /const summary = matchOfferSummary\(p\.summary\);/);
  assert.doesNotMatch(src, /summary: p\.summary|p\.summary\.replace/);
  const payload = { requestId: "r1", summary: matchOfferSummary(raw) };
  assert.ok(!/984|305|555|ana\.lopez|gmail|https?:|ana\.site|instagram|@/.test(payload.summary), payload.summary);
  assert.match(payload.summary, /\[phone hidden\]/);
  assert.match(payload.summary, /\[email hidden\]/);
  assert.match(payload.summary, /\[link hidden\]/);
  // And the bell masks again at render, so an unmasked payload written earlier cannot leak either.
  const [e] = findCatalogEntries("match.offered");
  const ev = { type: "match.offered", tenantId: "t", eventId: "e", payload: { requestId: "r1", summary: raw } } as never;
  for (const locale of ["en", "es"]) {
    const body = e!.in_app!.body!(ev, { locale, displayName: "X" } as never)!;
    assert.ok(!/984|305|555|ana\.lopez|gmail|https?:|ana\.site|instagram|@/.test(body), body);
    assert.match(body, /Wedding photos\./);
  }
});
