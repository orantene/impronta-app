import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  applyClientRecords,
  parseClientDetails,
  parseClientNote,
  type ClientRecordOverlay,
} from "./client-records";
import type { TalentClientRow } from "./clients-merge";
import { isSoloTalent } from "./solo-talent";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");
const app = (rel: string) => src(`app/(workspace)/${rel}`);

// ─── 1. One canonical route per surface ──────────────────────────────

test("duplicate talent routes redirect to ONE canonical route, query kept", () => {
  const canonical: Array<[string, string]> = [
    ["talent/messages/page.tsx", "/talent/inbox"],
    ["talent/settings/payouts/page.tsx", "/talent/payouts"],
    ["talent/presence/page.tsx", "/talent/site"],
  ];
  for (const [file, target] of canonical) {
    const s = app(file);
    assert.match(s, new RegExp(`permanentRedirect\\(\`${target}\\$\\{buildQuerySuffix`), file);
  }
  assert.match(app("talent/public-page/page.tsx"), /redirect\("\/talent\/site"\)/);
  for (const file of ["talent/reach/page.tsx", "talent/activity/page.tsx", "talent/agencies/page.tsx"]) {
    assert.match(app(file), /permanentRedirect\("\/talent\/money"\)/, file);
  }
});

test("canonical routes render the shell, not a redirect", () => {
  assert.match(app("talent/inbox/page.tsx"), /page="messages"/);
  assert.match(app("talent/payouts/page.tsx"), /page="payouts"/);
});

test("routes with a unique purpose stay: attention, trust, studio-kit (dev only)", () => {
  assert.match(app("talent/attention/page.tsx"), /page="attention"/);
  assert.match(app("talent/trust/page.tsx"), /export default async function/);
  assert.match(app("talent/studio-kit/page.tsx"), /NODE_ENV === "production"\) notFound\(\)/);
});

test("tenant-branded twins hop straight to the canonical route (one redirect)", () => {
  const twins: Array<[string, string]> = [
    ["messages", "inbox"],
    ["settings/payouts", "payouts"],
    ["presence", "site"],
    ["public-page", "site"],
    ["inbox", "inbox"],
    ["payouts", "payouts"],
    ["activity", "activity"],
    ["reach", "reach"],
  ];
  for (const [twin, target] of twins) {
    const s = app(`[tenantSlug]/talent/${twin}/page.tsx`);
    assert.match(s, new RegExp(`redirectLegacyTalentPath\\("${target}"`), twin);
  }
});

test("nothing links to the legacy /settings/payouts URL any more", () => {
  assert.doesNotMatch(src("components/talent-payouts/PayoutNudgeCard.tsx"), /talent\/settings\/payouts/);
});

// ─── 2. Clients: real writers, honest results ────────────────────────

function row(id: string, name: string): TalentClientRow {
  return {
    id,
    name,
    lastVisit: null,
    completedCount: 0,
    visitCount: 0,
    amountOwedCents: null,
    currency: null,
    conversationHref: null,
    source: "booking",
    phone: null,
    email: "old@example.com",
    nextStartsAt: null,
    nextStatus: null,
    nextBookingHref: null,
    overdue: false,
  };
}

function overlay(p: Partial<ClientRecordOverlay> & { clientKey: string }): ClientRecordOverlay {
  return { name: null, email: null, phone: null, note: null, archivedAt: null, ...p };
}

test("parseClientDetails validates name, email and phone", () => {
  assert.deepEqual(parseClientDetails({ name: "  " }), { ok: false, code: "invalid_name" });
  assert.deepEqual(parseClientDetails({ name: "Ana", email: "nope" }), { ok: false, code: "invalid_email" });
  assert.deepEqual(parseClientDetails({ name: "Ana", phone: "abc" }), { ok: false, code: "invalid_phone" });
  assert.deepEqual(parseClientDetails({ name: "x".repeat(201) }), { ok: false, code: "too_long" });
  assert.deepEqual(parseClientDetails({ name: " Ana ", email: " a@b.co ", phone: "" }), {
    ok: true,
    value: { name: "Ana", email: "a@b.co", phone: null },
  });
});

test("parseClientNote trims, clears on empty and caps length", () => {
  assert.deepEqual(parseClientNote("  hi  "), { ok: true, value: "hi" });
  assert.deepEqual(parseClientNote("   "), { ok: true, value: null });
  assert.deepEqual(parseClientNote("x".repeat(4001)), { ok: false, code: "too_long" });
});

test("applyClientRecords: edits win, archived drops out, hand-added appends", () => {
  const derived = [row("inquiry:1", "Ana"), row("inquiry:2", "Bo"), row("inquiry:3", "Cy")];
  const out = applyClientRecords(derived, [
    overlay({ clientKey: "inquiry:1", name: "Ana Maria", note: "likes early slots" }),
    overlay({ clientKey: "inquiry:2", archivedAt: "2026-09-30T00:00:00Z" }),
    overlay({ clientKey: "record:abc", name: "Walk-in Dee", phone: "555 1234" }),
    overlay({ clientKey: "record:gone", name: "Old", archivedAt: "2026-09-30T00:00:00Z" }),
  ]);
  assert.deepEqual(
    out.map((r) => r.name),
    ["Ana Maria", "Cy", "Walk-in Dee"],
  );
  assert.equal(out[0]!.note, "likes early slots");
  assert.equal(out[0]!.email, "old@example.com", "a null override keeps the derived value");
  assert.equal(out[2]!.manual, true);
  assert.equal(out[2]!.id, "record:abc");
});

test("client writers check the owner, validate, and never report success on an error", () => {
  const s = src("lib/talent/client-records-actions.ts");
  assert.match(s, /^"use server";/);
  assert.match(s, /user_id !== session\.user\.id/);
  for (const fn of ["createClientRecord", "updateClientDetails", "saveClientNote", "setArchived"]) {
    const start = s.indexOf(`function ${fn}`);
    assert.ok(start > 0, fn);
    const body = s.slice(start, s.indexOf("\n}\n", start));
    assert.match(body, /ownerClient\(/, `${fn} owner check`);
    assert.match(body, /if \(error\) return failure\(/, `${fn} surfaces the DB error`);
  }
  assert.match(s, /42P01/, "a missing table is reported as unavailable");
});

test("Clients page uses the shared panel frame and has no dead 'not available yet' controls", () => {
  const page = src("components/admin/shell/internal/talent/pages/ClientsPage.tsx");
  const panels = src("components/admin/shell/internal/talent/pages/ClientPanels.tsx");
  assert.match(page, /ClientDetailsPanel/);
  assert.match(page, /ClientArchiveSheet/);
  assert.match(page, /ClientNoteInline/);
  assert.doesNotMatch(page, /not available yet/);
  assert.doesNotMatch(page, /router\.push\("\/talent\/bookings\/new"\);\s*\n\s*\}\}\s*\n\s*>\s*\n\s*\{t\("Add a client"\)/);
  assert.match(panels, /from "\.\.\/agenda\/AgendaPanelFrame"/);
  assert.doesNotMatch(panels, /#[0-9a-fA-F]{3,8}\b/, "no hex literals");
  assert.doesNotMatch(panels, /—/, "no em dashes");
});

test("talent_client_records migration is additive, RLS on, no client access", () => {
  const dir = join(process.cwd(), "..", "supabase", "migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_talent_client_records.sql"));
  assert.ok(file, "migration present");
  const sql = readFileSync(join(dir, file!), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.talent_client_records/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.talent_client_records FROM anon/);
  assert.match(sql, /UNIQUE \(talent_profile_id, client_key\)/);
  assert.doesNotMatch(sql, /DROP |DELETE FROM/);
});

test("every new Clients string has a Spanish entry", () => {
  const es = src("components/admin/shell/internal/dashboard-i18n-talent-client-panels.ts");
  const panels = src("components/admin/shell/internal/talent/pages/ClientPanels.tsx");
  const keys = [...panels.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]!);
  assert.ok(keys.length > 10);
  const known = [
    "Private notes",
    "Edit",
  ]; // already translated in the shared catalog
  for (const key of keys) {
    if (known.includes(key)) continue;
    const quoted = `"${key}":`;
    const bare = `  ${key}:`;
    assert.ok(es.includes(quoted) || es.includes(bare), `missing ES for: ${key}`);
  }
});

// ─── 3. Money: no refund / cash-correction control without a writer ──

test("Money has no refund or cash-correction entry point without a real writer", () => {
  const dir = join(process.cwd(), "src/components/talent/money");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
    const s = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(s, /openMoneyTask\(\s*["'](refund|cash_correct)/, f);
    assert.doesNotMatch(s, /["'](Issue refund|Correct cash|Cash correction)["']/, f);
  }
  assert.match(
    readFileSync(join(dir, "MoneyPage.tsx"), "utf8"),
    /Refund \/ correct have no writer yet, so they have no entry point either/,
  );
});

// ─── 4. Solo talents never see agency surfaces ───────────────────────

test("isSoloTalent: only a roster row or an application in flight makes a talent non-solo", () => {
  assert.equal(isSoloTalent({ rosterAgencyCount: 0, applicationCount: 0 }), true);
  assert.equal(isSoloTalent({ rosterAgencyCount: 1, applicationCount: 0 }), false);
  assert.equal(isSoloTalent({ rosterAgencyCount: 0, applicationCount: 2 }), false);
});

test("agency surfaces are gated for solo talents", () => {
  const discover = app("talent/discover-agencies/page.tsx");
  assert.match(discover, /isSoloTalent\(/);
  assert.match(discover, /redirect\(SOLO_TALENT_AGENCY_FALLBACK\)/);
  const events = src("components/admin/shell/internal/talent-drawers/events.tsx");
  assert.match(events, /isAvailable && hasAgency/);
  // No talent rail, phone bar or More sheet lists an agency page.
  const fixtures = src("components/admin/shell/internal/state/fixtures.ts");
  const nav = fixtures.slice(fixtures.indexOf("export const TALENT_PAGES:"), fixtures.indexOf("export const PLAN_META"));
  assert.doesNotMatch(nav, /agenc/i);
  assert.ok(existsSync(join(process.cwd(), "src/lib/talent/solo-talent.ts")));
});
