"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";
import { HQ, HQ_F } from "../tenants/hq-kit";
import { SupportThreadView } from "@/components/support/SupportThreadView";
import { TicketContextCard } from "./TicketContextCard";
import { TicketDiagnosticsPanel } from "./TicketDiagnosticsPanel";
import type { HqTicketContext } from "@/lib/support/load-hq";
import type { SupportMessageRow, SupportTicketRow } from "@/lib/support/support-types";
import {
  hqChangeStatusAction,
  hqEscalateOverrideAction,
  hqLoadTicketDetailAction,
  hqReplySupportTicketAction,
} from "@/lib/support/hq-actions";

const CANNED = [
  { id: "greeting", text: (tr: (k: string) => string) => tr("dashboard.platform.support.cannedGreeting") },
  { id: "need-more", text: (tr: (k: string) => string) => tr("dashboard.platform.support.cannedNeedMore") },
  { id: "fixed", text: (tr: (k: string) => string) => tr("dashboard.platform.support.cannedFixed") },
  { id: "resolve", text: (tr: (k: string) => string) => tr("dashboard.platform.support.cannedResolve") },
];

export function SupportTicketHqDrawer({
  ticketId,
  onClose,
  onOpenPast,
}: {
  ticketId: string;
  onClose: () => void;
  onOpenPast: (id: string) => void;
}) {
  const t = useT();
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [context, setContext] = useState<HqTicketContext | null>(null);
  const [body, setBody] = useState("");
  const [note, setNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slash, setSlash] = useState(false);
  const [tab, setTab] = useState<"thread" | "diagnostics" | "replay" | "insights">("thread");

  const reload = async (id: string) => {
    const r = await hqLoadTicketDetailAction({ ticketId: id });
    if (r.ok) {
      setTicket(r.data.ticket);
      setMessages(r.data.messages);
      setContext(r.data.context);
    }
  };

  useEffect(() => {
    void reload(ticketId);
  }, [ticketId]);

  const reply = async (andResolve: boolean) => {
    if (!ticket || (!body.trim() && !andResolve) || busy) return;
    setBusy(true);
    if (body.trim()) {
      await hqReplySupportTicketAction({
        ticketId: ticket.id,
        body: body.trim(),
        asInternalNote: note,
      });
      setBody("");
    }
    if (andResolve) {
      await hqChangeStatusAction({ ticketId: ticket.id, status: "resolved" });
    }
    setBusy(false);
    await reload(ticket.id);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 80,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1080px, 100vw)",
          height: "100%",
          background: HQ.bg,
          borderLeft: `1px solid ${HQ.border}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            borderBottom: `1px solid ${HQ.border}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: HQ.ink, overflow: "hidden", textOverflow: "ellipsis" }}>
              {ticket?.subject || t("dashboard.adminSupport.untitled")}
            </div>
            <div style={{ fontFamily: HQ_F, fontSize: 12, color: HQ.inkDim }}>
              {ticket ? `#${ticket.ticketNumber}` : ""}
            </div>
          </div>
          {ticket ? (
            <div style={{ display: "flex", gap: 4 }}>
              {(["open", "resolved", "closed"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void hqChangeStatusAction({ ticketId: ticket.id, status: s }).then(() => reload(ticket.id))}
                  style={{
                    border: `1px solid ${ticket.status === s ? HQ.green : HQ.border}`,
                    background: ticket.status === s ? HQ.greenSoft : "transparent",
                    color: ticket.status === s ? HQ.green : HQ.inkMuted,
                    borderRadius: 7,
                    padding: "5px 8px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {s === "open"
                    ? t("dashboard.platform.support.statusOpen")
                    : s === "resolved"
                      ? t("dashboard.platform.support.statusResolved")
                      : t("dashboard.platform.support.statusClosed")}
                </button>
              ))}
            </div>
          ) : null}
          {ticket?.handledBy === "ai" ? (
            <button
              type="button"
              onClick={() =>
                void hqEscalateOverrideAction({ ticketId: ticket.id }).then(() => reload(ticket.id))
              }
              style={{
                border: `1px solid ${HQ.purple}`,
                background: "transparent",
                color: HQ.purple,
                borderRadius: 7,
                padding: "5px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {t("dashboard.platform.support.takeOver")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dashboard.adminSupport.close")}
            style={{ background: "transparent", border: "none", color: HQ.inkMuted, cursor: "pointer", fontSize: 18 }}
          >
            ×
          </button>
        </header>

        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${HQ.border}`, padding: "0 12px" }}>
          {(
            [
              { id: "thread", label: t("dashboard.platform.support.tabThread"), enabled: true },
              { id: "diagnostics", label: t("dashboard.platform.support.tabDiagnostics"), enabled: true },
              { id: "replay", label: t("dashboard.platform.support.tabReplay"), enabled: false },
              { id: "insights", label: t("dashboard.platform.support.tabInsights"), enabled: false },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!item.enabled}
              title={!item.enabled ? t("dashboard.platform.support.tabDisabledHint") : undefined}
              onClick={() => item.enabled && setTab(item.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: tab === item.id ? `2px solid ${HQ.green}` : "2px solid transparent",
                color: item.enabled ? HQ.ink : HQ.inkDim,
                padding: "10px 12px",
                fontSize: 12,
                cursor: item.enabled ? "pointer" : "not-allowed",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: "1 1 60%", display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ flex: 1, overflow: "auto" }}>
              {tab === "diagnostics" ? (
                <TicketDiagnosticsPanel ticketId={ticketId} diagnostics={context?.diagnostics ?? null} />
              ) : (
                <SupportThreadView ticket={ticket} messages={messages} tone="hq" />
              )}
            </div>
            <div style={{ borderTop: `1px solid ${HQ.border}`, padding: 12 }}>
              {slash ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {CANNED.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setBody(c.text(t));
                        setSlash(false);
                      }}
                      style={{
                        border: `1px solid ${HQ.border}`,
                        background: HQ.card,
                        color: HQ.ink,
                        borderRadius: 7,
                        padding: "4px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {c.text(t)}
                    </button>
                  ))}
                </div>
              ) : null}
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setSlash(e.target.value === "/");
                }}
                rows={3}
                placeholder={t("dashboard.platform.support.replyPlaceholder")}
                style={{
                  width: "100%",
                  background: HQ.card,
                  color: HQ.ink,
                  border: `1px solid ${HQ.border}`,
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 13,
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <label style={{ fontSize: 12, color: HQ.inkMuted, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />
                  {t("dashboard.platform.support.internalNote")}
                </label>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  disabled={busy || !body.trim()}
                  onClick={() => void reply(false)}
                  style={{
                    background: "#F5F2EB",
                    color: "#0B0B0D",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: body.trim() ? "pointer" : "default",
                  }}
                >
                  {t("dashboard.platform.support.reply")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reply(true)}
                  style={{
                    background: "transparent",
                    color: HQ.ink,
                    border: `1px solid ${HQ.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {t("dashboard.platform.support.replyAndResolve")}
                </button>
              </div>
            </div>
          </div>
          <div style={{ flex: "1 1 40%", borderLeft: `1px solid ${HQ.border}`, minWidth: 0 }}>
            {ticket && context ? (
              <TicketContextCard ticket={ticket} context={context} onOpenPast={onOpenPast} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
