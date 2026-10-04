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

  it("falls back to pay.tulala.digital when the tenant has no live website domain", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      }),
    };
    const origin = await resolveAgendaPayPublicOrigin(
      admin,
      "tenant-hub-no-site",
      "https://app.tulala.digital",
    );
    assert.equal(origin, "https://pay.tulala.digital");
  });

  it("uses a published talent free website when the tenant has no agency domain", async () => {
    const admin = {
      from: (table: string) => ({
        select: () => ({
          eq: async () => {
            if (table === "agency_domains") return { data: [], error: null };
            if (table === "talent_sites") {
              return {
                data: [{ site_slug: "book-jorgelina", status: "published" }],
                error: null,
              };
            }
            return { data: [], error: null };
          },
        }),
      }),
    };
    const origin = await resolveAgendaPayPublicOrigin(
      admin,
      "40081ec3-5ca8-43a0-b50b-31c927b2716b",
      "https://app.tulala.digital",
      { talentProfileId: "f048e578-cbae-45db-9a3b-34239abea136" },
    );
    assert.equal(origin, "https://book-jorgelina.tulala.digital");
  });

  it("ignores hub platform rows when choosing a branded website host", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [
              {
                hostname: "pay.tulala.digital",
                kind: "hub",
                is_primary: false,
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
      "40081ec3-5ca8-43a0-b50b-31c927b2716b",
      "https://app.tulala.digital",
    );
    assert.equal(origin, "https://pay.tulala.digital");
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
