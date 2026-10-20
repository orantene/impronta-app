/**
 * TUL-1373: every writer of inquiry_messages that carries text a person (or the
 * booking assistant) typed goes through insertInquiryMessage. This fails when a
 * file writes to the table directly and is not a known SYSTEM writer, so a new
 * writer cannot silently bypass contact masking.
 *
 * SYSTEM writers post platform-generated cards and templated notices (booking and
 * offer events, receipts, reminders' cards, acknowledgements): their text is
 * authored by the platform from structured data, not typed by a person.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const SYSTEM_WRITERS = new Set([
  "src/lib/bookings/transactions.ts",
  "src/lib/call-sheet/actions.ts",
  "src/lib/inquiry/guest-auto-ack.ts",
  "src/lib/inquiry/inquiry-engine-approvals.ts",
  "src/lib/inquiry/inquiry-engine-offers.ts",
  "src/lib/inquiry/inquiry-system-messages.ts",
  "src/lib/messaging/post-payment-cards.ts",
  "src/lib/orders/purchase-thread.ts",
  "src/lib/scheduling/reservation-card.ts",
  "src/lib/server-actions/admin-bookings.ts",
  "src/lib/server-actions/admin-call-sheet.ts",
  "src/lib/server-actions/client-pipeline.ts", // the approve / reject offer_event cards only
]);

const RAW_INSERT = /from\("inquiry_messages"\)\s*\.insert\(/;

function files(): string[] {
  const out = execFileSync("git", ["ls-files", "src"], { cwd: process.cwd(), encoding: "utf8" });
  return out.split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
}

test("no direct insert into inquiry_messages outside the helper and the known system writers", () => {
  const offenders: string[] = [];
  for (const f of files()) {
    if (f === "src/lib/coordinator/masked-message-write.server.ts") continue;
    const src = readFileSync(join(process.cwd(), f), "utf8");
    if (!src.includes("inquiry_messages")) continue;
    if (RAW_INSERT.test(src) && !SYSTEM_WRITERS.has(f)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "route these through insertInquiryMessage (or add a system writer with a reason)");
});

test("the human-text writers use the helper", () => {
  for (const f of [
    "src/lib/inquiry/inquiry-engine-messages.ts",
    "src/app/(workspace)/[tenantSlug]/admin/messages/[inquiryId]/actions.ts",
    "src/app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions.ts",
    "src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts",
    "src/app/(workspace)/[tenantSlug]/client/_actions/client-add-talent-actions.ts",
    "src/app/api/cron/messaging-reminders/route.ts",
    "src/app/api/webhooks/messaging/[channel]/route.ts",
    "src/lib/channels/webhook-handler.ts",
    "src/lib/ai/booking-assistant/turn.server.ts",
    "src/lib/server-actions/client-pipeline.ts",
    "src/lib/server-actions/talent-pipeline.ts",
  ]) {
    assert.match(readFileSync(join(process.cwd(), f), "utf8"), /insertInquiryMessage\(/, f);
  }
});

test("edits go through maskEditedBody, and notifications use what was stored", () => {
  const engine = readFileSync(join(process.cwd(), "src/lib/inquiry/inquiry-engine-messages.ts"), "utf8");
  assert.match(engine, /await maskEditedBody\(/);
  assert.match(engine, /const storedBody = written\.storedBody \?\? ctx\.body/);
  const talent = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions.ts"), "utf8");
  assert.match(talent, /body: storedBody/);
});

test("held migration 420300: restricted originals table, service role writes, platform admin reads, no UI grant", () => {
  const sql = readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231420300_inquiry_message_originals_tul1373.sql"), "utf8");
  const body = sql.replace(/--.*$/gm, "");
  assert.match(body, /CREATE TABLE IF NOT EXISTS public\.inquiry_message_originals/);
  assert.match(body, /ENABLE ROW LEVEL SECURITY/);
  assert.match(body, /FOR SELECT TO authenticated\s+USING \(public\.is_platform_admin\(\)\)/);
  assert.match(body, /REVOKE ALL ON public\.inquiry_message_originals FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(body, /FOR (INSERT|UPDATE|DELETE|ALL)/i);
  assert.doesNotMatch(body, /DROP TABLE|DELETE FROM|UPDATE public/i);
  assert.match(sql, /-- Rollback[\s\S]*DROP TABLE IF EXISTS public\.inquiry_message_originals/);
});

test("no screen or loader reads the originals table", () => {
  for (const f of files()) {
    if (f === "src/lib/coordinator/masked-message-write.server.ts") continue;
    assert.ok(!readFileSync(join(process.cwd(), f), "utf8").includes("inquiry_message_originals"), f);
  }
});
