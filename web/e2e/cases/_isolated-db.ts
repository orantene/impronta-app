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
