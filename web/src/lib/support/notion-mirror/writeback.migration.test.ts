/**
 * Static grant hygiene for TUL-45 writeback RPCs.
 * Pattern: 20261231281000_revoke_anon_subdomain_namespace_probe.sql —
 * revoking PUBLIC alone leaves direct anon/authenticated EXECUTE from
 * ALTER DEFAULT PRIVILEGES.
 *
 * Run: npx tsx --test src/lib/support/notion-mirror/writeback.migration.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "../../../../../supabase/migrations");

const WRITEBACK = readdirSync(MIGRATIONS_DIR).find((f) =>
  f.endsWith("_support_tickets_notion_mirror_writeback.sql"),
);

assert.ok(WRITEBACK, "writeback migration must exist");

const VERSION = WRITEBACK!.slice(0, WRITEBACK!.indexOf("_"));
const SQL = readFileSync(join(MIGRATIONS_DIR, WRITEBACK!), "utf8");

const SERVICE_ROLE_DEFINERS = [
  "list_support_tickets_notion_mirror_due(int)",
  "mark_support_ticket_notion_mirrored(uuid, text)",
  "mark_support_ticket_notion_mirror_failed(uuid)",
] as const;

test("writeback migration version is a 14-digit timestamp (not 15)", () => {
  assert.match(VERSION, /^\d{14}$/);
  assert.notEqual(VERSION.length, 15);
  // Must sort after the already-applied bookkeeping migration on main.
  assert.ok(
    VERSION > "20261231349000",
    `expected ${VERSION} > 20261231349000`,
  );
});

test("writeback SECURITY DEFINER RPCs revoke public, anon, authenticated", () => {
  for (const fn of SERVICE_ROLE_DEFINERS) {
    const escaped = fn.replace(/[()]/g, "\\$&");
    assert.match(
      SQL,
      new RegExp(
        `revoke all on function public\\.${escaped}\\s+from public, anon, authenticated;`,
        "i",
      ),
      `${fn} must revoke PUBLIC + anon + authenticated (default privileges grant direct anon EXECUTE)`,
    );
    assert.match(
      SQL,
      new RegExp(`grant execute on function public\\.${escaped} to service_role;`, "i"),
      `${fn} must grant service_role only`,
    );
  }
});

test("writeback does not leave a PUBLIC-only revoke (the 281000 hole)", () => {
  const weak = SQL.match(
    /revoke all on function public\.(list_support_tickets_notion_mirror_due|mark_support_ticket_notion_mirrored|mark_support_ticket_notion_mirror_failed)\([^)]*\)\s+from public\s*;/gi,
  );
  assert.equal(
    weak,
    null,
    "REVOKE ... FROM public; alone leaves anon/authenticated direct grants",
  );
});

test("writeback leaves the applied bookkeeping migration untouched", () => {
  const bookkeeping = join(
    MIGRATIONS_DIR,
    "20261231349000_support_tickets_notion_mirror.sql",
  );
  const book = readFileSync(bookkeeping, "utf8");
  assert.match(book, /add column if not exists notion_page_id/);
  assert.doesNotMatch(SQL, /drop column.*notion_page_id/i);
});

test("writeback dead-letters after 5 failures with backoff (cannot block queue)", () => {
  assert.match(SQL, /notion_sync_fail_count integer not null default 0/i);
  assert.match(SQL, /t\.notion_sync_fail_count < 5/i);
  assert.match(SQL, /make_interval\(mins => least\(60,/i);
  assert.match(
    SQL,
    /notion_sync_fail_count = case[\s\S]*then 1[\s\S]*\+ 1/i,
  );
  assert.match(SQL, /notion_sync_fail_count = 0/);
});
