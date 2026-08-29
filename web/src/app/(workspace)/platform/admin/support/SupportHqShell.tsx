"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { HQ } from "../tenants/hq-kit";
import type { HqQueueRow } from "@/lib/support/load-hq";
import type { HqFeatureRequestRow } from "@/lib/support/feature-request-types";
import type { HqInsightsDashboard } from "@/lib/support/insights/types";
import type { SupportCannedReply } from "@/lib/platform/support-canned";
import { SupportQueueClient } from "./SupportQueueClient";
import { SupportIdeasView } from "./SupportIdeasView";
import { SupportInsightsView } from "./SupportInsightsView";
import { SupportCannedEditor } from "./SupportCannedEditor";

export function SupportHqShell({
  rows,
  insights,
  cannedReplies,
  ideas,
  initialTicketId,
  initialView,
}: {
  rows: HqQueueRow[];
  insights: HqInsightsDashboard;
  cannedReplies: SupportCannedReply[];
  ideas: HqFeatureRequestRow[];
  initialTicketId: string | null;
  initialView: "queue" | "insights" | "ideas";
}) {
  const t = useT();
  const [view, setView] = useState<"queue" | "insights" | "ideas">(initialView);
  const [cannedOpen, setCannedOpen] = useState(false);
  // Local copy so a save refreshes the composer popover without a reload.
  const [canned, setCanned] = useState(cannedReplies);

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
            { id: "ideas" as const, label: t("dashboard.platform.support.viewIdeas") },
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
        <SupportCannedEditor
          initial={canned}
          onClose={() => setCannedOpen(false)}
          onSaved={setCanned}
        />
      ) : null}
      {view === "ideas" ? (
        <SupportIdeasView rows={ideas} />
      ) : view === "insights" ? (
        <SupportInsightsView data={insights} />
      ) : (
        <SupportQueueClient
          rows={rows}
          initialTicketId={initialTicketId}
          cannedReplies={canned}
        />
      )}
    </div>
  );
}
