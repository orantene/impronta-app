"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";
import { HQ, HQ_F } from "../tenants/hq-kit";

export function NotificationPermissionCard() {
  const t = useT();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
  }, []);

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    const next = await Notification.requestPermission();
    setPerm(next);
  };

  const granted = perm === "granted";

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
          {granted
            ? t("dashboard.platform.support.notifyEnabled")
            : t("dashboard.platform.support.pushCardBody")}
        </div>
      </div>
      {granted ? null : (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={perm === "denied" || perm === "unsupported"}
          style={{
            border: `1px solid ${HQ.border}`,
            background: perm === "denied" || perm === "unsupported" ? "transparent" : "#F5F2EB",
            color: perm === "denied" || perm === "unsupported" ? HQ.inkMuted : "#0F0F11",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: perm === "denied" || perm === "unsupported" ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {perm === "denied"
            ? t("dashboard.platform.support.pushCardDenied")
            : perm === "unsupported"
              ? t("dashboard.platform.support.pushCardUnsupported")
              : t("dashboard.platform.support.pushCardEnable")}
        </button>
      )}
    </div>
  );
}
