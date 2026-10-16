/**
 * TUL-225: STOP / HELP handling. The fake admin records every write; nothing touches a database
 * or Twilio.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { handleInboundWhatsApp, isWhatsAppSuppressed } from "./inbound";
import { classifyInboundKeyword, e164FromWhatsAppAddress } from "./keywords";

type Row = Record<string, unknown>;
type Fail = { table: string; op: "select" | "insert" | "update"; code?: string };

/** Minimal chainable stand-in for the three calls the handler makes. */
function fakeAdmin(opts: { consents?: Row[]; fail?: Fail; suppressionCount?: number } = {}) {
  const writes: Array<{ table: string; op: string; row: Row; filters: Row }> = [];
  const admin = {
    from(table: string) {
      const filters: Row = {};
      let op: "select" | "insert" | "update" = "select";
      let row: Row = {};
      const result = () => {
        if (opts.fail && opts.fail.table === table && opts.fail.op === op) return { data: null, count: null, error: { code: opts.fail.code ?? "XX000", message: "boom" } };
        if (op === "select" && table === "whatsapp_consents") return { data: opts.consents ?? [], count: null, error: null };
        if (op === "select") return { data: null, count: opts.suppressionCount ?? 0, error: null };
        writes.push({ table, op, row, filters });
        return { data: null, count: null, error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (r: Row) => {
          op = "insert";
          row = r;
          return q;
        },
        update: (r: Row) => {
          op = "update";
          row = r;
          return q;
        },
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        is: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      return q;
    },
  };
  return { admin: admin as unknown as SupabaseClient, writes };
}

test("keywords: the whole message, any case or accent, is the opt-out; a sentence is a reply", () => {
  for (const word of ["STOP", " baja ", "Cancelar.", "PARAR!", "unsubscribe", "No", "Stop notifications"]) assert.equal(classifyInboundKeyword(word), "stop", word);
  assert.equal(classifyInboundKeyword("AYUDA"), "help");
  assert.equal(classifyInboundKeyword("Help"), "help");
  for (const reply of ["no gracias, a las 5 me va bien", "ok", "gracias", "", null, undefined]) assert.equal(classifyInboundKeyword(reply), null, String(reply));
});

test("e164FromWhatsAppAddress takes Twilio's whatsapp: form and refuses anything else", () => {
  assert.equal(e164FromWhatsAppAddress("whatsapp:+5219981234567"), "+5219981234567");
  assert.equal(e164FromWhatsAppAddress("+14155550100"), "+14155550100");
  assert.equal(e164FromWhatsAppAddress("5219981234567"), null);
  assert.equal(e164FromWhatsAppAddress(null), null);
});

test("STOP suppresses the number (guest row first, then each account) and closes every open consent", async () => {
  const { admin, writes } = fakeAdmin({ consents: [{ user_id: "u1" }, { user_id: "u1" }, { user_id: "u2" }, { user_id: null }] });
  const r = await handleInboundWhatsApp(admin, { from: "whatsapp:+5219981234567", body: "BAJA" });
  assert.equal(r.ok && r.action, "stop");
  const inserts = writes.filter((w) => w.op === "insert");
  assert.deepEqual(inserts.map((w) => w.row.user_id), [null, "u1", "u2"]);
  assert.ok(inserts.every((w) => w.table === "whatsapp_suppressions" && w.row.phone_e164 === "+5219981234567" && w.row.reason === "keyword"));
  const revoke = writes.find((w) => w.op === "update");
  assert.equal(revoke?.table, "whatsapp_consents");
  assert.equal(revoke?.row.revoked_via, "keyword");
  assert.ok(typeof revoke?.row.revoked_at === "string");
  assert.deepEqual(revoke?.filters, { phone_e164: "+5219981234567", revoked_at: null });
  assert.ok(writes.indexOf(inserts[0]) < writes.indexOf(revoke!), "suppress before revoke");
  assert.ok(r.ok && r.reply && /BAJA|WhatsApp/.test(r.reply));
});

test("a repeated STOP (unique violation) is still a success", async () => {
  const { admin } = fakeAdmin({ fail: { table: "whatsapp_suppressions", op: "insert", code: "23505" } });
  const r = await handleInboundWhatsApp(admin, { from: "whatsapp:+5219981234567", body: "stop" });
  assert.equal(r.ok && r.action, "stop");
});

test("a failed suppression write is a failure (Twilio retries), and nothing is revoked", async () => {
  const { admin, writes } = fakeAdmin({ fail: { table: "whatsapp_suppressions", op: "insert" } });
  const r = await handleInboundWhatsApp(admin, { from: "whatsapp:+5219981234567", body: "STOP" });
  assert.deepEqual(r, { ok: false, reason: "unavailable" });
  assert.equal(writes.some((w) => w.op === "update"), false);
});

test("a failed consent read is a failure and writes nothing", async () => {
  const { admin, writes } = fakeAdmin({ fail: { table: "whatsapp_consents", op: "select" } });
  assert.deepEqual(await handleInboundWhatsApp(admin, { from: "whatsapp:+5219981234567", body: "STOP" }), { ok: false, reason: "unavailable" });
  assert.equal(writes.length, 0);
});

test("HELP answers without writing; an ordinary reply or a bad number is ignored", async () => {
  const { admin, writes } = fakeAdmin();
  const help = await handleInboundWhatsApp(admin, { from: "whatsapp:+5219981234567", body: "ayuda" });
  assert.ok(help.ok && help.action === "help" && !!help.reply);
  assert.deepEqual(await handleInboundWhatsApp(admin, { from: "whatsapp:+5219981234567", body: "gracias" }), { ok: true, action: "ignored", reply: null });
  assert.deepEqual(await handleInboundWhatsApp(admin, { from: "garbage", body: "STOP" }), { ok: true, action: "ignored", reply: null });
  assert.equal(writes.length, 0);
});

test("isWhatsAppSuppressed fails CLOSED: an error means do not send", async () => {
  assert.equal(await isWhatsAppSuppressed(fakeAdmin({ suppressionCount: 1 }).admin, "+5219981234567"), true);
  assert.equal(await isWhatsAppSuppressed(fakeAdmin({ suppressionCount: 0 }).admin, "+5219981234567"), false);
  assert.equal(await isWhatsAppSuppressed(fakeAdmin({ fail: { table: "whatsapp_suppressions", op: "select" } }).admin, "+5219981234567"), true);
});

test("the inbound route verifies the Twilio signature before it touches the database", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/webhooks/whatsapp/inbound/route.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const verify = src.indexOf("verifySignature(");
  assert.ok(verify > 0, "route no longer verifies the signature");
  assert.ok(verify < src.indexOf("createServiceRoleClient()"), "service role is opened before the signature is checked");
  assert.ok(verify < src.indexOf("handleInboundWhatsApp("), "the handler runs before the signature is checked");
  assert.match(src, /status: 403/);
});
