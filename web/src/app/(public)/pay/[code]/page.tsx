import { notFound, redirect } from "next/navigation";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadPaymentLinkByCode, markPaymentLinkPaid } from "@/lib/payments/links";
import { getStripe } from "@/lib/stripe/client";
import { publicThreadPath, signThreadToken } from "@/lib/messaging/thread-token";

import { CheckoutView } from "./CheckoutView";

/**
 * `/pay/<code>` — MC15–MC20. The code is the credential.
 */
export default async function PayByCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ status?: string; confirm?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  if (!code || code.length < 8) notFound();

  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const loaded = await loadPaymentLinkByCode(admin, code);
  if (!loaded.ok && loaded.reason === "expired") {
    return (
      <CheckoutView
        code={code}
        amountCents={0}
        currency=""
        expiresAt=""
        status="expired"
        lines={[]}
        holdUntil={null}
        stripeUrl={null}
        threadHref={null}
        receiptHref={null}
      />
    );
  }
  if (!loaded.ok) notFound();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, currency, inquiry_id, receipt_code, hold_expires_at")
    .eq("id", loaded.orderId)
    .maybeSingle();
  if (orderError) notFound();
  const orderRow = (order ?? null) as {
    currency: string;
    inquiry_id: string | null;
    receipt_code: string | null;
    hold_expires_at: string | null;
  } | null;
  const { data: lines, error: linesError } = await admin
    .from("order_lines")
    .select("label, units, unit_cents")
    .eq("order_id", loaded.orderId);
  if (linesError) notFound();

  const threadToken =
    orderRow?.inquiry_id && loaded.tenantId
      ? signThreadToken(orderRow.inquiry_id, loaded.tenantId)
      : null;
  const threadHref = threadToken ? publicThreadPath(threadToken) : null;
  const receiptHref = orderRow?.receipt_code ? `/r/${orderRow.receipt_code}` : null;

  if (query.status === "paid" || loaded.status === "paid") {
    return (
      <CheckoutView
        code={code}
        amountCents={loaded.amountCents}
        currency={orderRow?.currency ?? ""}
        expiresAt={loaded.expiresAt}
        status="paid"
        lines={[]}
        holdUntil={orderRow?.hold_expires_at ?? null}
        stripeUrl={null}
        threadHref={threadHref}
        receiptHref={receiptHref}
      />
    );
  }

  if (loaded.status !== "open") {
    return (
      <CheckoutView
        code={code}
        amountCents={loaded.amountCents}
        currency={orderRow?.currency ?? ""}
        expiresAt={loaded.expiresAt}
        status={loaded.status === "cancelled" ? "cancelled" : "unknown"}
        lines={[]}
        holdUntil={null}
        stripeUrl={null}
        threadHref={threadHref}
        receiptHref={receiptHref}
      />
    );
  }

  const origin = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "";
  const successUrl = `${origin}/pay/${code}?status=paid`;
  const cancelUrl = `${origin}/pay/${code}`;

  if (query.confirm === "mock" && loaded.provider !== "stripe") {
    const settled = await markPaymentLinkPaid(admin, { code, tenantId: loaded.tenantId });
    if (!settled.ok) {
      return (
        <CheckoutView
          code={code}
          amountCents={loaded.amountCents}
          currency={orderRow?.currency ?? ""}
          expiresAt={loaded.expiresAt}
          status="unknown"
          lines={[]}
          holdUntil={null}
          stripeUrl={null}
          threadHref={threadHref}
          receiptHref={receiptHref}
        />
      );
    }
    redirect(`${origin || ""}/pay/${code}?status=paid`);
  }

  let stripeUrl: string | null = null;
  if (loaded.provider === "stripe" && query.confirm === "stripe") {
    const stripe = getStripe();
    if (!stripe) notFound();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (orderRow?.currency ?? "usd").toLowerCase(),
            unit_amount: loaded.amountCents,
            product_data: { name: "Payment" },
          },
        },
      ],
      metadata: {
        payment_link_code: code,
        order_id: loaded.orderId,
        tenant_id: loaded.tenantId,
      },
    });
    if (!session.url) notFound();
    redirect(session.url);
  }
  if (loaded.provider === "stripe") {
    stripeUrl = `${origin || ""}/pay/${code}?confirm=stripe`;
  }

  return (
    <CheckoutView
      code={code}
      amountCents={loaded.amountCents}
      currency={orderRow?.currency ?? ""}
      expiresAt={loaded.expiresAt}
      status="open"
      lines={((lines ?? []) as { label: string | null; units: number; unit_cents: number }[]).map((line) => ({
        label: line.label ?? "",
        units: Number(line.units) || 1,
        unitCents: Number(line.unit_cents) || 0,
      }))}
      holdUntil={orderRow?.hold_expires_at ?? null}
      stripeUrl={stripeUrl}
      threadHref={threadHref}
      receiptHref={receiptHref}
    />
  );
}
