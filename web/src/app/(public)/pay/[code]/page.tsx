import { notFound, redirect } from "next/navigation";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadPaymentLinkByCode, markPaymentLinkPaid } from "@/lib/payments/links";
import { getStripe } from "@/lib/stripe/client";

/**
 * `/pay/<code>` — public payment-link landing.
 *
 * THE CODE IS THE CREDENTIAL, same rule as `/r/<code>`. Possession of the
 * opaque code is what this page trusts. Agency and hub hosts only.
 */
export default async function PayByCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  if (!code || code.length < 8) notFound();

  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const loaded = await loadPaymentLinkByCode(admin, code);
  if (!loaded.ok) notFound();

  if (query.status === "paid" || loaded.status === "paid") {
    return (
      <main>
        <p>Paid.</p>
      </main>
    );
  }

  if (loaded.status !== "open") notFound();

  const origin = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "";
  const successUrl = `${origin}/pay/${code}?status=paid`;
  const cancelUrl = `${origin}/pay/${code}`;

  if (loaded.provider === "stripe") {
    const stripe = getStripe();
    if (!stripe) notFound();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.max(Math.floor(Date.now() / 1000) + 1800, Math.floor(Date.parse(loaded.expiresAt) / 1000)),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
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

  const settled = await markPaymentLinkPaid(admin, { code, tenantId: loaded.tenantId });
  if (!settled.ok) notFound();
  redirect(`${origin || ""}/pay/${code}?status=paid`);
}
