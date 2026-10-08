"use client";

import { useCallback, useState } from "react";
import { useT } from "@/i18n/use-t";
import { HQ, HQ_F, HQ_FD } from "../tenants/hq-kit";
import { interpolate } from "@/i18n/interpolate";
import type { HqQueueRow } from "@/lib/support/load-hq";
import type { HqFeatureRequestRow } from "@/lib/support/feature-request-types";
import type { HqInsightsDashboard } from "@/lib/support/insights/types";
import type { SupportCannedReply } from "@/lib/platform/support-canned";
import { SupportQueueClient } from "./SupportQueueClient";
import { SupportIdeasView } from "./SupportIdeasView";
import { SupportInsightsView } from "./SupportInsightsView";
import { SupportCannedEditor } from "./SupportCannedEditor";
import { supportDeskOpenFromHqHref } from "@/lib/support/desk/desk-url";

export function SupportHqShell({
  rows,
  insights,
  cannedReplies,
  ideas,
  initialOpenCount,
  initialTicketId,
  initialView,
  deskEnabled = false,
}: {
  rows: HqQueueRow[];
  insights: HqInsightsDashboard;
  cannedReplies: SupportCannedReply[];
  ideas: HqFeatureRequestRow[];
  initialOpenCount: number;
  initialTicketId: string | null;
  initialView: "queue" | "insights" | "ideas";
  /** Server-evaluated `isSupportDeskEnabled()` — never read the flag on the client. */
  deskEnabled?: boolean;
}) {
  const t = useT();
  const [view, setView] = useState<"queue" | "insights" | "ideas">(initialView);
  const [cannedOpen, setCannedOpen] = useState(false);
  // Local copy so a save refreshes the composer popover without a reload.
  const [canned, setCanned] = useState(cannedReplies);
  const [openCount, setOpenCount] = useState(initialOpenCount);
  const onOpenCountChange = useCallback((n: number) => setOpenCount(n), []);

  return (
    <div>
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
        <p style={{ fontFamily: HQ_F, fontSize: 13, color: HQ.inkMuted, margin: "5px 0 0" }}>
          {interpolate(
            t(
              openCount === 1
                ? "dashboard.platform.support.pageSubtitleOne"
                : "dashboard.platform.support.pageSubtitle",
            ),
            { count: openCount },
          )}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <div
        style={{
          display: "inline-flex",
          background: HQ.cardSoft,
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
              background: view === item.id ? HQ.ink : "transparent",
              color: view === item.id ? HQ.bg : HQ.inkMuted,
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
          background: cannedOpen ? HQ.border : "transparent",
          color: HQ.inkMuted,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        {t("dashboard.platform.support.cannedReplies")}
      </button>
      {deskEnabled ? (
        <a
          href={supportDeskOpenFromHqHref()}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${HQ.border}`,
            background: "transparent",
            color: HQ.inkMuted,
            fontSize: 12,
            cursor: "pointer",
            textDecoration: "none",
          }}
        >
          {t("dashboard.platform.support.deskOpenFromHq")} ↗
        </a>
      ) : null}
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
          onOpenCountChange={onOpenCountChange}
        />
      )}
    </div>
  );
}
