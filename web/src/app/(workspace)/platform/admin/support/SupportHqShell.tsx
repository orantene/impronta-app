"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { HQ } from "../tenants/hq-kit";
import type { HqQueueRow } from "@/lib/support/load-hq";
import type { HqInsightsDashboard } from "@/lib/support/insights/types";
import type { SupportCannedReply } from "@/lib/platform/support-canned";
import { SupportQueueClient } from "./SupportQueueClient";
import { SupportInsightsView } from "./SupportInsightsView";
import { SupportCannedEditor } from "./SupportCannedEditor";

export function SupportHqShell({
  rows,
  insights,
  cannedReplies,
  initialTicketId,
  initialView,
}: {
  rows: HqQueueRow[];
  insights: HqInsightsDashboard;
  cannedReplies: SupportCannedReply[];
  initialTicketId: string | null;
  initialView: "queue" | "insights";
}) {
  const t = useT();
  const [view, setView] = useState<"queue" | "insights">(initialView);
  const [cannedOpen, setCannedOpen] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <div
        style={{
          display: "inline-flex",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${HQ.border}`,
          borderRadius: 9,
          padding: 3,
          gap: 3,
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
      <button
        type="button"
        onClick={() => setCannedOpen((v) => !v)}
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: `1px solid ${HQ.border}`,
          background: cannedOpen ? "rgba(255,255,255,0.10)" : "transparent",
          color: HQ.inkMuted,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        {t("dashboard.platform.support.cannedReplies")}
      </button>
      </div>
      {cannedOpen ? (
        <SupportCannedEditor initial={cannedReplies} onClose={() => setCannedOpen(false)} />
      ) : null}
      {view === "insights" ? (
        <SupportInsightsView data={insights} />
      ) : (
        <SupportQueueClient
          rows={rows}
          initialTicketId={initialTicketId}
          cannedReplies={cannedReplies}
        />
      )}
    </div>
  );
}
