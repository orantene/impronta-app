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

/**
 * Per WRITER, not per file: each entry is the exact number of raw writes a file
 * may keep, and why. A file that also has a human-text writer (client-pipeline.ts
 * sends the client's own message) therefore cannot hide behind its system cards:
 * its human writer uses the helper, and only the counted card writes stay raw.
 */
const SYSTEM_WRITES: Record<string, number> = {
  "src/lib/bookings/transactions.ts": 7,
  "src/lib/call-sheet/actions.ts": 1,
  "src/lib/inquiry/guest-auto-ack.ts": 1,
  "src/lib/inquiry/inquiry-engine-approvals.ts": 1,
  "src/lib/inquiry/inquiry-engine-offers.ts": 5,
  "src/lib/inquiry/inquiry-system-messages.ts": 2,
  "src/lib/messaging/post-payment-cards.ts": 2,
  "src/lib/orders/purchase-thread.ts": 2,
  "src/lib/scheduling/reservation-card.ts": 2,
  "src/lib/server-actions/admin-bookings.ts": 1,
  "src/lib/server-actions/admin-call-sheet.ts": 1,
  "src/lib/server-actions/client-pipeline.ts": 2, // the approve / reject offer_event cards only
  // The ONE raw update of a body: editMessage stores what maskEditedBody returned.
  "src/lib/inquiry/inquiry-engine-messages.ts": 1,
};

// insert, upsert, or an update that sets the body, on inquiry_messages (single or multi line chains)
const RAW_WRITE = /from\("inquiry_messages"\)\s*\.(?:insert|upsert)\(|from\("inquiry_messages"\)\s*\.update\(\{\s*body/g;

function files(): string[] {
  const out = execFileSync("git", ["ls-files", "src"], { cwd: process.cwd(), encoding: "utf8" });
  return out.split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
}

test("every raw write to inquiry_messages is accounted for, per writer: nothing new, nothing extra in a known file", () => {
  const found: Record<string, number> = {};
  for (const f of files()) {
    if (f === "src/lib/coordinator/masked-message-write.server.ts") continue;
    const src = readFileSync(join(process.cwd(), f), "utf8");
    if (!src.includes("inquiry_messages")) continue;
    const n = (src.match(RAW_WRITE) ?? []).length;
    if (n > 0) found[f] = n;
  }
  assert.deepEqual(found, SYSTEM_WRITES, "route new writers through insertInquiryMessage; a known file may not gain a raw write");
});

test("the matcher catches insert, upsert and update-of-body, single and multi line", () => {
  const re = (s: string) => (s.match(RAW_WRITE) ?? []).length;
  assert.equal(re('x.from("inquiry_messages").insert({'), 1);
  assert.equal(re('x\n  .from("inquiry_messages")\n  .insert({'), 1);
  assert.equal(re('x.from("inquiry_messages").upsert(rows)'), 1);
  assert.equal(re('x.from("inquiry_messages").update({ body: b })'), 1);
  assert.equal(re('x.from("inquiry_messages")\n.update({\n body: b })'), 1);
  assert.equal(re('x.from("inquiry_messages").update({ metadata: m })'), 0);
  assert.equal(re('x.from("inquiry_messages").select("id")'), 0);
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

// Privileged paths that may name the originals table. Each needs a reason.
const ORIGINALS_TABLE_ALLOWED: Record<string, string> = {
  "src/lib/coordinator/masked-message-write.server.ts": "the one writer of the originals",
  "src/lib/account/anonymize.ts": "account erasure purge (#4183, TUL-1416): deletes this person's originals, never shows them",
};

test("no screen or loader reads the originals table", () => {
  for (const f of files()) {
    if (f in ORIGINALS_TABLE_ALLOWED) continue;
    assert.ok(!readFileSync(join(process.cwd(), f), "utf8").includes("inquiry_message_originals"), f);
  }
});
