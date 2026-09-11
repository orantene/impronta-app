import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { posDeviceHeartbeat, posOutboxApply } from "./pos-devices";

function rpcAdmin(handler: (fn: string, args: Record<string, unknown>) => unknown) {
  return {
    from: () => {
      throw new Error("no table");
    },
    rpc: async (fn: string, args: Record<string, unknown>) => ({ data: handler(fn, args), error: null }),
  };
}

test("heartbeat maps unknown_device", async () => {
  const result = await posDeviceHeartbeat(
    rpcAdmin((fn) => {
      assert.equal(fn, "pos_device_heartbeat");
      return { ok: false, reason: "unknown_device" };
    }),
    { tenantId: "t1", deviceKey: "device-key-aa", appVersion: "1.0.0" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "unknown_device");
});

test("outbox maps not_replayable", async () => {
  const result = await posOutboxApply(
    rpcAdmin(() => ({ ok: false, reason: "not_replayable" })),
    {
      tenantId: "t1",
      deviceId: "d1",
      operationKey: "outbox-key-aa",
      command: { kind: "card_collect", provider: "stripe" },
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "not_replayable");
});

test("device SQL is cash-only and service_role only", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231228000_pos_devices_outbox.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pos_devices/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pos_outbox/);
  assert.match(sql, /not_replayable/);
  assert.match(sql, /device_id uuid REFERENCES public\.pos_devices/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_outbox_apply/);
});
