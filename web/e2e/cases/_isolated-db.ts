/**
 * Service-role reads against qa-journeys only. Refuses production.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const JOURNEYS_TENANT_ID = "33333333-3333-4333-8333-333333333333";

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

export type TableReservation = {
  orderId: string;
  status: string;
  sourceChannel: string;
  customerEmail: string | null;
  admissionId: string | null;
  partySize: number | null;
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
    .select("id, status, source_channel")
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

  return {
    orderId: order.id,
    status: order.status,
    sourceChannel: order.source_channel,
    customerEmail: (customer.email as string | null) ?? null,
    admissionId: (admission?.id as string | null) ?? null,
    partySize: admission ? Number(admission.party_size) : null,
  };
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
