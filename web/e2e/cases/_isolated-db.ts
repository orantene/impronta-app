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
