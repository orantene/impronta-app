/**
 * D-MSG-2 · every client-facing reader of inquiry_messages excludes staff
 * internal notes, and the POS engine writes every staff message to the
 * client thread.
 *
 * Internal notes sit on the client thread ("private") beside the replies so
 * staff see one conversation. That makes the reader-side exclusion the only
 * thing between a note and a client, so this test greps each reader for it.
 * A new client reader must be added to READERS below.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

const NEQ_INTERNAL = /\.neq\(\s*"message_kind",\s*(?:"internal_note"|INTERNAL_NOTE_KIND)\s*\)/;

test("workspace client reader: the client wrapper reads private only and drops internal notes", () => {
  const bridge = src("app/(workspace)/[tenantSlug]/_data-bridge/inquiry-thread-messages.ts");
  const wrapper = bridge.slice(bridge.indexOf("export async function loadClientInquiryMessages"));
  const wrapperBody = wrapper.slice(0, wrapper.indexOf("\n}\n"));
  assert.match(wrapperBody, /CLIENT_THREAD/, "client wrapper must read the client thread");
  assert.match(wrapperBody, /audience:\s*"client"/, "client wrapper must ask for the client audience");
  assert.match(bridge, NEQ_INTERNAL, "loader must exclude internal_note for the client audience");
  assert.match(
    src("app/(workspace)/[tenantSlug]/_data-bridge/inquiries-messages.ts"),
    /loadClientInquiryMessages/,
    "barrel must export the client wrapper",
  );
});

test("client Messages page and /api/client/messages use the client reader, not the staff one", () => {
  for (const rel of [
    "app/(workspace)/[tenantSlug]/client/messages/page.tsx",
    "app/api/client/messages/route.ts",
  ]) {
    const text = src(rel);
    assert.match(text, /loadClientInquiryMessages\(/, `${rel} must call loadClientInquiryMessages`);
    assert.doesNotMatch(text, /\bloadInquiryMessages\(/, `${rel} must not call the staff reader`);
  }
});

test("guest dock reader (also /c/[inquiryId]) reads private and excludes internal notes", () => {
  const guest = src("app/t/[profileCode]/_actions/guest-chat-actions.ts");
  const fn = guest.slice(guest.indexOf("readGuestVisibleMessages"));
  const query = fn.slice(fn.indexOf('.from("inquiry_messages")'), fn.indexOf(".order("));
  assert.match(query, /\.eq\(\s*"thread_type",\s*"private"\s*\)/);
  assert.match(query, NEQ_INTERNAL);
  // /c/[inquiryId] renders through the same reader.
  assert.match(src("app/c/[inquiryId]/page.tsx"), /getGuestThreadMessages/);
});

test("POS token thread (/c/t/[token]) renders customerVisibleMessages, which drops internal and group rows", () => {
  assert.match(src("app/(public)/c/t/[token]/page.tsx"), /customerVisibleMessages\(/);
  const thread = src("lib/messaging/thread.ts");
  const fn = thread.slice(thread.indexOf("export function customerVisibleMessages"));
  assert.match(fn, /!message\.internal/);
  assert.match(fn, /message\.thread === CLIENT_THREAD/);
  assert.match(thread, /internal: row\.message_kind === INTERNAL_NOTE_KIND/);
});

test("talent inbox reader excludes internal notes (a coordinator on private is not staff)", () => {
  const talent = src("app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions.ts");
  const idx = talent.indexOf('.eq("thread_type", threadType)');
  assert.ok(idx > 0);
  assert.match(talent.slice(idx, idx + 600), NEQ_INTERNAL);
});

test("POS engine: replies and internal notes both land on the client thread via the rule", () => {
  const engine = src("lib/server-actions/messaging-engine.ts");
  assert.match(engine, /thread_type:\s*threadTypeForStaffMessage\(input\.kind\)/);
  assert.doesNotMatch(engine, /thread_type:\s*"group"/, "engine must never write the talent thread");
  assert.doesNotMatch(engine, /\?\s*"private"\s*:\s*"group"/, "no kind-keyed thread switch");
  const reply = engine.slice(engine.indexOf("export async function messagingReply"), engine.indexOf("export async function messagingInternalNote"));
  assert.match(reply, /kind:\s*"text"/);
  const note = engine.slice(engine.indexOf("export async function messagingInternalNote"));
  assert.match(note.slice(0, note.indexOf("\n}\n")), /kind:\s*"internal_note"/);
});

test("DB trigger keys conversation state on message_kind, so a note never flips it", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231222000_pos_messaging_state.sql"),
    "utf8",
  );
  const fn = sql.slice(sql.indexOf("messaging_touch_inquiry_from_message"));
  assert.match(fn, /IF NEW\.message_kind = 'internal_note' THEN\s+RETURN NEW;/);
});
