/**
 * TUL-225 Phase 1 PR 1: the WhatsApp channel tables are service-role only and encode the
 * consent and suppression rules from docs/plans/whatsapp-channel-design.md section 4.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const MIGRATION = "../supabase/migrations/20261231400900_whatsapp_channel_foundation.sql";
/** SQL with -- comments removed, lowercased. */
const sql = readFileSync(MIGRATION, "utf8").replace(/--[^\n]*/g, "").toLowerCase();
const TABLES = ["whatsapp_consents", "whatsapp_suppressions", "whatsapp_templates", "whatsapp_message_status"];

test("every table has RLS on, no policy, and no anon/authenticated access", () => {
  for (const t of TABLES) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t} \\(`), t);
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
    assert.match(sql, new RegExp(`revoke all on table public\\.${t} from anon, authenticated`), t);
  }
  assert.doesNotMatch(sql, /create policy/);
  assert.doesNotMatch(sql, /\bgrant\b/);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)/);
});

test("consent: a subject is required, revocation is a pair, one open consent per account and audience", () => {
  assert.match(sql, /check \(user_id is not null or guest_ref is not null\)/);
  assert.match(sql, /check \(\(revoked_at is null\) = \(revoked_via is null\)\)/);
  assert.match(sql, /create unique index if not exists whatsapp_consents_open_user_uq\s+on public\.whatsapp_consents \(user_id, audience\)\s+where revoked_at is null and user_id is not null/);
  assert.match(sql, /consent_text_snapshot text not null/);
});

test("numbers are E.164 in both consents and suppressions", () => {
  const checks = sql.match(/phone_e164 text not null check \(phone_e164 ~ '\^\\\+\[1-9\]\[0-9\]\{6,14\}\$'\)/g) ?? [];
  assert.equal(checks.length, 2);
});

test("suppression: one row per number and account, a guest STOP counted once", () => {
  assert.match(sql, /unique nulls not distinct \(phone_e164, user_id\)/);
});

test("templates are unique per provider, key and locale and start pending; receipts are unique per provider message", () => {
  assert.match(sql, /unique \(provider, template_key, locale\)/);
  assert.match(sql, /status text not null default 'pending' check \(status in \('pending', 'approved', 'rejected', 'paused', 'disabled'\)\)/);
  assert.match(sql, /unique \(provider, provider_message_id\)/);
  assert.match(sql, /status text not null check \(status in \('queued', 'sent', 'delivered', 'read', 'failed'\)\)/);
  assert.match(sql, /references public\.notification_dispatch_log\(id\) on delete set null/);
});

test("the migration only creates its own tables", () => {
  assert.doesNotMatch(sql, /alter table public\.(?!whatsapp_)/);
  assert.doesNotMatch(sql, /\bdrop\b/);
});
