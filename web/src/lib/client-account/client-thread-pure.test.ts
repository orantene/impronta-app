// TUL-1258: the client thread must never open as chip + reply box only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildClientThread, clientThreadBody } from "./client-thread-pure";

const ME = "user-1";
const inquiry = { id: "inq-1", message: "Hola, busco fotógrafo para el sábado", created_at: "2026-10-01T10:00:00Z" };

test("an empty thread still leads with the client's own request", () => {
  const out = buildClientThread([], inquiry, ME);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.mine, true);
  assert.equal(out[0]?.body, inquiry.message);
  assert.equal(out[0]?.id, "inquiry-request:inq-1");
});

test("the request is not duplicated when the client's identical message is already a row", () => {
  const rows = [{ id: "m1", body: inquiry.message, created_at: "2026-10-01T10:00:01Z", sender_user_id: ME }];
  const out = buildClientThread(rows, inquiry, ME);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "m1");
});

test("replies keep their order after the request and mark sides correctly", () => {
  const rows = [
    { id: "m1", body: "Claro, el sábado va bien", created_at: "2026-10-01T11:00:00Z", sender_user_id: "staff-9" },
    { id: "m2", body: "Perfecto", created_at: "2026-10-01T12:00:00Z", sender_user_id: ME },
  ];
  const out = buildClientThread(rows, inquiry, ME);
  assert.deepEqual(out.map((m) => [m.id, m.mine]), [["inquiry-request:inq-1", true], ["m1", false], ["m2", true]]);
});

test("a card row with no body reads its payload title and summary; a bare card is skipped", () => {
  const rows = [
    { id: "c1", body: "", created_at: "2026-10-01T11:00:00Z", sender_user_id: "staff-9", message_kind: "quote", card_payload: { title: "Cotización", summary: "MXN 1,200" } },
    { id: "c2", body: "", created_at: "2026-10-01T11:05:00Z", sender_user_id: "staff-9", message_kind: "basket", card_payload: {} },
  ];
  const out = buildClientThread(rows, { id: "i", message: null, created_at: null }, ME);
  assert.deepEqual(out.map((m) => m.id), ["c1"]);
  assert.equal(out[0]?.body, "Cotización\nMXN 1,200");
});

test("no request and no rows is an honestly empty thread (the page then shows its empty line)", () => {
  assert.deepEqual(buildClientThread([], { id: "i", message: "  ", created_at: "2026-10-01T10:00:00Z" }, ME), []);
  assert.equal(clientThreadBody({ body: null, card_payload: null }), "");
});

test("loadThread uses the pure builder and selects the fields it needs", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/client-account/area-data.server.ts"), "utf8");
  assert.match(src, /buildClientThread\(/);
  assert.match(src, /select\("id, company, message, created_at"\)/);
  assert.match(src, /message_kind, card_payload/);
});
