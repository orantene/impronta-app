/**
 * Customers and messaging (all @example.test). Workspace `customers` rows are keyed by email OR phone per tenant (unique indexes), so:
 *   - guest with no account: email only, user_id NULL.        - verified account: a confirmed login linked through customers.user_id.
 *   - household: ONE phone, different emails. The unique index (tenant, phone_e164) allows the phone on one customer row only; the second
 *     household member has a different email and carries the phone in notes + a household tag. The shared phone is also on the catering
 *     inquiry contact (money cluster) so a matcher has a real second place to see it.
 *   - same email in an agency pool and a talent pool: one customer row in T3 (agency) and one in T4 (the salon whose stylists are talent);
 *     the platform has no separate "talent pool" table on main, so a pool = a workspace.
 *   - unsubscribe: guest_email_unsubscribes (natural key = normalized email, no id) + the matching customer row.
 *   - account deletion: a confirmed client login + a PENDING account_deletion_requests row already past its 14-day grace, so the
 *     process-account-deletions cron executes it when the tester triggers it.
 * BLOCKED, no table exists on main or in _pending_pm: the WhatsApp suppression / consent ledger (Phase 5 G5.2, "consent ledger on
 * customer_id" is a future held migration that has no file yet).
 */
import { createHash } from "node:crypto";
import { email, insert, isoDays, s2Id, userOps } from "./stage2-ops.mjs";
import { T1_WS } from "./stage2-plan-t1.mjs";
import { T3_WS } from "./stage2-plan-t3.mjs";
import { T4_WS } from "./stage2-plan-t4.mjs";

export const HOUSEHOLD_PHONE = "+529981230001";
export const SHARED_EMAIL = email("c-shared");
export const UNSUB_EMAIL = email("c-unsub");
export const BLOCKED_WHATSAPP = { item: "WhatsApp suppression row", version: "none yet", file: "no migration file exists (consent ledger = Phase 5 G5.2, not yet written)" };

const customer = (fx, key, ws, o) =>
  insert(fx, "public.customers", `customer:${key}`, {
    id: s2Id(`customer:${key}`), tenant_id: ws, email: o.email ?? null, phone_e164: o.phone ?? null, display_name: o.name, locale: o.locale ?? "es",
    ...(o.userKey ? { user_id: s2Id(`user:${o.userKey}`) } : {}), ...(o.notes ? { notes: o.notes } : {}), ...(o.tags ? { tags: o.tags } : {}),
  });

export function planCustomers(at) {
  const fx = "CU";
  const ops = [
    ...userOps(fx, "c-verified", { email: email("c-verified"), name: "Verónica Cliente", appRole: "client" }),
    ...userOps(fx, "c-delete", { email: email("c-delete"), name: "Daniel Baja", appRole: "client" }),
    customer(fx, "guest", T1_WS, { email: email("c-guest"), name: "Gabriela Invitada" }),
    customer(fx, "verified", T1_WS, { email: email("c-verified"), name: "Verónica Cliente", userKey: "c-verified" }),
    customer(fx, "hh-1", T1_WS, { email: email("c-hh-a"), phone: HOUSEHOLD_PHONE, name: "Hogar Pérez A", tags: ["household"] }),
    customer(fx, "hh-2", T1_WS, { email: email("c-hh-b"), name: "Hogar Pérez B", tags: ["household"], notes: `Shares the phone ${HOUSEHOLD_PHONE} with Hogar Pérez A (one phone, two emails).` }),
    customer(fx, "unsub", T1_WS, { email: UNSUB_EMAIL, name: "Ulises Baja de correos" }),
    insert(fx, "public.guest_email_unsubscribes", "unsub:c-unsub", {
      email_normalized: UNSUB_EMAIL, token: createHash("sha256").update(`s2-unsub:${UNSUB_EMAIL}`).digest("hex").slice(0, 32), unsubscribed_at: at.toISOString(),
    }, ["email_normalized"]),
    customer(fx, "delete", T1_WS, { email: email("c-delete"), name: "Daniel Baja", userKey: "c-delete" }),
    insert(fx, "public.account_deletion_requests", "deletion:c-delete", {
      id: s2Id("deletion:c-delete"), user_id: s2Id("user:c-delete"), surface: "client", requested_at: isoDays(at, -15), status: "pending",
    }),
    // The same person in an agency pool (T3) and in a talent-side pool (T4).
    customer(fx, "shared-agency", T3_WS, { email: SHARED_EMAIL, name: "Samuel Compartido" }),
    customer(fx, "shared-salon", T4_WS, { email: SHARED_EMAIL, name: "Samuel Compartido", locale: "en" }),
  ];
  const unsub = ops.find((o) => o.table === "public.guest_email_unsubscribes");
  unsub.natural = "email_normalized";
  return ops;
}
