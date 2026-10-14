/**
 * G1 (client-guest-flow audit 2026-10-13): claim EVERY guest-era record a
 * person left under the email they have now proven.
 *
 * Extends `claimInquiriesByConfirmedEmail` (inquiries, participant seat,
 * relationship, pending approval) with the rows the /account area reads:
 *   - customers.user_id (+ client_profile_id when empty)  -> orders follow the customer
 *   - agency_bookings.client_user_id                      -> visits, receipts
 *   - booking_transactions.payer_user_id                  -> payments
 *   - inquiry_messages.sender_user_id for the guest's own lines (G7)
 *
 * Security contract (callers pass ONLY a proven address: OTP, email link,
 * email_confirmed_at, or a provider identity with email_verified):
 *   1. A row is claimed only while its owner column is NULL (re-checked on the
 *      UPDATE itself), so a row owned by another user is never taken.
 *   2. A row carrying an email is claimed only when that email equals the
 *      verified one (trimmed, case-insensitive, exact: no wildcard match).
 *   3. A row with NO email is claimed only through a parent this user already
 *      owns (booking via owned customer / owned inquiry; payment via owned
 *      booking). A parent with a different email never passes rule 2.
 * Idempotent: every write is guarded by `owner IS NULL`, so re-running on
 * every sign-in rewrites nothing. Never touches amounts, statuses or Stripe.
 */

import { logServerError, logServerExpected } from "@/lib/server/safe-error";

import {
  claimInquiriesByConfirmedEmail,
  ilikeExact,
  normalizeEmail,
  type ClaimByEmailAdmin,
} from "./claim-by-email";

export type ClaimEverythingResult = {
  inquiries: number;
  customers: number;
  bookings: number;
  transactions: number;
  messageThreads: number;
};

type Row = Record<string, unknown>;
/** The service-role client: `rpc` is used for the verified-email customer merge (TUL-691). */
type Admin = ClaimByEmailAdmin & {
  rpc?: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

const EMPTY: ClaimEverythingResult = { inquiries: 0, customers: 0, bookings: 0, transactions: 0, messageThreads: 0 };

function sameEmail(value: unknown, email: string): boolean {
  return typeof value === "string" && normalizeEmail(value) === email;
}

/** Empty email on the row, or the verified email: anything else is someone else. */
function emailAllows(value: unknown, email: string): boolean {
  return value == null || (typeof value === "string" && value.trim() === "") || sameEmail(value, email);
}

async function rows(label: string, query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[] | null> {
  const { data, error } = await query;
  if (error) {
    logServerError(`claimEverything.${label}`, error);
    return null;
  }
  return (data ?? []) as Row[];
}

async function ids(label: string, query: PromiseLike<{ data: unknown; error: unknown }>): Promise<string[]> {
  return ((await rows(label, query)) ?? []).map((r) => String(r.id));
}

export async function claimEverythingForVerifiedEmail(input: {
  admin: Admin;
  userId: string;
  verifiedEmail: string;
}): Promise<ClaimEverythingResult> {
  const email = normalizeEmail(input.verifiedEmail ?? "");
  const { admin, userId } = input;
  if (!email || !userId) return { ...EMPTY };
  const pattern = ilikeExact(email);

  const inq = await claimInquiriesByConfirmedEmail({ admin, userId, verifiedEmail: email }).catch((e) => {
    logServerError("claimEverything.inquiries", e);
    return { claimed: 0 };
  });

  const messageThreads = await reattributeGuestMessages(admin, userId, pattern, email);
  const { claimed: customers, duplicates } = await claimCustomers(admin, userId, pattern, email);
  if (duplicates > 0) await mergeVerifiedCustomers(admin, userId);
  const bookings = await claimBookings(admin, userId, pattern, email);
  const transactions = await claimTransactions(admin, userId, pattern, email);

  return { inquiries: inq.claimed, customers, bookings, transactions, messageThreads };
}

/** G7: the guest's own chat lines on inquiries this user now owns by email. */
async function reattributeGuestMessages(admin: Admin, userId: string, pattern: string, email: string): Promise<number> {
  const owned = await rows(
    "messages.inquiries",
    admin
      .from("inquiries")
      .select("id, contact_email, guest_session_id")
      .eq("client_user_id", userId)
      .ilike("contact_email", pattern)
      .not("guest_session_id", "is", null),
  );
  let threads = 0;
  for (const inq of owned ?? []) {
    if (!sameEmail(inq.contact_email, email) || !inq.guest_session_id) continue;
    // Only lines written by THIS inquiry's guest session, never staff lines.
    const { error } = await admin
      .from("inquiry_messages")
      .update({ sender_user_id: userId })
      .eq("inquiry_id", inq.id)
      .eq("guest_session_id", inq.guest_session_id)
      .is("sender_user_id", null);
    if (error) logServerError("claimEverything.messages.update", error);
    else threads += 1;
  }
  return threads;
}

/**
 * TUL-691: a guest customer row that collided with the user's own row in the
 * same tenant is merged by `merge_verified_client_customers` (service role
 * only). Callers pass only a proven email, so the user is verified here. A
 * failure is logged and never breaks the claim.
 */
async function mergeVerifiedCustomers(admin: Admin, userId: string): Promise<void> {
  if (typeof admin.rpc !== "function") return;
  try {
    const { error } = await admin.rpc("merge_verified_client_customers", { p_user_id: userId });
    if (error) logServerError("claimEverything.customers.merge", error);
  } catch (e) {
    logServerError("claimEverything.customers.merge", e);
  }
}

async function claimCustomers(
  admin: Admin,
  userId: string,
  pattern: string,
  email: string,
): Promise<{ claimed: number; duplicates: number }> {
  const { data: profile, error: profileError } = await admin
    .from("client_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) logServerError("claimEverything.customers.profile", profileError);
  const profileId = (profile?.id as string | undefined) ?? null;

  const candidates = await rows(
    "customers.find",
    admin
      .from("customers")
      .select("id, tenant_id, user_id, client_profile_id, email")
      .is("user_id", null)
      .is("merged_into_id", null)
      .ilike("email", pattern),
  );
  let claimed = 0;
  let duplicates = 0;
  for (const c of candidates ?? []) {
    if (!sameEmail(c.email, email)) continue;
    if (c.client_profile_id && c.client_profile_id !== profileId) continue; // tied to another client profile
    const patch: Row = { user_id: userId };
    if (!c.client_profile_id && profileId) patch.client_profile_id = profileId;
    const { error } = await admin.from("customers").update(patch).eq("id", c.id).is("user_id", null);
    if (error) {
      // customers_tenant_user_key: the user already has a customer row in this
      // tenant. Merged after the loop (TUL-691); bookings still attach.
      if ((error as { code?: string }).code === "23505") {
        duplicates += 1;
        logServerExpected("claimEverything.customers.duplicate", error);
      } else logServerError("claimEverything.customers.update", error);
      continue;
    }
    claimed += 1;
  }
  return { claimed, duplicates };
}

async function claimBookings(admin: Admin, userId: string, pattern: string, email: string): Promise<number> {
  const cols = "id, client_user_id, contact_email";
  const ownedCustomers = await ids("bookings.customers", admin.from("customers").select("id").eq("user_id", userId));
  const ownedInquiries = await ids("bookings.inquiries", admin.from("inquiries").select("id").eq("client_user_id", userId));

  const found = new Map<string, Row>();
  const add = (list: Row[] | null) => (list ?? []).forEach((r) => found.set(String(r.id), r));
  add(await rows("bookings.byEmail", admin.from("agency_bookings").select(cols).is("client_user_id", null).ilike("contact_email", pattern)));
  if (ownedCustomers.length) {
    add(await rows("bookings.byCustomer", admin.from("agency_bookings").select(cols).is("client_user_id", null).in("customer_id", ownedCustomers)));
  }
  if (ownedInquiries.length) {
    add(await rows("bookings.byInquiry", admin.from("agency_bookings").select(cols).is("client_user_id", null).in("source_inquiry_id", ownedInquiries)));
  }

  let claimed = 0;
  for (const b of found.values()) {
    if (b.client_user_id != null || !emailAllows(b.contact_email, email)) continue;
    const { error } = await admin
      .from("agency_bookings")
      .update({ client_user_id: userId })
      .eq("id", b.id)
      .is("client_user_id", null);
    if (error) logServerError("claimEverything.bookings.update", error);
    else claimed += 1;
  }
  return claimed;
}

async function claimTransactions(admin: Admin, userId: string, pattern: string, email: string): Promise<number> {
  const cols = "id, payer_user_id, payer_email";
  const ownedBookings = await ids("tx.bookings", admin.from("agency_bookings").select("id").eq("client_user_id", userId));
  const found = new Map<string, Row>();
  const add = (list: Row[] | null) => (list ?? []).forEach((r) => found.set(String(r.id), r));
  add(await rows("tx.byEmail", admin.from("booking_transactions").select(cols).is("payer_user_id", null).ilike("payer_email", pattern)));
  if (ownedBookings.length) {
    add(await rows("tx.byBooking", admin.from("booking_transactions").select(cols).is("payer_user_id", null).in("booking_id", ownedBookings)));
  }
  let claimed = 0;
  for (const tx of found.values()) {
    if (tx.payer_user_id != null || !emailAllows(tx.payer_email, email)) continue;
    // Ownership only: amounts, status and provider fields are never in the patch.
    const { error } = await admin
      .from("booking_transactions")
      .update({ payer_user_id: userId })
      .eq("id", tx.id)
      .is("payer_user_id", null);
    if (error) logServerError("claimEverything.tx.update", error);
    else claimed += 1;
  }
  return claimed;
}
