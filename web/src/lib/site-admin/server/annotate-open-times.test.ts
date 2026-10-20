import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { annotateOpenTimes } from "./annotate-open-times";

// A client that fails on any use proves no query was made.
const noQueries = new Proxy({}, {
  get() {
    throw new Error("unexpected query");
  },
}) as unknown as SupabaseClient;

// Catches: a page view paying availability queries for services that can never show times.
test("house-owned and on_request services are false without any query", async () => {
  const list = [
    { id: "a", talentProfileId: null },
    { id: "b", talentProfileId: "t", visibility: "on_request" },
  ] as Array<{ id: string; talentProfileId: string | null; visibility?: string; hasOpenTimes?: boolean | null }>;
  await annotateOpenTimes(noQueries, list, { host: { kind: "agency", tenantId: "x" } });
  assert.deepEqual(list.map((o) => o.hasOpenTimes), [false, false]);
});

// Catches: an outage reading as "no times" and hiding a bookable service.
test("a failing probe leaves the flag unknown and probes at most three", async () => {
  const list = Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, talentProfileId: "t" })) as Array<{
    id: string;
    talentProfileId: string;
    hasOpenTimes?: boolean | null;
  }>;
  await annotateOpenTimes(noQueries, list, { host: { kind: "agency", tenantId: "x" } });
  assert.deepEqual(list.map((o) => o.hasOpenTimes), [undefined, undefined, undefined, undefined, undefined]);
});
