/**
 * TUL-691: duplicate customer rows merge only for a VERIFIED auth email, only
 * inside one (tenant, owner) pool, and only through the service role.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SQL = readFileSync(
  join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations/20261231372200_merge_verified_client_customers.sql"),
  "utf8",
);

test("merges only when the auth email is confirmed", () => {
  assert.match(SQL, /email_confirmed_at IS NOT NULL/);
  assert.match(SQL, /IF v_email IS NULL THEN\s+RETURN 0;/);
});

test("never crosses tenants or talent-owned pools", () => {
  assert.match(SQL, /PARTITION BY tenant_id, owner_talent_profile_id/);
  assert.match(SQL, /l\.tenant_id = s\.tenant_id/);
  assert.match(SQL, /l\.owner_talent_profile_id IS NOT DISTINCT FROM s\.owner_talent_profile_id/);
});

test("never takes a row owned by another user or tied to another client profile", () => {
  assert.match(SQL, /c\.user_id = p_user_id OR \(c\.user_id IS NULL AND lower\(btrim\(c\.email\)\) = v_email\)/);
  assert.match(SQL, /c\.client_profile_id IS NULL OR c\.client_profile_id = v_profile_id/);
});

test("re-points every customer_id reference before marking the loser merged", () => {
  for (const t of ["inquiries", "agency_bookings", "orders", "admissions", "tenant_promo_redemptions", "conversation_identity", "entitlement_credits", "customer_payment_methods"]) {
    assert.match(SQL, new RegExp("UPDATE public\\." + t + " SET customer_id = s\\.survivor_id"), t);
  }
  assert.ok(SQL.indexOf("SET merged_into_id") > SQL.indexOf("UPDATE public.orders SET customer_id"));
});

test("service role only: definer with pinned search_path, revoked from anon and authenticated", () => {
  assert.match(SQL, /SECURITY DEFINER/);
  assert.match(SQL, /SET search_path = ''/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.merge_verified_client_customers\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.merge_verified_client_customers\(uuid\) TO service_role/);
});
