"use client";

import { useT } from "@/i18n/use-t";
import { HQ, HQ_F } from "../tenants/hq-kit";
import { PushSubscribeControl } from "@/components/support/PushSubscribeControl";

export function NotificationPermissionCard() {
  const t = useT();
  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 16,
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontFamily: HQ_F, fontSize: 13, fontWeight: 600, color: HQ.ink }}>
          {t("dashboard.platform.support.pushCardTitle")}
        </div>
        <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 4 }}>
          {t("dashboard.platform.support.pushCardBody")}
        </div>
      </div>
      <PushSubscribeControl tone="hq" />
    </div>
  );
}
