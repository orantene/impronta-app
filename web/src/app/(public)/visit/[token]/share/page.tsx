import { notFound } from "next/navigation";

import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { guestVisitBill } from "@/lib/visits/guest-order";

export const dynamic = "force-dynamic";

export default async function GuestVisitSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const host = await getPublicHostContext();
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const bill = await guestVisitBill(admin, { tenantId: host.tenantId, token });
  if (!bill.ok) notFound();
  return (
    <main>
      <h1>Your share</h1>
      <p>Total {bill.totalCents}</p>
      <p>Paid {bill.paidCents}</p>
      <p>Owed {bill.owedCents}</p>
    </main>
  );
}
