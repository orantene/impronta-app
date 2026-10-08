import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

test("TUL-315: migration adds the partial unique index and never fails on old duplicates", () => {
  const sql = read("../../../../supabase/migrations/20261231352000_support_messages_client_send_key_unique.sql");
  assert.match(sql, /create unique index if not exists support_messages_client_send_key_uq/);
  assert.match(sql, /on public\.support_messages \(ticket_id, \(metadata ->> 'client_send_key'\)\)/);
  assert.match(sql, /where metadata \? 'client_send_key'/);
  assert.match(sql, /having count\(\*\) > 1/);
  assert.match(sql, /raise notice/);
});

test("TUL-315: the engine treats a 23505 on that index as the already-appended message", () => {
  const engine = read("support-engine.ts");
  assert.match(engine, /code === "23505"/);
  assert.match(engine, /findMessageByClientSendKey\(admin, working\.id, sendKey\)/);
});

test("TUL-315: every reader of the inbound secret goes through supportInboundSecret", () => {
  for (const f of ["support-inbound-append.server.ts", "support-outbound-threading.ts"]) {
    const src = read(f);
    assert.match(src, /supportInboundSecret/);
    assert.doesNotMatch(src, /process\.env\.GUEST_COOKIE_SECRET|env\.GUEST_COOKIE_SECRET/);
  }
});
