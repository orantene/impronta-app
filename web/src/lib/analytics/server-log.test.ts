import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import { __resetHubTenantCacheForTests, logAnalyticsEventServer } from "@/lib/analytics/server-log";

const IMPRONTA_ID = "00000000-0000-0000-0000-000000000001";
const HUB_ID = "99999999-9999-9999-9999-999999999999";

beforeEach(() => __resetHubTenantCacheForTests());

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

test("tenant-less guest event is inserted under the resolved hub id", async () => {
  const { client, rows } = fakeClient();
  await logAnalyticsEventServer({ name: "onboarding_opened", tenantId: null }, client, {
    resolveHub: async () => ({ tenantId: HUB_ID }),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.tenant_id, HUB_ID);
  assert.ok(!JSON.stringify(rows).includes(IMPRONTA_ID));
});

test("an event with a provable tenant is unchanged and never hits the resolver", async () => {
  const { client, rows } = fakeClient();
  const t = "11111111-1111-1111-1111-111111111111";
  let calls = 0;
  await logAnalyticsEventServer({ name: "x", tenantId: t }, client, {
    resolveHub: async () => {
      calls++;
      return { tenantId: HUB_ID };
    },
  });
  assert.equal(rows[0]?.tenant_id, t);
  assert.equal(calls, 0);
});

test("hub lookup failure (null or throw) -> no insert, no throw", async () => {
  const { client, rows } = fakeClient();
  await logAnalyticsEventServer({ name: "x" }, client, { resolveHub: async () => null });
  await logAnalyticsEventServer({ name: "x" }, client, {
    resolveHub: async () => {
      throw new Error("db down");
    },
  });
  assert.equal(rows.length, 0);
});

test("the hub id is resolved once and cached for the process", async () => {
  const { client, rows } = fakeClient();
  let calls = 0;
  const resolveHub = async () => {
    calls++;
    return { tenantId: HUB_ID };
  };
  await logAnalyticsEventServer({ name: "a" }, client, { resolveHub });
  await logAnalyticsEventServer({ name: "b" }, client, { resolveHub });
  assert.equal(calls, 1);
  assert.equal(rows.length, 2);
});
