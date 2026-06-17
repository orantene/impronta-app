import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTalentSiteContext,
  type TalentSiteEdgeClient,
} from "./host-context";

function clientReturning(
  data: unknown,
  error: unknown = null,
): TalentSiteEdgeClient {
  return {
    rpc: () => Promise.resolve({ data: data as never, error }),
  };
}

test("resolves an active talent custom domain to a talent_site context", async () => {
  const client = clientReturning([
    { talent_profile_id: "talent-42", site_slug: "jane", domain: "jane.com" },
  ]);
  const ctx = await resolveTalentSiteContext(client, "jane.com");
  assert.deepEqual(ctx, {
    kind: "talent_site",
    tenantId: null,
    hostname: "jane.com",
    talentProfileId: "talent-42",
  });
});

test("tolerates the RPC returning a single object instead of an array", async () => {
  const client = clientReturning({ talent_profile_id: "talent-7" });
  const ctx = await resolveTalentSiteContext(client, "x.com");
  assert.equal(ctx?.talentProfileId, "talent-7");
});

test("an empty RPC result yields null (host falls through to not_found)", async () => {
  assert.equal(await resolveTalentSiteContext(clientReturning([]), "x.com"), null);
  assert.equal(await resolveTalentSiteContext(clientReturning(null), "x.com"), null);
});

test("a malformed row (missing/empty talent_profile_id) yields null — never mis-serves", async () => {
  assert.equal(
    await resolveTalentSiteContext(clientReturning([{ site_slug: "x" }]), "x.com"),
    null,
  );
  assert.equal(
    await resolveTalentSiteContext(clientReturning([{ talent_profile_id: "" }]), "x.com"),
    null,
  );
});

test("an RPC error yields null (degrade-safe)", async () => {
  const ctx = await resolveTalentSiteContext(
    clientReturning(null, { message: "boom" }),
    "x.com",
  );
  assert.equal(ctx, null);
});

test("an RPC that throws yields null (never propagates)", async () => {
  const throwingClient: TalentSiteEdgeClient = {
    rpc: () => {
      throw new Error("network down");
    },
  };
  const ctx = await resolveTalentSiteContext(throwingClient, "x.com");
  assert.equal(ctx, null);
});
