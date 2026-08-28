"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { HQ } from "../tenants/hq-kit";
import type { HqQueueRow } from "@/lib/support/load-hq";
import type { HqInsightsDashboard } from "@/lib/support/insights/types";
import { SupportQueueClient } from "./SupportQueueClient";
import { SupportInsightsView } from "./SupportInsightsView";

export function SupportHqShell({
  rows,
  insights,
  initialTicketId,
  initialView,
}: {
  rows: HqQueueRow[];
  insights: HqInsightsDashboard;
  initialTicketId: string | null;
  initialView: "queue" | "insights";
}) {
  const t = useT();
  const [view, setView] = useState<"queue" | "insights">(initialView);

  return (
    <div>
      <div
        style={{
          display: "inline-flex",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${HQ.border}`,
          borderRadius: 9,
          padding: 3,
          gap: 3,
          marginBottom: 16,
        }}
      >
        {(
          [
            { id: "queue" as const, label: t("dashboard.platform.support.viewQueue") },
            { id: "insights" as const, label: t("dashboard.platform.support.viewInsights") },
          ]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            style={{
              padding: "5px 14px",
              borderRadius: 7,
              border: "none",
              background: view === item.id ? "#F5F2EB" : "transparent",
              color: view === item.id ? "#0F0F11" : HQ.inkMuted,
              fontSize: 12,
              fontWeight: view === item.id ? 600 : 500,
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {view === "insights" ? (
        <SupportInsightsView data={insights} />
      ) : (
        <SupportQueueClient rows={rows} initialTicketId={initialTicketId} />
      )}
    </div>
  );
}
