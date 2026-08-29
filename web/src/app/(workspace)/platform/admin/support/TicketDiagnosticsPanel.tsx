"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/i18n/use-t";
import { HQ } from "../tenants/hq-kit";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { hqSaveInvestigationFindingsAction, hqSummarizeDiagnosticsAction } from "@/lib/support/hq-actions";

export function TicketDiagnosticsPanel({
  ticketId,
  diagnostics,
}: {
  ticketId: string;
  diagnostics: Record<string, unknown> | null;
}) {
  const t = useT();
  const [paste, setPaste] = useState("");
  const [copied, setCopied] = useState(false);
  const storedSummary = typeof diagnostics?.ai_summary === "string" ? diagnostics.ai_summary : "";
  const [aiSummary, setAiSummary] = useState(storedSummary);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const consoleEvents = Array.isArray(diagnostics?.console_events)
    ? (diagnostics.console_events as Array<{ level?: string; message?: string }>)
    : [];
  const network = Array.isArray(diagnostics?.network_failures)
    ? (diagnostics.network_failures as Array<{ method?: string; pathOnly?: string; status?: number }>)
    : [];
  const routes = Array.isArray(diagnostics?.route_history)
    ? (diagnostics.route_history as Array<{ path?: string }>)
    : [];
  const sentryLink = typeof diagnostics?.sentry_link === "string" ? diagnostics.sentry_link : null;

  const copyBundle = async () => {
    const res = await fetch(`/api/platform/support/tickets/${ticketId}/investigation-bundle?format=md`);
    const md = await res.text();
    await navigator.clipboard.writeText(md);
    setCopied(true);
  };

  return (
    <div style={{ padding: 16, color: HQ.ink, overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => void copyBundle()}
          style={{
            border: `1px solid ${HQ.border}`,
            background: HQ.card,
            color: HQ.ink,
            borderRadius: 7,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {copied
            ? t("dashboard.platform.support.bundleCopied")
            : t("dashboard.platform.support.copyBundle")}
        </button>
        {sentryLink ? (
          <a href={sentryLink} target="_blank" rel="noreferrer" style={{ color: HQ.blue, fontSize: 12 }}>
            {t("dashboard.platform.support.openSentry")}
          </a>
        ) : null}
        {diagnostics ? (
          <button
            type="button"
            disabled={aiBusy}
            onClick={() => {
              setAiBusy(true);
              setAiErr(null);
              void hqSummarizeDiagnosticsAction({ ticketId }).then((r) => {
                setAiBusy(false);
                if (r.ok) setAiSummary(r.summary);
                else setAiErr(t("dashboard.platform.support.summarizeFailed"));
              });
            }}
            style={{
              marginLeft: "auto",
              border: `1px solid ${HQ.purple}`,
              background: "rgba(160,122,224,0.12)",
              color: HQ.purple,
              borderRadius: 7,
              padding: "6px 10px",
              fontSize: 12,
              cursor: aiBusy ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="sparkle" size={12} color={HQ.purple} />
            {t("dashboard.platform.support.summarizeAi")}
          </button>
        ) : null}
      </div>
      {aiSummary ? (
        <div style={{ fontSize: 12.5, color: HQ.inkMuted, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 12 }}>
          {aiSummary}
        </div>
      ) : null}
      {aiErr ? <div style={{ fontSize: 12, color: HQ.red, marginBottom: 8 }}>{aiErr}</div> : null}
      {!diagnostics ? (
        <div style={{ fontSize: 13, color: HQ.inkDim }}>{t("dashboard.platform.support.noDiagnostics")}</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: HQ.inkDim, marginBottom: 8 }}>
            {String(diagnostics.route ?? "")} · {String(diagnostics.app_version ?? "")}
          </div>
          <Section title={t("dashboard.platform.support.diagConsole")}>
            {consoleEvents.slice(-20).map((e, i) => (
              <div key={i} style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
                {e.level}: {e.message}
              </div>
            ))}
          </Section>
          <Section title={t("dashboard.platform.support.diagNetwork")}>
            {network.map((e, i) => (
              <div key={i} style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
                {e.method} {e.pathOnly} {e.status}
              </div>
            ))}
          </Section>
          <Section title={t("dashboard.platform.support.diagRoutes")}>
            {routes.map((e, i) => (
              <div key={i} style={{ fontSize: 11 }}>
                {e.path}
              </div>
            ))}
          </Section>
        </>
      )}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          {t("dashboard.platform.support.pasteFindings")}
        </div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={6}
          style={{
            width: "100%",
            background: HQ.card,
            color: HQ.ink,
            border: `1px solid ${HQ.border}`,
            borderRadius: 8,
            padding: 8,
            fontSize: 12,
          }}
        />
        <button
          type="button"
          onClick={() => void hqSaveInvestigationFindingsAction({ ticketId, markdown: paste })}
          style={{
            marginTop: 8,
            border: "none",
            background: HQ.green,
            color: "#0F0F11",
            borderRadius: 7,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("dashboard.platform.support.saveFindings")}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4, color: HQ.inkMuted }}>
        {title}
      </div>
      {children}
    </div>
  );
}
