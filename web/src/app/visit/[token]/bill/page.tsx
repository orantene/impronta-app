import type { Metadata } from "next";

import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { loadOpenVisitByToken } from "@/lib/visits/qr";

import { VisitBill, VisitNotice } from "../visit-bill";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your bill",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ token: string }> };

/**
 * Q05 "Pay at table" (`Q05_PayAtTable`) as its own screen: the bill alone,
 * with Pay all / Pay my share. The landing (`/visit/[token]`) keeps the same
 * bill under the welcome; this route exists so a guest who was sent "the
 * bill" lands on the bill.
 *
 * A closed visit answers with the venue engine's own sentence
 * (`visit_closed`, venue.md §3), the same words the share page refuses with,
 * so the guest and the floor read one sentence for one state.
 */
export default async function GuestVisitBillPage({ params }: Params) {
  const { token } = await params;
  const host = await getPublicHostContext();
  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);

  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) {
    return <VisitNotice title={tr("dashboard.visit.inactive")} body={tr("dashboard.visit.askStaff")} />;
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return <VisitNotice title={tr("dashboard.visit.inactive")} body={tr("dashboard.visit.askStaff")} />;
  }

  const loaded = await loadOpenVisitByToken(admin, { tenantId: host.tenantId, publicToken: token });
  if (!loaded.ok) {
    const title =
      loaded.reason === "ended" ? tr("dashboard.venue.engine.refusal.visit_closed") : tr("dashboard.visit.inactive");
    return <VisitNotice title={title} body={tr("dashboard.visit.askStaff")} />;
  }

  return (
    <main className="min-h-screen bg-admin-surface px-4 pb-10 pt-5 text-admin-ink">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3.5" data-visit-screen="bill">
        <VisitBill
          token={token}
          tr={tr}
          code={loaded.tableCode ?? ""}
          partySize={loaded.partySize}
          lines={loaded.lines}
          currency={loaded.currency}
          total={formatOrderMoney(loaded.totalCents, loaded.currency)}
        />
      </div>
    </main>
  );
}
