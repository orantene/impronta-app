/**
 * UNIT TEST — resolveTenantReplyTo (2026-09-05).
 *
 * Pins the contract that decides whether a customer's Reply reaches a human:
 * a tenant WITH agency_business_identity.contact_email gets that header, a
 * tenant WITHOUT one gets NO header at all.
 *
 * Why the empty case matters as much as the populated one: leaving Reply-To
 * unset means a reply goes to the From address, which today is
 * noreply@tulala.digital — a domain with no MX, so it bounces. That is bad,
 * but it is the honest status quo. Inventing an address would be worse: the
 * customer would believe they had replied to someone. So "no contact email"
 * must produce undefined, never a fallback.
 *
 * Run: npx tsx --test src/lib/email/reply-to.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { resolveTenantReplyTo } from "./resend-client";

/** Minimal Supabase stub: .from().select().eq().maybeSingle() */
function stubAdmin(row: { contact_email?: string | null } | null, error = false) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: row,
                  error: error ? { message: "boom" } : null,
                }),
              };
            },
          };
        },
      };
    },
  };
}


const TENANT = "00000000-0000-0000-0000-000000000001";

describe("resolveTenantReplyTo", () => {
  it("returns the tenant's contact email when set", async () => {
    const resolve = (t: string | null) => resolveTenantReplyTo(t, { admin: stubAdmin({ contact_email: "hola@agency.com" }) });
    assert.equal(await resolve(TENANT), "hola@agency.com");
  });

  it("trims surrounding whitespace", async () => {
    const resolve = (t: string | null) => resolveTenantReplyTo(t, { admin: stubAdmin({ contact_email: "  hola@agency.com  " }) });
    assert.equal(await resolve(TENANT), "hola@agency.com");
  });

  it("returns undefined when the column is empty — header stays unset, no invented address", async () => {
    const resolve = (t: string | null) => resolveTenantReplyTo(t, { admin: stubAdmin({ contact_email: "   " }) });
    assert.equal(await resolve(TENANT), undefined);
  });

  it("returns undefined when the column is null", async () => {
    const resolve = (t: string | null) => resolveTenantReplyTo(t, { admin: stubAdmin({ contact_email: null }) });
    assert.equal(await resolve(TENANT), undefined);
  });

  it("returns undefined when the tenant has no identity row", async () => {
    const resolve = (t: string | null) => resolveTenantReplyTo(t, { admin: stubAdmin(null) });
    assert.equal(await resolve(TENANT), undefined);
  });

  it("returns undefined for a platform send (no tenant) without touching the DB", async () => {
    let touched = false;
    const admin = { from() { touched = true; throw new Error("should not query"); } };
    const resolve = (t: string | null) => resolveTenantReplyTo(t, { admin });
    assert.equal(await resolve(null), undefined);
    assert.equal(touched, false);
  });

  it("degrades to undefined on a DB error rather than throwing into the send path", async () => {
    const resolve = (t: string | null) => resolveTenantReplyTo(t, { admin: stubAdmin(null, true) });
    assert.equal(await resolve(TENANT), undefined);
  });
});
