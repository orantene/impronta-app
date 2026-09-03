import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveCustomerIdentity,
  type CustomerIdentity,
} from "@/lib/customers/customer-identity";

/**
 * Resolve a workspace-scoped customer from an email or a phone number.
 *
 * THE POINT OF THIS FUNCTION is what it does NOT do: it never creates an
 * `auth.users` row. `ensureGuestClientByEmail` does, on every guest submit,
 * because `agency_client_relationships.client_profile_id` is NOT NULL and a
 * `client_profiles` row requires an account. Production carries the evidence —
 * six of the eight rows in the client list are `menu-qa-<timestamp>@example.com`
 * auth identities minted permanently by menu-order QA runs.
 *
 * A customer is an email or a phone number. `user_id` is something they GAIN if
 * they ever sign up, not a precondition for existing.
 *
 * Idempotent by construction: the unique indexes
 * `customers_tenant_email_key` and `customers_tenant_phone_key` are the
 * concurrency control, so two simultaneous first-orders from the same guest
 * converge on one row instead of racing. Writes run on the service role because
 * `customers` has no INSERT policy by design.
 */

export type EnsureCustomerInput = {
  tenantId: string;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
  /** Set only when the buyer is signed in. Never invented for a guest. */
  userId?: string | null;
  locale?: string | null;
};

export type EnsureCustomerResult =
  | { ok: true; customerId: string; created: boolean; identity: CustomerIdentity }
  | { ok: false; reason: "no_key" | "bad_email" | "bad_phone" | "unavailable"; error: string };

/**
 * `deps.admin` lets a caller pass the client it is already using.
 *
 * Not only for tests. `createPurchase` receives a service-role client and threads
 * it through every write; a helper that quietly builds its OWN client means one
 * logical purchase runs across two connections, and a caller that passes a
 * client has no way to know its customer write went somewhere else. Capacity's
 * wrappers take the same optional-client shape for the same reason.
 */
export async function ensureCustomer(
  input: EnsureCustomerInput,
  deps: { admin?: SupabaseClient | null } = {},
): Promise<EnsureCustomerResult> {
  const resolved = resolveCustomerIdentity({
    email: input.email,
    phone: input.phone,
    displayName: input.displayName,
  });
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason, error: resolved.message };
  }
  const identity = resolved.identity;

  const admin = deps.admin !== undefined ? deps.admin : createServiceRoleClient();
  if (!admin) {
    logServerError("customers.ensureCustomer", "service-role client unavailable");
    return { ok: false, reason: "unavailable", error: "Could not look up the customer." };
  }

  // 1. Existing row? Email is the primary key for a human because it is the
  //    one a receipt is sent to; phone is the fallback.
  const existing = await findCustomer(admin, input.tenantId, identity);
  if (existing.error) {
    logServerError("customers.ensureCustomer/find", existing.error);
    return { ok: false, reason: "unavailable", error: "Could not look up the customer." };
  }

  if (existing.id) {
    // Fill in what we have learned since last time, but NEVER overwrite a
    // known value with null: a guest who orders once with a phone and once
    // without must not lose the phone.
    const patch: Record<string, unknown> = {};
    // Safe: this customer has an email, so `customers_tenant_phone_only_key`
    // (unique only where email IS NULL) does not apply and a shared household
    // number cannot collide.
    if (identity.phoneE164 && !existing.phoneE164) patch.phone_e164 = identity.phoneE164;
    if (identity.email && !existing.email) patch.email = identity.email;
    if (identity.displayName && !existing.displayName) patch.display_name = identity.displayName;
    if (input.userId && !existing.userId) patch.user_id = input.userId;
    if (input.locale && !existing.locale) patch.locale = input.locale;

    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from("customers").update(patch).eq("id", existing.id);
      if (error) {
        // Enriching is best-effort. The customer exists and the order must not
        // fail because we could not add a display name to it.
        logServerError("customers.ensureCustomer/enrich", error);
      }
    }
    return { ok: true, customerId: existing.id, created: false, identity };
  }

  // 2. Create.
  const { data, error } = await admin
    .from("customers")
    .insert({
      tenant_id: input.tenantId,
      email: identity.email,
      phone_e164: identity.phoneE164,
      display_name: identity.displayName,
      user_id: input.userId ?? null,
      locale: input.locale ?? null,
    })
    .select("id")
    .single();

  if (!error && data) {
    return { ok: true, customerId: (data as { id: string }).id, created: true, identity };
  }

  // 3. Lost a race against a concurrent first-order for the same guest. The
  //    unique index did its job; re-read rather than surfacing a 23505 to a
  //    person who is trying to pay.
  if (error && isUniqueViolation(error)) {
    const retry = await findCustomer(admin, input.tenantId, identity);
    if (retry.id) return { ok: true, customerId: retry.id, created: false, identity };
  }

  logServerError("customers.ensureCustomer/insert", error);
  return { ok: false, reason: "unavailable", error: "Could not create the customer." };
}

type FoundCustomer = {
  id: string | null;
  email: string | null;
  phoneE164: string | null;
  displayName: string | null;
  userId: string | null;
  locale: string | null;
  error?: unknown;
};

async function findCustomer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  tenantId: string,
  identity: CustomerIdentity,
): Promise<FoundCustomer> {
  const empty: FoundCustomer = {
    id: null,
    email: null,
    phoneE164: null,
    displayName: null,
    userId: null,
    locale: null,
  };

  const columns = "id, email, phone_e164, display_name, user_id, locale";

  // EMAIL IS THE IDENTITY. Phone is a lookup key ONLY for a customer who has no
  // email at all.
  //
  // Matching on phone whenever it is present looks harmless and is not. Six of
  // the eight client profiles in production share one number, +52 998 400 1234,
  // with six different people behind it — and that is the normal case, not a
  // QA artifact: couples share a mobile, families share a landline, an office
  // shares a switchboard. If this matched on phone for an email-bearing guest,
  // the second person to give the household number would resolve to the FIRST
  // person's customer row and silently inherit their order history, their spend
  // total and their receipts. The same mistake in the backfill dropped five
  // rows and was caught by counting; this one merges two strangers and would
  // not be. See migration 20261228000141.
  const lookups: ReadonlyArray<readonly [string, string]> = identity.email
    ? [["email", identity.email]]
    : identity.phoneE164
      ? [["phone_e164", identity.phoneE164]]
      : [];

  for (const [column, value] of lookups) {
    if (!value) continue;
    const { data, error } = await admin
      .from("customers")
      .select(columns)
      .eq("tenant_id", tenantId)
      .eq(column, value)
      .is("merged_into_id", null)
      .maybeSingle();

    if (error) return { ...empty, error };
    if (data) {
      const row = data as Record<string, string | null>;
      return {
        id: row.id,
        email: row.email,
        phoneE164: row.phone_e164,
        displayName: row.display_name,
        userId: row.user_id,
        locale: row.locale,
      };
    }
  }

  return empty;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}
