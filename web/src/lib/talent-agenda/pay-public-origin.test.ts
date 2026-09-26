import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { payOriginNeedsTenantHost, resolveAgendaPayPublicOrigin } from "./pay-public-origin";

describe("agenda pay public origin", () => {
  it("flags app / marketing / preview hosts as needing a tenant host", () => {
    assert.equal(payOriginNeedsTenantHost("https://app.tulala.digital"), true);
    assert.equal(payOriginNeedsTenantHost("https://tulala.digital"), true);
    assert.equal(payOriginNeedsTenantHost("https://www.tulala.digital"), true);
    assert.equal(payOriginNeedsTenantHost("https://tulala-xxx.vercel.app"), true);
    assert.equal(payOriginNeedsTenantHost("https://qa-stripe-r2.tulala.digital"), false);
    assert.equal(payOriginNeedsTenantHost("https://impronta.tulala.digital"), false);
  });

  it("rewrites app origin to the tenant's live agency domain", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [
              {
                hostname: "qa-stripe-r2.tulala.digital",
                kind: "subdomain",
                is_primary: true,
                status: "active",
              },
            ],
            error: null,
          }),
        }),
      }),
    };
    const origin = await resolveAgendaPayPublicOrigin(
      admin,
      "tenant-1",
      "https://app.tulala.digital",
    );
    assert.equal(origin, "https://qa-stripe-r2.tulala.digital");
  });

  it("keeps a capable requested origin without hitting the DB path result", async () => {
    let called = false;
    const admin = {
      from: () => {
        called = true;
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      },
    };
    const origin = await resolveAgendaPayPublicOrigin(
      admin,
      "tenant-1",
      "https://qa-stripe-r2.tulala.digital/",
    );
    assert.equal(origin, "https://qa-stripe-r2.tulala.digital");
    assert.equal(called, false);
  });
});
