/**
 * Money rows. PRE-MADE history is kept to the one thing a lane cannot create cheaply: a catering inquiry with a SENT offer (a catalog
 * line + a 30% deposit). Everything that moves money is created LIVE in Stripe TEST during QA and is deliberately NOT seeded:
 *   - completed paid booking            -> book + pay with pm_card_visa
 *   - manual-payment booking            -> book, then mark received as a manager
 *   - refunded ticket with a redeemed included item -> buy a DJ/Cena + Show ticket, check in, redeem, refund
 * (A seeded order or refund would need a provider event behind it; a row without one is evidence of nothing.)
 *
 * PRE-MADE: `inquiry:t1-catering` and everything under it are fixture history, listed as such in the write list.
 * The inquiry, group, participants and offer are CLONES of the Group-6 shapes (same technique as #4048's F2) with new s2 ids.
 */
import { G6, clone, isoDays, s2Id, update } from "./stage2-ops.mjs";
import { HOUSEHOLD_PHONE } from "./stage2-plan-customers.mjs";
import { T1_WS } from "./stage2-plan-t1.mjs";

export const CATERING_TOTAL = 4980; // 20 x the MXN 249 taco experience, in currency units like the Group-6 offer (300 = MXN 300)
export const CATERING_DEPOSIT_PCT = 30;
export const CATERING_DEPOSIT_CENTS = Math.round(CATERING_TOTAL * 100 * CATERING_DEPOSIT_PCT / 100);

const minutes = (now, n) => new Date(now.getTime() + n * 60000).toISOString();

export function planMoney(now) {
  const fx = "MO";
  const ws = T1_WS;
  const inq = s2Id("inquiry:t1-catering");
  const offer = s2Id("offer:t1-catering");
  const group = s2Id("reqgroup:t1-catering");
  const manager = s2Id("user:t1-manager");
  return [
    clone(fx, "public.inquiries", "inquiry:t1-catering", G6.inqOffer, {
      id: inq, tenant_id: ws, source_workspace_id: ws, contact_name: "Verónica Cliente", contact_email: "s2-c-verified@example.test", contact_phone: HOUSEHOLD_PHONE,
      client_user_id: s2Id("user:c-verified"), customer_id: s2Id("customer:verified"), client_account_id: null, guest_session_id: null, owner_user_id: manager,
      current_offer_id: null, status: "coordination", created_at: minutes(now, -90), updated_at: minutes(now, -5), event_date: isoDays(now, 21).slice(0, 10),
      message: "Evento de empresa para 20 personas: experiencia de tacos con barra de bebidas sin alcohol.",
      source_context: { host_kind: "agency", talent_ids: [], host_tenant_id: ws },
    }),
    clone(fx, "public.inquiry_requirement_groups", "reqgroup:t1-catering", null, { id: group, inquiry_id: inq, tenant_id: ws }, { whereInquiry: G6.inqOffer }),
    clone(fx, "public.inquiry_participants", "participant:t1-catering:client", G6.partClient, {
      id: s2Id("participant:t1-catering:client"), inquiry_id: inq, requirement_group_id: group, tenant_id: ws, user_id: s2Id("user:c-verified"), talent_profile_id: null,
    }),
    clone(fx, "public.inquiry_participants", "participant:t1-catering:house", G6.partClient, {
      id: s2Id("participant:t1-catering:house"), inquiry_id: inq, requirement_group_id: group, tenant_id: ws, role: "house", user_id: null, talent_profile_id: null,
      owning_party_type: "workspace", owning_party_id: ws,
    }),
    clone(fx, "public.inquiry_offers", "offer:t1-catering", G6.offerSent, {
      id: offer, inquiry_id: inq, tenant_id: ws, version: 1, status: "sent", total_client_price: CATERING_TOTAL, currency_code: "MXN", notes: "Experiencia de tacos para 20 personas, barra sin alcohol.",
      valid_until: isoDays(now, 14), sent_at: minutes(now, -15), accepted_at: null, created_by_user_id: manager, created_at: minutes(now, -15), updated_at: minutes(now, -15),
      deposit_pct: CATERING_DEPOSIT_PCT, deposit_amount_cents: CATERING_DEPOSIT_CENTS, balance_collection_method: "request_in_messages", refund_policy_key: "flexible",
    }),
    // A house line: the payee is the workspace (owner_tenant_id), the source is a CATALOG offering (source_service_id), no talent.
    clone(fx, "public.inquiry_offer_line_items", "offer_line:t1-catering", G6.offerLine, {
      id: s2Id("offer_line:t1-catering"), offer_id: offer, tenant_id: ws, talent_profile_id: null, owner_tenant_id: ws, source_service_id: s2Id("offering:t1-tacos-exp"),
      label: "Experiencia de tacos x 20", unit_price: CATERING_TOTAL, total_price: CATERING_TOTAL, talent_cost: 0, price_snapshot_cents: CATERING_TOTAL * 100,
    }),
    update(fx, "public.inquiries", "inquiry:t1-catering:offer", inq, { current_offer_id: offer, status: "offer_pending" }),
  ];
}
