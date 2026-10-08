import test from "node:test";
import assert from "node:assert/strict";

import { logAnalyticsEventServer, PLATFORM_ANALYTICS_TENANT_ID } from "@/lib/analytics/server-log";

function fakeClient() {
  const rows: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => {
      assert.equal(table, "analytics_events");
      return {
        insert: async (row: Record<string, unknown>) => {
          rows.push(row);
          return { error: null };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, rows };
}

test("guest event (no tenant) is stored under the platform tenant, never a null tenant_id", async () => {
  const { client, rows } = fakeClient();
  await logAnalyticsEventServer({ name: "onboarding_opened", tenantId: null }, client);
  assert.equal(rows[0]?.tenant_id, PLATFORM_ANALYTICS_TENANT_ID);
});

test("an event with a provable tenant keeps it", async () => {
  const { client, rows } = fakeClient();
  const t = "11111111-1111-1111-1111-111111111111";
  await logAnalyticsEventServer({ name: "onboarding_opened", tenantId: t }, client);
  assert.equal(rows[0]?.tenant_id, t);
});
