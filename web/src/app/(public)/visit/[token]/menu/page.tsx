import { notFound } from "next/navigation";

import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { guestVisitMenu } from "@/lib/visits/guest-order";

export const dynamic = "force-dynamic";

export default async function GuestVisitMenuPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const host = await getPublicHostContext();
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const menu = await guestVisitMenu(admin, { tenantId: host.tenantId, token });
  if (!menu.ok) notFound();
  return (
    <main>
      <h1>Menu</h1>
      <ul>
        {menu.items.map((item) => (
          <li key={item.id}>
            {item.title} · {item.amountCents}
          </li>
        ))}
      </ul>
    </main>
  );
}
