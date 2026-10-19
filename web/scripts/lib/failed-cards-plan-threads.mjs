/**
 * Pure planners for the thread / account fixtures: F1 guest offer, F2 group thread, F7 padded address,
 * F8 client accounts, F9 hidden service, F11 own-talent hub booking, F14 concierge handoff.
 * Every inquiry is a CLONE of a Group-6 inquiry (shape template), with new ids and overrides.
 */
import { EMAILS, PREFIX } from "./group6-fixtures.mjs";
import { fcId } from "./failed-cards-guards.mjs";
import { G6, HUB_TENANT_ID, J, clone, fcBotEmail, fcEmail, insert, isoDays, isoMinutes, offeringOps, update, userOps } from "./failed-cards-ops.mjs";

/** Not an email on purpose (TUL-741): the malformed address the notifier must skip. */
export const MALFORMED_FIXTURE_EMAIL = `${PREFIX}-malformed.impronta.test`;
/** A real bot mailbox stored with trailing whitespace (TUL-741). */
export const PADDED_FIXTURE_EMAIL = `${fcBotEmail("padded")}  `;

function inquiryClone(fx, key, templateId, now, o) {
  return clone(fx, "public.inquiries", `inquiry:${key}`, templateId, {
    id: fcId(`inquiry:${key}`),
    contact_phone: null,
    client_account_id: null,
    current_offer_id: null,
    status: "coordination",
    created_at: isoMinutes(now, -90),
    updated_at: isoMinutes(now, -5),
    event_date: isoDays(now, 21).slice(0, 10),
    ...o,
  });
}

function groupClone(fx, key, templateInquiryId, tenantId) {
  return clone(fx, "public.inquiry_requirement_groups", `reqgroup:${key}`, null, {
    id: fcId(`reqgroup:${key}`), inquiry_id: fcId(`inquiry:${key}`), tenant_id: tenantId,
  }, { whereInquiry: templateInquiryId });
}

function participant(fx, key, tag, templateId, o) {
  return clone(fx, "public.inquiry_participants", `participant:${key}:${tag}`, templateId, {
    id: fcId(`participant:${key}:${tag}`),
    inquiry_id: fcId(`inquiry:${key}`),
    requirement_group_id: fcId(`reqgroup:${key}`),
    ...o,
  });
}

function message(fx, key, tag, templateId, now, minutesAgo, o) {
  return clone(fx, "public.inquiry_messages", `message:${key}:${tag}`, templateId, {
    id: fcId(`message:${key}:${tag}`),
    inquiry_id: fcId(`inquiry:${key}`),
    metadata: {},
    card_payload: null,
    created_at: isoMinutes(now, -minutesAgo),
    edited_at: null,
    deleted_at: null,
    ...o,
  });
}

/** F1 (TUL-280, 954): a signed guest thread on T1 with a SENT $300 MXN offer valid 14 days. */
export function planF1(now) {
  const fx = "F1";
  const k = "f1";
  const gs = fcId("guest_session:f1");
  const offer = fcId("offer:f1");
  return [
    insert(fx, "public.guest_sessions", "guest_session:f1", { id: gs, session_key: fcId("guest_session_key:f1") }),
    inquiryClone(fx, k, G6.inqGuest, now, {
      contact_name: "Lucía Ramírez",
      contact_email: fcBotEmail("guest-offer"),
      client_user_id: null,
      customer_id: null,
      guest_session_id: gs,
      owner_user_id: G6.uT1,
      message: "Hola, quisiera una limpieza profunda para mi departamento antes de fin de mes.",
      source_context: { host_kind: "hub", talent_ids: [G6.t1], referrer_page: "/t/TAL-96001", host_tenant_id: HUB_TENANT_ID },
    }),
    groupClone(fx, k, G6.inqGuest, HUB_TENANT_ID),
    participant(fx, k, "talent", G6.guestPartTalent, { user_id: G6.uT1, talent_profile_id: G6.t1 }),
    participant(fx, k, "client", G6.guestPartClient, { user_id: null, talent_profile_id: null }),
    clone(fx, "public.inquiry_offers", "offer:f1", G6.offerSent, {
      id: offer, inquiry_id: fcId("inquiry:f1"), version: 1, status: "sent", total_client_price: 300, currency_code: "MXN",
      notes: "Limpieza profunda, 3 horas, materiales incluidos.", valid_until: isoDays(now, 14), sent_at: isoMinutes(now, -15),
      accepted_at: null, created_by_user_id: G6.uT1, created_at: isoMinutes(now, -15), updated_at: isoMinutes(now, -15),
    }),
    clone(fx, "public.inquiry_offer_line_items", "offer_line:f1", G6.offerLine, {
      id: fcId("offer_line:f1"), offer_id: offer, talent_profile_id: G6.t1, label: "Limpieza profunda",
      unit_price: 300, total_price: 300, talent_cost: 300, price_snapshot_cents: 30000,
    }),
    update(fx, "public.inquiries", "inquiry:f1:offer", fcId("inquiry:f1"), { current_offer_id: offer, status: "offer_pending" }),
    message(fx, k, "guest1", G6.msgGuest, now, 60, { thread_type: "private", sender_user_id: null, guest_session_id: gs, message_kind: "text", body: "Hola, quisiera una limpieza profunda para mi departamento antes de fin de mes." }),
    message(fx, k, "talent1", G6.msgGuest, now, 40, { thread_type: "private", sender_user_id: G6.uT1, guest_session_id: null, message_kind: "text", body: "Con gusto. Te envio una oferta con el precio y la fecha." }),
    // The offer card: the Group-6 offer card payload with the offer id swapped in (runner patches card_payload).
    message(fx, k, "offer", G6.msgOffer, now, 15, { thread_type: "private", sender_user_id: G6.uT1, guest_session_id: null, card_payload: undefined, metadata: undefined }),
  ].map((op) => (op.key === "message:f1:offer" ? { ...op, row: stripUndefined(op.row), template: { ...op.template, patchJson: { col: "card_payload", from: G6.offerSent, to: offer } } } : op));
}

function stripUndefined(row) {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

/**
 * F2 (TUL-955): a T1 group thread in the F3 studio workspace: client + agency coordinator + two talents
 * (the talent-side Group tab needs 2 talent rows), an original-request message, and T1 rostered in the
 * two F3 workspaces (roster_only, not bookable) so the Agency filter has 2 non-hub agencies.
 */
export function planF2(now, { studioId, studio2Id, studioOwnerUser }) {
  const fx = "F2";
  const k = "f2";
  return [
    insert(fx, "public.agency_talent_roster", "roster:f2:t1:studio", {
      id: fcId("roster:f2:t1:studio"), tenant_id: studioId, talent_profile_id: G6.t1, source_type: "agency_added",
      status: "active", agency_visibility: "roster_only", talent_site_hidden: true, direct_booking_enabled: false, is_primary: false,
    }),
    insert(fx, "public.agency_talent_roster", "roster:f2:t1:studio2", {
      id: fcId("roster:f2:t1:studio2"), tenant_id: studio2Id, talent_profile_id: G6.t1, source_type: "agency_added",
      status: "active", agency_visibility: "roster_only", talent_site_hidden: true, direct_booking_enabled: false, is_primary: false,
    }),
    inquiryClone(fx, k, G6.inqOffer, now, {
      tenant_id: studioId,
      source_workspace_id: studioId,
      contact_name: "qa-fixture Cliente",
      contact_email: EMAILS.client,
      client_user_id: G6.uClient,
      customer_id: null,
      owner_user_id: studioOwnerUser,
      message: "Solicitud: limpieza profunda de una casa de 3 recamaras y 2 banos, sabado por la manana. Tenemos una mascota.",
      source_context: { host_kind: "agency", talent_ids: [G6.t1, G6.t2], host_tenant_id: studioId },
    }),
    groupClone(fx, k, G6.inqOffer, studioId),
    participant(fx, k, "client", G6.partClient, { tenant_id: studioId, user_id: G6.uClient, talent_profile_id: null }),
    participant(fx, k, "coordinator", G6.partClient, { tenant_id: studioId, role: "coordinator", user_id: studioOwnerUser, talent_profile_id: null, owning_party_type: null, owning_party_id: null }),
    participant(fx, k, "talent1", G6.partTalent, { tenant_id: studioId, user_id: G6.uT1, talent_profile_id: G6.t1, sort_order: 0, owning_party_type: "workspace", owning_party_id: studioId }),
    participant(fx, k, "talent2", G6.partTalent, { tenant_id: studioId, user_id: G6.uT2, talent_profile_id: G6.t2, sort_order: 1, owning_party_type: "workspace", owning_party_id: studioId }),
    message(fx, k, "client", G6.msgText, now, 50, { tenant_id: studioId, thread_type: "group", sender_user_id: G6.uClient, message_kind: "text", body: "Hola, les comparto los detalles de la casa. Podrian el sabado?" }),
    message(fx, k, "coordinator", G6.msgText, now, 30, { tenant_id: studioId, thread_type: "group", sender_user_id: studioOwnerUser, message_kind: "text", body: "Claro, coordinamos con el equipo y les confirmamos hoy." }),
  ];
}

/** F7 (TUL-741): two guest inquiries on T1, one to a padded real bot mailbox, one to a malformed address. */
export function planF7(now) {
  const fx = "F7";
  const out = [];
  for (const [k, name, email] of [["f7a", "Daniela Torres", PADDED_FIXTURE_EMAIL], ["f7b", "Jorge Medina", MALFORMED_FIXTURE_EMAIL]]) {
    out.push(
      inquiryClone(fx, k, G6.inqGuest, now, {
        contact_name: name, contact_email: email, client_user_id: null, customer_id: null, guest_session_id: null, owner_user_id: G6.uT1,
        message: "Hola, me interesa una limpieza semanal.",
        source_context: { host_kind: "hub", talent_ids: [G6.t1], referrer_page: "/t/TAL-96001", host_tenant_id: HUB_TENANT_ID },
      }),
      groupClone(fx, k, G6.inqGuest, HUB_TENANT_ID),
      participant(fx, k, "talent", G6.guestPartTalent, { user_id: G6.uT1, talent_profile_id: G6.t1 }),
      participant(fx, k, "client", G6.guestPartClient, { user_id: null, talent_profile_id: null }),
    );
  }
  return out;
}

/** F8 (TUL-767, 1169): an unverified client (password set, email_confirmed_at NULL) and one with a blank name. */
export function planF8() {
  const fx = "F8";
  return [
    ...userOps(fx, "f8-unverified", { email: fcEmail("unverified"), name: "qa-fixture Cliente Sin Verificar", role: "client", confirmed: false, needsPassword: true }),
    insert(fx, "public.client_profiles", "client_profile:f8-unverified", { id: fcId("client_profile:f8-unverified"), user_id: fcId("user:f8-unverified"), preferred_locale: "es" }, ["user_id"]),
    ...userOps(fx, "f8-noname", { email: fcEmail("noname"), name: "qa-fixture Sin Nombre", role: "client", displayName: "" }),
    insert(fx, "public.client_profiles", "client_profile:f8-noname", { id: fcId("client_profile:f8-noname"), user_id: fcId("user:f8-noname"), preferred_locale: "es" }, ["user_id"]),
  ];
}

/** F9 (TUL-847): one unpublished service on T1 (draft), so the live tagline must not name it. */
export function planF9() {
  return offeringOps("F9", "f9-hidden", {
    talentId: G6.t1, tenantId: HUB_TENANT_ID, title: "Limpieza profunda", titleEn: "Deep cleaning",
    description: "Limpieza profunda de toda la casa (borrador, no publicado).", amountCents: 120000, duration: 240, bookingMode: "request",
    status: "draft", visibility: "public", sort: 9,
  }).ops;
}

/** F11 (TUL-571): a C1 hub inquiry + booking on TAL-96003 (the Group-6 workspace owner's own talent seat). */
export function planF11(now) {
  const fx = "F11";
  const k = "f11";
  const bid = fcId("booking:f11");
  const starts = isoDays(now, 4);
  const ends = new Date(new Date(starts).getTime() + 3 * 3600000).toISOString();
  return [
    inquiryClone(fx, k, G6.inqOffer, now, {
      contact_name: "qa-fixture Cliente", contact_email: EMAILS.client, client_user_id: G6.uClient, customer_id: G6.customer,
      owner_user_id: G6.uOwner, message: "Reserva con el talento del estudio (su propio perfil).",
      source_context: { host_kind: "hub", talent_ids: [G6.tOwner], referrer_page: "/t/TAL-96003", host_tenant_id: HUB_TENANT_ID },
    }),
    groupClone(fx, k, G6.inqOffer, HUB_TENANT_ID),
    participant(fx, k, "talent", G6.partTalent, { user_id: G6.uOwner, talent_profile_id: G6.tOwner }),
    participant(fx, k, "client", G6.partClient, { user_id: G6.uClient, talent_profile_id: null }),
    insert(fx, "public.agency_bookings", "booking:f11", {
      id: bid, tenant_id: HUB_TENANT_ID, title: "Limpieza con el talento del estudio", status: "confirmed", starts_at: starts, ends_at: ends,
      currency_code: "MXN", payment_status: "unpaid", total_client_revenue: 800, contact_name: "qa-fixture Cliente", contact_email: EMAILS.client,
      client_user_id: G6.uClient, customer_id: G6.customer, venue_name: "Av. Tulum 100", venue_location_text: "Av. Tulum 100, Cancun",
      timezone: "America/Cancun", source_type_snapshot: "manual", source_inquiry_id: fcId("inquiry:f11"),
      internal_notes: `${PREFIX}: staging fixture (failed-cards F11), safe to delete via --cleanup`, event_date: starts.slice(0, 10),
    }),
    insert(fx, "public.talent_bookings", "talent_booking:f11", {
      id: bid, talent_profile_id: G6.tOwner, tenant_id: HUB_TENANT_ID, title: "Limpieza con el talento del estudio", client_label: "qa-fixture Cliente",
      location_text: "Av. Tulum 100, Cancun", starts_at: starts, ends_at: ends, all_day: false, status: "confirmed", created_by_user_id: G6.uOwner,
    }),
    insert(fx, "public.booking_talent", "booking_talent:f11", {
      id: fcId("booking_talent:f11"), booking_id: bid, talent_profile_id: G6.tOwner, talent_name_snapshot: "qa-fixture Dueno Estudio",
      profile_code_snapshot: "TAL-96003", role_label: "Limpieza", units: 1, talent_cost_rate: 800, client_charge_rate: 800, talent_cost_total: 800, client_charge_total: 800,
    }),
  ];
}

/**
 * F14 (TUL-1155): a talent-site AI chat with an existing handoff and 3 guest follow-ups. It lives in the
 * small F14 workspace whose only active member is a bot mailbox, so the app's "new message" digest for
 * this thread (audience = active workspace members) never reaches a human.
 */
export function planF14(now, { conciergeWs, talentId, talentUser }) {
  const fx = "F14";
  const k = "f14";
  const gs = fcId("guest_session:f14");
  const sys = (type, extra) => ({ system_event_type: type, channel: "guest_popup", from_ai: true, author_kind: "booking_assistant", disclosure_label: "Asistente automatico", ...extra });
  const guest = (tag, mins, body) => message(fx, k, tag, G6.msgGuest, now, mins, { tenant_id: conciergeWs, thread_type: "private", sender_user_id: null, guest_session_id: gs, message_kind: "text", body });
  return [
    insert(fx, "public.guest_sessions", "guest_session:f14", { id: gs, session_key: fcId("guest_session_key:f14") }),
    inquiryClone(fx, k, G6.inqGuest, now, {
      tenant_id: conciergeWs, source_workspace_id: conciergeWs, contact_name: "Paola Núñez", contact_email: fcBotEmail("concierge-guest"),
      client_user_id: null, customer_id: null, guest_session_id: gs, owner_user_id: talentUser, status: "submitted",
      message: "Hola, quiero saber si atienden en Puerto Morelos.",
      source_context: { host_kind: "talent_site", talent_ids: [talentId], guest_locale: "es", host_tenant_id: conciergeWs },
    }),
    groupClone(fx, k, G6.inqGuest, conciergeWs),
    participant(fx, k, "talent", G6.guestPartTalent, { tenant_id: conciergeWs, user_id: talentUser, talent_profile_id: talentId, owning_party_type: "workspace", owning_party_id: conciergeWs }),
    participant(fx, k, "client", G6.guestPartClient, { tenant_id: conciergeWs, user_id: null, talent_profile_id: null }),
    guest("guest1", 70, "Hola, quiero saber si atienden en Puerto Morelos."),
    message(fx, k, "ai1", G6.msgGuest, now, 69, { tenant_id: conciergeWs, thread_type: "private", sender_user_id: null, guest_session_id: null, message_kind: "system_event", body: "Atendemos Cancun y alrededores. Te confirmo los detalles en un momento.", metadata: sys("booking_assistant_reply", {}) }),
    message(fx, k, "handoff", G6.msgGuest, now, 68, { tenant_id: conciergeWs, thread_type: "private", sender_user_id: null, guest_session_id: null, message_kind: "system_event", body: "Le paso tu mensaje a la persona a cargo. Te respondera pronto por aqui.", metadata: sys("booking_assistant_handoff", { handoff_reason: "human_requested" }) }),
    guest("guest2", 40, "Gracias. Tambien quisiera saber el precio de una limpieza profunda."),
    guest("guest3", 25, "Seria para el proximo sabado por la manana."),
    guest("guest4", 10, "Sigo pendiente, gracias."),
  ];
}

export { J };
