/**
 * `resolveTalentSubdomainContext` — the Phase 2 host resolver for
 * `<slug>.tulala.digital`.
 *
 * What matters here is what the resolver REFUSES to do: it must not query for a
 * host that is not exactly one label under a known root, and it must return null
 * (never a half-built context) for any error, empty result or malformed row. A
 * talent subdomain that mis-serves is the worst failure this code can have, so
 * every degrade path is asserted rather than assumed.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { resolveTalentSubdomainContext } from "./host-context";

type RpcCall = { fn: string; args: unknown };

function fakeClient(
  result: { data: unknown; error: unknown },
  calls: RpcCall[] = [],
) {
  return {
    calls,
    client: {
      rpc: (fn: "talent_site_domain_lookup" | "talent_site_subdomain_lookup", args: unknown) => {
        calls.push({ fn, args });
        return Promise.resolve(result as { data: never; error: unknown });
      },
    },
  };
}

const PROFILE = "11111111-2222-3333-4444-555555555555";

test("resolves a published talent subdomain to a talent_site context", async () => {
  const { client, calls } = fakeClient({
    data: [{ talent_profile_id: PROFILE, site_slug: "sofia" }],
    error: null,
  });
  const ctx = await resolveTalentSubdomainContext(client, "sofia.tulala.digital");
  assert.deepEqual(ctx, {
    kind: "talent_site",
    tenantId: null,
    hostname: "sofia.tulala.digital",
    talentProfileId: PROFILE,
    hostKind: "subdomain",
  });
  assert.deepEqual(calls, [
    { fn: "talent_site_subdomain_lookup", args: { p_slug: "sofia" } },
  ]);
});

test("accepts the dev root and a port, and queries the bare label", async () => {
  const { client, calls } = fakeClient({
    data: { talent_profile_id: PROFILE },
    error: null,
  });
  const ctx = await resolveTalentSubdomainContext(client, "sofia.lvh.me:3000");
  assert.equal(ctx?.talentProfileId, PROFILE);
  assert.deepEqual(calls[0]?.args, { p_slug: "sofia" });
});

test("never queries for a host that is not one label under a known root", async () => {
  for (const host of [
    "tulala.digital",
    "admin.acme.tulala.digital",
    "acme.example.com",
    "SOFIA.tulala.digital",
    "",
  ]) {
    const { client, calls } = fakeClient({ data: [{ talent_profile_id: PROFILE }], error: null });
    assert.equal(await resolveTalentSubdomainContext(client, host), null, host);
    assert.equal(calls.length, 0, `${host} must not reach the database`);
  }
});

test("degrades to null on an RPC error, an empty result, or a malformed row", async () => {
  for (const result of [
    { data: null, error: { message: "boom" } },
    { data: [], error: null },
    { data: null, error: null },
    { data: [{ talent_profile_id: null }], error: null },
    { data: [{ talent_profile_id: 42 }], error: null },
    { data: [{}], error: null },
  ]) {
    const { client } = fakeClient(result);
    assert.equal(
      await resolveTalentSubdomainContext(client, "sofia.tulala.digital"),
      null,
      JSON.stringify(result),
    );
  }
});

test("degrades to null when the client throws", async () => {
  const client = {
    rpc: () => {
      throw new Error("network");
    },
  } as unknown as Parameters<typeof resolveTalentSubdomainContext>[0];
  assert.equal(await resolveTalentSubdomainContext(client, "sofia.tulala.digital"), null);
});
