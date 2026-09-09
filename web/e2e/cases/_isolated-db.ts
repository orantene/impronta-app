/**
 * Service-role reads against qa-journeys only. Refuses production.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const JOURNEYS_TENANT_ID = "33333333-3333-4333-8333-333333333333";

/**
 * Workspace B's real records, for the direction of isolation that an EMPTY
 * second workspace cannot test.
 *
 * With B empty, a cross-workspace attempt could only name a UUID that exists
 * nowhere — and then a refusal proves nothing, because "not found" and
 * "forbidden" are the same response. These ids are rows that genuinely exist
 * and genuinely belong to someone else, so a refusal is authorization rather
 * than absence. Seeded by the workspace B section of
 * `supabase/seed_journeys_program.sql`.
 */
export const JOURNEYS_B_TENANT_ID = "33333333-3333-4333-8333-333333333334";
export const JOURNEYS_B_ORDER_ID = "33330031-0000-4000-8000-0000000000b1";
export const JOURNEYS_B_OFFERING_ID = "33330012-0000-4000-8000-0000000000b2";
export const JOURNEYS_B_CUSTOMER_ID = "33330030-0000-4000-8000-0000000000b1";
export const JOURNEYS_B_SPACE_ID = "33330011-0000-4000-8000-0000000000b1";
export const JOURNEYS_B_POOL_ID = "33330020-0000-4000-8000-0000000000b1";
export const JOURNEYS_B_OWNER_EMAIL = "qa-journeys-b-owner@impronta.test";

/**
 * Proof that B's fixture is actually present, so a case can refuse to run
 * rather than pass because the thing it wanted to reach was never seeded.
 */
export async function workspaceBFixturePresent(): Promise<boolean> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("orders")
    .select("id, tenant_id, total_cents, status")
    .eq("id", JOURNEYS_B_ORDER_ID)
    .maybeSingle();
  if (error || !data) return false;
  const row = data as { tenant_id: string; total_cents: number; status: string };
  return row.tenant_id === JOURNEYS_B_TENANT_ID && Number(row.total_cents) === 900;
}

export function isolatedService(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (url.includes("pluhdapdnuiulvxmyspd") || /impronta/i.test(url)) {
    throw new Error("isolated db helper refuses production / Impronta");
  }
  if (!url.includes("fxlankepwnvelxjrahwk")) {
    throw new Error("isolated db helper requires the qa-journeys project ref");
  }
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type PaidPosPizza = {
  orderId: string;
  status: string;
  totalCents: number;
  sourceChannel: string;
  customerEmail: string | null;
  lineLabel: string | null;
};

export type PosPizzaPickup = PaidPosPizza & {
  ticketId: string | null;
  destination: string | null;
  ticketStatus: string | null;
  promisedAt: string | null;
  handedOffAt: string | null;
};

export type MenuPizzaOrder = PaidPosPizza & {
  bookingId: string | null;
};

export async function latestPaidPosPizza(email: string): Promise<PaidPosPizza | null> {
  const admin = isolatedService();
  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id, email")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", email)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);
  if (!customer) return null;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, status, total_cents, source_channel, customer_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("customer_id", customer.id)
    .eq("source_channel", "pos")
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order) return null;

  const { data: line, error: lineErr } = await admin
    .from("order_lines")
    .select("label, total_cents")
    .eq("order_id", order.id)
    .maybeSingle();
  if (lineErr) throw new Error(lineErr.message);

  return {
    orderId: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    sourceChannel: order.source_channel,
    customerEmail: (customer.email as string | null) ?? null,
    lineLabel: (line?.label as string | null) ?? null,
  };
}

export type GuestDirectoryInquiry = {
  inquiryId: string;
  status: string;
  contactEmail: string | null;
  contactName: string | null;
  message: string | null;
  sourceChannel: string | null;
  sourcePage: string | null;
};

export async function latestGuestDirectoryInquiry(
  email: string,
): Promise<GuestDirectoryInquiry | null> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("inquiries")
    .select("id, status, contact_email, contact_name, message, source_channel, source_page")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("contact_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    inquiryId: String(data.id),
    status: String(data.status),
    contactEmail: (data.contact_email as string | null) ?? null,
    contactName: (data.contact_name as string | null) ?? null,
    message: (data.message as string | null) ?? null,
    sourceChannel: (data.source_channel as string | null) ?? null,
    sourcePage: (data.source_page as string | null) ?? null,
  };
}

export const QA_JOURNEYS_TALENT_ID = "33330003-0000-4000-8000-000000000001";

export async function latestC08DirectoryInquiry(): Promise<GuestDirectoryInquiry | null> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("inquiries")
    .select("id, status, contact_email, contact_name, message, source_channel, source_page")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .like("contact_email", "c08-cus-%@impronta.test")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    inquiryId: String(data.id),
    status: String(data.status),
    contactEmail: (data.contact_email as string | null) ?? null,
    contactName: (data.contact_name as string | null) ?? null,
    message: (data.message as string | null) ?? null,
    sourceChannel: (data.source_channel as string | null) ?? null,
    sourcePage: (data.source_page as string | null) ?? null,
  };
}

export async function inquiryLineupTalentIds(inquiryId: string): Promise<string[]> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("inquiry_participants")
    .select("talent_profile_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .is("removed_at", null);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => row.talent_profile_id as string | null)
    .filter((id): id is string => !!id);
}

export async function latestAssignedDirectoryInquiry(): Promise<{
  inquiryId: string;
  contactEmail: string | null;
  status: string;
  talentIds: string[];
  offerId: string | null;
  offerStatus: string | null;
} | null> {
  const admin = isolatedService();
  const { data: part, error: partErr } = await admin
    .from("inquiry_participants")
    .select("inquiry_id, talent_profile_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("role", "talent")
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (partErr) throw new Error(partErr.message);
  if (!part?.inquiry_id) return null;
  const inquiryId = String(part.inquiry_id);
  const { data: inq, error: inqErr } = await admin
    .from("inquiries")
    .select("id, status, contact_email")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inqErr) throw new Error(inqErr.message);
  const talentIds = await inquiryLineupTalentIds(inquiryId);
  const offer = await latestInquiryOffer(inquiryId);
  return {
    inquiryId,
    contactEmail: (inq?.contact_email as string | null) ?? null,
    status: String(inq?.status ?? ""),
    talentIds,
    offerId: offer?.offerId ?? null,
    offerStatus: offer?.status ?? null,
  };
}

export async function latestInquiryOffer(inquiryId: string): Promise<{
  offerId: string;
  status: string;
  totalClientPrice: number | null;
  sentAt: string | null;
} | null> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("inquiry_offers")
    .select("id, status, total_client_price, sent_at")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    offerId: String(data.id),
    status: String(data.status),
    totalClientPrice:
      data.total_client_price == null ? null : Number(data.total_client_price),
    sentAt: (data.sent_at as string | null) ?? null,
  };
}

export async function inquiryOfferLines(offerId: string): Promise<{
  talentProfileId: string | null;
  totalPrice: number;
}[]> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("inquiry_offer_line_items")
    .select("talent_profile_id, total_price")
    .eq("offer_id", offerId)
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    talentProfileId: (row.talent_profile_id as string | null) ?? null,
    totalPrice: Number(row.total_price ?? 0),
  }));
}

export async function latestSentDirectoryInquiry(): Promise<{
  inquiryId: string;
  contactEmail: string | null;
  inquiryStatus: string;
  offerId: string;
  offerStatus: string;
  totalClientPrice: number | null;
  sentAt: string | null;
} | null> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("inquiry_offers")
    .select("id, status, total_client_price, sent_at, inquiry_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.inquiry_id) return null;
  const { data: inq, error: inqErr } = await admin
    .from("inquiries")
    .select("id, status, contact_email")
    .eq("id", data.inquiry_id)
    .maybeSingle();
  if (inqErr) throw new Error(inqErr.message);
  return {
    inquiryId: String(data.inquiry_id),
    contactEmail: (inq?.contact_email as string | null) ?? null,
    inquiryStatus: String(inq?.status ?? ""),
    offerId: String(data.id),
    offerStatus: String(data.status),
    totalClientPrice:
      data.total_client_price == null ? null : Number(data.total_client_price),
    sentAt: (data.sent_at as string | null) ?? null,
  };
}

export async function inquiryOfferApprovalCount(offerId: string): Promise<number> {
  const admin = isolatedService();
  const { count, error } = await admin
    .from("inquiry_approvals")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offerId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function inquiryOfferApprovals(offerId: string): Promise<{
  role: string;
  status: string;
  userId: string | null;
  talentProfileId: string | null;
}[]> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("inquiry_approvals")
    .select("status, participant_id")
    .eq("offer_id", offerId);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const out: {
    role: string;
    status: string;
    userId: string | null;
    talentProfileId: string | null;
  }[] = [];
  for (const row of rows) {
    const { data: part, error: partErr } = await admin
      .from("inquiry_participants")
      .select("role, user_id, talent_profile_id")
      .eq("id", row.participant_id)
      .maybeSingle();
    if (partErr) throw new Error(partErr.message);
    out.push({
      role: String(part?.role ?? ""),
      status: String(row.status),
      userId: (part?.user_id as string | null) ?? null,
      talentProfileId: (part?.talent_profile_id as string | null) ?? null,
    });
  }
  return out;
}

/** Newest sent offer that still waits on QA Journeys Talent. */
export async function latestSentOfferAwaitingTalent(): Promise<{
  inquiryId: string;
  contactEmail: string | null;
  contactName: string | null;
  inquiryStatus: string;
  offerId: string;
  offerStatus: string;
  totalClientPrice: number | null;
} | null> {
  const admin = isolatedService();
  const { data: parts, error: partErr } = await admin
    .from("inquiry_participants")
    .select("id, inquiry_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("role", "talent")
    .eq("talent_profile_id", QA_JOURNEYS_TALENT_ID)
    .eq("status", "active");
  if (partErr) throw new Error(partErr.message);
  const participantIds = (parts ?? []).map((row) => String(row.id));
  if (participantIds.length === 0) return null;

  const { data: pending, error: pendingErr } = await admin
    .from("inquiry_approvals")
    .select("offer_id, inquiry_id, created_at")
    .in("participant_id", participantIds)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  if (pendingErr) throw new Error(pendingErr.message);

  for (const row of pending ?? []) {
    const { data: offer, error: offerErr } = await admin
      .from("inquiry_offers")
      .select("id, status, total_client_price")
      .eq("id", row.offer_id)
      .eq("status", "sent")
      .maybeSingle();
    if (offerErr) throw new Error(offerErr.message);
    if (!offer) continue;
    const { data: inq, error: inqErr } = await admin
      .from("inquiries")
      .select("id, status, contact_email, contact_name")
      .eq("id", row.inquiry_id)
      .maybeSingle();
    if (inqErr) throw new Error(inqErr.message);
    if (!inq) continue;
    return {
      inquiryId: String(inq.id),
      contactEmail: (inq.contact_email as string | null) ?? null,
      contactName: (inq.contact_name as string | null) ?? null,
      inquiryStatus: String(inq.status ?? ""),
      offerId: String(offer.id),
      offerStatus: String(offer.status),
      totalClientPrice:
        offer.total_client_price == null ? null : Number(offer.total_client_price),
    };
  }
  return null;
}

/** Newest sent offer the client can finish — talent already accepted. */
export async function latestOfferReadyForClientAccept(): Promise<{
  inquiryId: string;
  contactEmail: string | null;
  contactName: string | null;
  inquiryStatus: string;
  offerId: string;
  offerStatus: string;
  totalClientPrice: number | null;
} | null> {
  const admin = isolatedService();
  const { data: parts, error: partErr } = await admin
    .from("inquiry_participants")
    .select("id, inquiry_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("role", "talent")
    .eq("talent_profile_id", QA_JOURNEYS_TALENT_ID)
    .eq("status", "active");
  if (partErr) throw new Error(partErr.message);
  const participantIds = (parts ?? []).map((row) => String(row.id));
  if (participantIds.length === 0) return null;

  const { data: accepted, error: acceptedErr } = await admin
    .from("inquiry_approvals")
    .select("offer_id, inquiry_id, decided_at")
    .in("participant_id", participantIds)
    .eq("status", "accepted")
    .order("decided_at", { ascending: false })
    .limit(20);
  if (acceptedErr) throw new Error(acceptedErr.message);

  for (const row of accepted ?? []) {
    const { data: offer, error: offerErr } = await admin
      .from("inquiry_offers")
      .select("id, status, total_client_price")
      .eq("id", row.offer_id)
      .eq("status", "sent")
      .maybeSingle();
    if (offerErr) throw new Error(offerErr.message);
    if (!offer) continue;
    const approvals = await inquiryOfferApprovals(String(offer.id));
    const client = approvals.find((item) => item.role === "client");
    if (client?.status !== "pending") continue;
    const { data: inq, error: inqErr } = await admin
      .from("inquiries")
      .select("id, status, contact_email, contact_name")
      .eq("id", row.inquiry_id)
      .maybeSingle();
    if (inqErr) throw new Error(inqErr.message);
    if (!inq) continue;
    return {
      inquiryId: String(inq.id),
      contactEmail: (inq.contact_email as string | null) ?? null,
      contactName: (inq.contact_name as string | null) ?? null,
      inquiryStatus: String(inq.status ?? ""),
      offerId: String(offer.id),
      offerStatus: String(offer.status),
      totalClientPrice:
        offer.total_client_price == null ? null : Number(offer.total_client_price),
    };
  }
  return null;
}

export const TABLE_1_SPACE_ID = "33330011-0000-4000-8000-000000000001";

export type TabCollectAtClose = PaidPosPizza & {
  sourcePage: string | null;
  visitId: string | null;
  visitStatus: string | null;
  serviceKind: string | null;
  spaceId: string | null;
  closedAt: string | null;
};

export async function latestOpenTable1Visit(): Promise<{
  visitId: string;
  publicToken: string;
  serviceKind: string | null;
} | null> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("visits")
    .select("id, public_token, service_kind")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("space_id", TABLE_1_SPACE_ID)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    visitId: String(data.id),
    publicToken: String(data.public_token),
    serviceKind: (data.service_kind as string | null) ?? null,
  };
}

/** Close leftover Table 1 visits so C07 can reopen the floor. */
export async function releaseTable1Floor(): Promise<void> {
  const admin = isolatedService();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("visits")
    .update({ status: "closed", closed_at: now, updated_at: now })
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("space_id", TABLE_1_SPACE_ID)
    .eq("status", "open");
  if (error) throw new Error(error.message);
}

export async function latestTabCollectAtClose(email: string): Promise<TabCollectAtClose | null> {
  const paid = await latestPaidPosPizza(email);
  if (!paid) return null;
  const admin = isolatedService();
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("source_page, visit_id, space_id")
    .eq("id", paid.orderId)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order?.visit_id) return null;

  const { data: visit, error: visitErr } = await admin
    .from("visits")
    .select("id, status, service_kind, space_id, closed_at")
    .eq("id", order.visit_id)
    .maybeSingle();
  if (visitErr) throw new Error(visitErr.message);

  return {
    ...paid,
    sourcePage: (order.source_page as string | null) ?? null,
    visitId: (visit?.id as string | null) ?? null,
    visitStatus: (visit?.status as string | null) ?? null,
    serviceKind: (visit?.service_kind as string | null) ?? null,
    spaceId: (visit?.space_id as string | null) ?? null,
    closedAt: (visit?.closed_at as string | null) ?? null,
  };
}

export async function latestPosPizzaPickup(email: string): Promise<PosPizzaPickup | null> {
  const paid = await latestPaidPosPizza(email);
  if (!paid) return null;
  const admin = isolatedService();
  const { data: ticket, error } = await admin
    .from("preparation_tickets")
    .select("id, destination, status, promised_at, handed_off_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("order_id", paid.orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    ...paid,
    ticketId: (ticket?.id as string | null) ?? null,
    destination: (ticket?.destination as string | null) ?? null,
    ticketStatus: (ticket?.status as string | null) ?? null,
    promisedAt: (ticket?.promised_at as string | null) ?? null,
    handedOffAt: (ticket?.handed_off_at as string | null) ?? null,
  };
}

export async function latestMenuPizza(email: string): Promise<MenuPizzaOrder | null> {
  const admin = isolatedService();
  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id, email")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", email)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);
  if (!customer) return null;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, status, total_cents, source_channel, customer_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("customer_id", customer.id)
    .eq("source_channel", "menu")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order) return null;

  const { data: line, error: lineErr } = await admin
    .from("order_lines")
    .select("label, total_cents")
    .eq("order_id", order.id)
    .maybeSingle();
  if (lineErr) throw new Error(lineErr.message);

  const { data: booking, error: bookingErr } = await admin
    .from("agency_bookings")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("order_id", order.id)
    .maybeSingle();
  if (bookingErr) throw new Error(bookingErr.message);

  return {
    orderId: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    sourceChannel: order.source_channel,
    customerEmail: (customer.email as string | null) ?? null,
    lineLabel: (line?.label as string | null) ?? null,
    bookingId: (booking?.id as string | null) ?? null,
  };
}

/** The four "Two-to-four tops" the reserve_table block sells against. */
export const TABLE_GROUP_POOL_ID = "33330020-0000-4000-8000-000000000002";

export type TableReservation = {
  orderId: string;
  status: string;
  sourceChannel: string;
  customerEmail: string | null;
  admissionId: string | null;
  partySize: number | null;
  totalCents: number;
  /**
   * The payment deadline. Must be null on a confirmed reservation: a lapsed
   * one is what `decideOrderExpiry` cancels.
   */
  holdExpiresAt: string | null;
  /**
   * `committed` or `hold`. A reservation the guest was told is confirmed must
   * be `committed`, because `remaining()` counts a hold only while
   * `expires_at > now()` — an uncommitted table is resellable in 15 minutes.
   */
  allocationState: string | null;
  allocationExpiresAt: string | null;
};

export async function latestTableReservation(email: string): Promise<TableReservation | null> {
  const admin = isolatedService();
  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id, email")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", email)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);
  if (!customer) return null;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, status, source_channel, total_cents, hold_expires_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("customer_id", customer.id)
    .eq("source_channel", "reservation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order) return null;

  const { data: line, error: lineErr } = await admin
    .from("order_lines")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();
  if (lineErr) throw new Error(lineErr.message);

  const { data: admission, error: admissionErr } = line
    ? await admin
        .from("admissions")
        .select("id, party_size")
        .eq("tenant_id", JOURNEYS_TENANT_ID)
        .eq("order_line_id", line.id)
        .maybeSingle()
    : { data: null, error: null };
  if (admissionErr) throw new Error(admissionErr.message);

  const { data: alloc, error: allocErr } = line
    ? await admin
        .from("capacity_allocations")
        .select("state, expires_at")
        .eq("order_line_id", line.id)
        .eq("pool_id", TABLE_GROUP_POOL_ID)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };
  if (allocErr) throw new Error(allocErr.message);

  return {
    orderId: order.id,
    status: order.status,
    sourceChannel: order.source_channel,
    customerEmail: (customer.email as string | null) ?? null,
    admissionId: (admission?.id as string | null) ?? null,
    partySize: admission ? Number(admission.party_size) : null,
    totalCents: Number(order.total_cents ?? 0),
    holdExpiresAt: (order.hold_expires_at as string | null) ?? null,
    allocationState: (alloc?.state as string | null) ?? null,
    allocationExpiresAt: (alloc?.expires_at as string | null) ?? null,
  };
}

/**
 * Give the tables back after a reservation journey.
 *
 * NOT tidiness. A confirmed reservation now COMMITS its table — which is the
 * point of the fix, and which means each run of the reservation journeys
 * permanently consumes one of the four "Two-to-four tops". Four runs closed
 * the 15:00 seating for good, and the fifth failed with an empty widget that
 * looked exactly like the availability bug it was not.
 *
 * Before the fix the same pool drained a slower way: the holds were never
 * committed, so they lapsed and `reap_capacity_allocations` cleared them —
 * which is why this was invisible until the reservation actually held.
 *
 * Same shape and same reason as `releaseTable1Floor` above: the harness
 * releases what the harness booked, using the fixture's own ids, so no
 * assertion depends on how many times the suite has run.
 */
export async function releaseJourneyTableReservations(): Promise<void> {
  const admin = isolatedService();
  const { data: orders, error: orderErr } = await admin
    .from("orders")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("source_channel", "reservation")
    .in("status", ["paid", "pending_payment"]);
  if (orderErr) throw new Error(orderErr.message);
  const orderIds = (orders ?? []).map((o) => String(o.id));
  if (orderIds.length === 0) return;

  const { data: lines, error: lineErr } = await admin
    .from("order_lines")
    .select("id")
    .in("order_id", orderIds);
  if (lineErr) throw new Error(lineErr.message);
  const lineIds = (lines ?? []).map((l) => String(l.id));

  if (lineIds.length > 0) {
    const now = new Date().toISOString();
    const { error: allocErr } = await admin
      .from("capacity_allocations")
      .update({ state: "released", released_at: now })
      .eq("pool_id", TABLE_GROUP_POOL_ID)
      .in("order_line_id", lineIds)
      .in("state", ["hold", "committed"]);
    if (allocErr) throw new Error(allocErr.message);
  }

  const { error: cancelErr } = await admin
    .from("orders")
    .update({ status: "cancelled", hold_expires_at: null })
    .in("id", orderIds);
  if (cancelErr) throw new Error(cancelErr.message);
}

/** One guest who reserved a table and then ordered — same customer, two orders. */
export async function latestReserveThenOrder(email: string): Promise<{
  customerId: string;
  reservation: TableReservation;
  menu: MenuPizzaOrder;
} | null> {
  const reservation = await latestTableReservation(email);
  const menu = await latestMenuPizza(email);
  if (!reservation || !menu) return null;

  const admin = isolatedService();
  const { data: customer, error } = await admin
    .from("customers")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!customer) return null;

  return {
    customerId: customer.id as string,
    reservation,
    menu,
  };
}

export const MORNING_CLASS_SESSION_ID = "33330013-0000-4000-8000-000000000001";
export const LAST_PLACE_CLASS_SESSION_ID = "33330013-0000-4000-8000-000000000003";
export const LAST_PLACE_CLASS_POOL_ID = "33330020-0000-4000-8000-000000000006";

export type ClassWalkIn = {
  orderId: string;
  status: string;
  totalCents: number;
  sourceChannel: string;
  customerEmail: string | null;
  lineLabel: string | null;
  sessionId: string | null;
  allocationId: string | null;
  allocationState: string | null;
  poolId: string | null;
};

async function latestClassOrder(email: string, channel: string): Promise<ClassWalkIn | null> {
  const admin = isolatedService();
  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id, email")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", email)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);
  if (!customer) return null;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, status, total_cents, source_channel")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("customer_id", customer.id)
    .eq("source_channel", channel)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order) return null;

  const { data: line, error: lineErr } = await admin
    .from("order_lines")
    .select("id, label, session_id, total_cents")
    .eq("order_id", order.id)
    .maybeSingle();
  if (lineErr) throw new Error(lineErr.message);

  const { data: alloc, error: allocErr } = line
    ? await admin
        .from("capacity_allocations")
        .select("id, state, pool_id")
        .eq("tenant_id", JOURNEYS_TENANT_ID)
        .eq("order_line_id", line.id)
        .maybeSingle()
    : { data: null, error: null };
  if (allocErr) throw new Error(allocErr.message);

  return {
    orderId: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    sourceChannel: order.source_channel,
    customerEmail: (customer.email as string | null) ?? null,
    lineLabel: (line?.label as string | null) ?? null,
    sessionId: (line?.session_id as string | null) ?? null,
    allocationId: (alloc?.id as string | null) ?? null,
    allocationState: (alloc?.state as string | null) ?? null,
    poolId: (alloc?.pool_id as string | null) ?? null,
  };
}

export function latestClassWalkIn(email: string): Promise<ClassWalkIn | null> {
  return latestClassOrder(email, "pos");
}

export function latestSessionPickerClass(email: string): Promise<ClassWalkIn | null> {
  return latestClassOrder(email, "session_picker");
}

export type GelManicureDeposit = {
  orderId: string;
  status: string;
  totalCents: number;
  collectCents: number | null;
  sourceChannel: string;
  customerEmail: string | null;
  lineLabel: string | null;
  bookingId: string | null;
  transactionId: string | null;
  checkoutType: string | null;
  transactionStatus: string | null;
  holdId: string | null;
};

export async function latestGelManicureDeposit(email: string): Promise<GelManicureDeposit | null> {
  const admin = isolatedService();
  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id, email")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", email)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);
  if (!customer) return null;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, status, total_cents, source_channel, customer_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("customer_id", customer.id)
    .eq("source_channel", "instant_book")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order) return null;

  const { data: line, error: lineErr } = await admin
    .from("order_lines")
    .select("label, total_cents")
    .eq("order_id", order.id)
    .maybeSingle();
  if (lineErr) throw new Error(lineErr.message);

  const { data: booking, error: bookingErr } = await admin
    .from("agency_bookings")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("order_id", order.id)
    .maybeSingle();
  if (bookingErr) throw new Error(bookingErr.message);

  const { data: txn, error: txnErr } = await admin
    .from("booking_transactions")
    .select("id, checkout_type, status, gross_amount_cents")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (txnErr) throw new Error(txnErr.message);

  const { data: hold, error: holdErr } = await admin
    .from("talent_holds")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("talent_profile_id", "33330003-0000-4000-8000-000000000001")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (holdErr) throw new Error(holdErr.message);

  return {
    orderId: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    collectCents: txn ? Number(txn.gross_amount_cents) : null,
    sourceChannel: order.source_channel,
    customerEmail: (customer.email as string | null) ?? null,
    lineLabel: (line?.label as string | null) ?? null,
    bookingId: (booking?.id as string | null) ?? null,
    transactionId: (txn?.id as string | null) ?? null,
    checkoutType: (txn?.checkout_type as string | null) ?? null,
    transactionStatus: (txn?.status as string | null) ?? null,
    holdId: (hold?.id as string | null) ?? null,
  };
}

export const THERAPIST_A_ID = "33330003-0000-4000-8000-000000000001";
export const THERAPIST_B_ID = "33330003-0000-4000-8000-000000000002";
export const ROOM_A_POOL_ID = "33330020-0000-4000-8000-000000000003";

export type SpaInstantBook = {
  orderId: string;
  status: string;
  totalCents: number;
  sourceChannel: string;
  customerEmail: string | null;
  lineLabel: string | null;
  holdTalentIds: string[];
  roomAllocationId: string | null;
};

async function latestSpaOrder(email: string, lineNeedle: string): Promise<SpaInstantBook | null> {
  const admin = isolatedService();
  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id, email")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", email)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);
  if (!customer) return null;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, status, total_cents, source_channel")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("customer_id", customer.id)
    .eq("source_channel", "instant_book")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order) return null;

  const { data: line, error: lineErr } = await admin
    .from("order_lines")
    .select("id, label")
    .eq("order_id", order.id)
    .maybeSingle();
  if (lineErr) throw new Error(lineErr.message);
  if (!line?.label || !String(line.label).toLowerCase().includes(lineNeedle)) {
    return null;
  }

  const { data: holds, error: holdErr } = await admin
    .from("talent_holds")
    .select("talent_profile_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(8);
  if (holdErr) throw new Error(holdErr.message);

  const { data: room, error: roomErr } = await admin
    .from("capacity_allocations")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("pool_id", ROOM_A_POOL_ID)
    .eq("order_line_id", line.id)
    .maybeSingle();
  if (roomErr) throw new Error(roomErr.message);

  return {
    orderId: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    sourceChannel: order.source_channel,
    customerEmail: (customer.email as string | null) ?? null,
    lineLabel: (line.label as string | null) ?? null,
    holdTalentIds: (holds ?? []).map((h) => String(h.talent_profile_id)),
    roomAllocationId: (room?.id as string | null) ?? null,
  };
}

export function latestSpaMassage(email: string): Promise<SpaInstantBook | null> {
  return latestSpaOrder(email, "massage");
}

export function latestCouplesMassage(email: string): Promise<SpaInstantBook | null> {
  return latestSpaOrder(email, "couples");
}

/** Couples set: primary + companion holds on one window, plus Room A. */
export async function latestCouplesSet(email: string): Promise<{
  order: SpaInstantBook;
  primaryHoldId: string;
  companionHoldId: string;
  startsAt: string;
} | null> {
  const order = await latestCouplesMassage(email);
  if (!order?.roomAllocationId) return null;

  const admin = isolatedService();
  const now = new Date().toISOString();
  const { data: holds, error } = await admin
    .from("talent_holds")
    .select("id, talent_profile_id, starts_at, title")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .in("talent_profile_id", [THERAPIST_A_ID, THERAPIST_B_ID])
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(16);
  if (error) throw new Error(error.message);

  const primary = (holds ?? []).find(
    (h) =>
      String(h.talent_profile_id) === THERAPIST_A_ID
      && /couples/i.test(String(h.title ?? "")),
  );
  if (!primary) return null;
  const companion = (holds ?? []).find(
    (h) =>
      String(h.talent_profile_id) === THERAPIST_B_ID
      && String(h.starts_at) === String(primary.starts_at),
  );
  if (!companion) return null;

  return {
    order,
    primaryHoldId: String(primary.id),
    companionHoldId: String(companion.id),
    startsAt: String(primary.starts_at),
  };
}

export async function latestTherapistHold(talentProfileId: string): Promise<{
  id: string;
  startsAt: string;
} | null> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("talent_holds")
    .select("id, starts_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("talent_profile_id", talentProfileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: String(data.id), startsAt: String(data.starts_at) };
}

export const QA_NIGHT_SESSION_ID = "33330013-0000-4000-8000-000000000002";
export const QA_NIGHT_POOL_ID = "33330020-0000-4000-8000-000000000004";
export const QA_NIGHT_DOOR_POOL_ID = "33330020-0000-4000-8000-000000000005";
export const QA_NIGHT_SLUG = "qa-night";

export type TicketPickerNight = {
  orderId: string;
  status: string;
  totalCents: number;
  sourceChannel: string;
  customerEmail: string | null;
  lineLabel: string | null;
  sessionId: string | null;
  receiptCode: string | null;
  admissionId: string | null;
  allocationId: string | null;
  allocationState: string | null;
  admittedCount: number | null;
  seatedAt: string | null;
  holderName: string | null;
  poolId: string | null;
  transactionProvider: string | null;
  transactionStatus: string | null;
  transactionCents: number | null;
};

export async function latestTicketPickerNight(email: string): Promise<TicketPickerNight | null> {
  const admin = isolatedService();
  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id, email")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", email)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);
  if (!customer) return null;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, status, total_cents, source_channel, receipt_code")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("customer_id", customer.id)
    .eq("source_channel", "ticket_picker")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order) return null;

  const { data: line, error: lineErr } = await admin
    .from("order_lines")
    .select("id, label, session_id")
    .eq("order_id", order.id)
    .maybeSingle();
  if (lineErr) throw new Error(lineErr.message);

  const { data: admission, error: admissionErr } = line
    ? await admin
        .from("admissions")
        .select("id, allocation_id, admitted_count, seated_at, holder_name")
        .eq("tenant_id", JOURNEYS_TENANT_ID)
        .eq("order_line_id", line.id)
        .maybeSingle()
    : { data: null, error: null };
  if (admissionErr) throw new Error(admissionErr.message);

  const { data: alloc, error: allocErr } = line
    ? await admin
        .from("capacity_allocations")
        .select("id, state, pool_id")
        .eq("tenant_id", JOURNEYS_TENANT_ID)
        .eq("order_line_id", line.id)
        .maybeSingle()
    : { data: null, error: null };
  if (allocErr) throw new Error(allocErr.message);

  const { data: txn, error: txnErr } = await admin
    .from("booking_transactions")
    .select("provider, status, gross_amount_cents")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (txnErr) throw new Error(txnErr.message);

  return {
    orderId: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    sourceChannel: order.source_channel,
    customerEmail: (customer.email as string | null) ?? null,
    lineLabel: (line?.label as string | null) ?? null,
    sessionId: (line?.session_id as string | null) ?? null,
    receiptCode: (order.receipt_code as string | null) ?? null,
    admissionId: (admission?.id as string | null) ?? null,
    allocationId: (alloc?.id as string | null) ?? null,
    allocationState: (alloc?.state as string | null) ?? null,
    admittedCount: admission ? Number(admission.admitted_count) : null,
    seatedAt: (admission?.seated_at as string | null) ?? null,
    holderName: (admission?.holder_name as string | null) ?? null,
    poolId: (alloc?.pool_id as string | null) ?? null,
    transactionProvider: (txn?.provider as string | null) ?? null,
    transactionStatus: (txn?.status as string | null) ?? null,
    transactionCents: txn ? Number(txn.gross_amount_cents) : null,
  };
}

export async function overlappingTherapistHoldCount(
  talentProfileId: string,
  startsAt: string,
): Promise<number> {
  const admin = isolatedService();
  const { data, error } = await admin
    .from("talent_holds")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("talent_profile_id", talentProfileId)
    .eq("starts_at", startsAt)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}
