import { loadHqSupportQueue } from "@/lib/support/load-hq";
import { HQ, HQ_F, HQ_FD } from "../tenants/hq-kit";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { SupportQueueClient } from "./SupportQueueClient";
import { NotificationPermissionCard } from "./NotificationPermissionCard";

export const dynamic = "force-dynamic";

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>;
}) {
  const [{ ticket: openTicketId }, rows] = await Promise.all([
    searchParams,
    loadHqSupportQueue(),
  ]);
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const openCount = rows.filter((r) => r.ticket.status === "open").length;

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h1
          style={{
            fontFamily: HQ_FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: HQ.ink,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {t("dashboard.platform.support.pageTitle")}
        </h1>
        <p
          style={{
            fontFamily: HQ_F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {interpolate(t("dashboard.platform.support.pageSubtitle"), { count: openCount })}
        </p>
      </div>
      <NotificationPermissionCard />
      <SupportQueueClient rows={rows} initialTicketId={openTicketId ?? null} />
    </>
  );
}
