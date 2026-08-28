"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useT } from "@/i18n/use-t";
import { HQ } from "../tenants/hq-kit";
import {
  hqAddFixLinkAction,
  hqConfirmInsightAction,
  hqLoadTicketInsightAction,
} from "@/lib/support/insights/actions";
import type { FixLinkKind, SupportFixLinkRow, SupportInsightRow } from "@/lib/support/insights/types";

const field: CSSProperties = {
  width: "100%",
  background: HQ.card,
  color: HQ.ink,
  border: `1px solid ${HQ.border}`,
  borderRadius: 8,
  padding: 8,
  fontSize: 12,
};

export function TicketInsightsPanel({ ticketId }: { ticketId: string }) {
  const t = useT();
  const [insight, setInsight] = useState<SupportInsightRow | null>(null);
  const [links, setLinks] = useState<SupportFixLinkRow[]>([]);
  const [area, setArea] = useState("");
  const [tags, setTags] = useState("");
  const [kind, setKind] = useState<FixLinkKind>("pr");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    hqLoadTicketInsightAction({ ticketId }).then((r) => {
      if (!r.ok) return;
      setInsight(r.insight);
      setLinks(r.links);
      setArea(r.insight?.productArea ?? "");
      setTags((r.insight?.tags ?? []).join(", "));
    });

  useEffect(() => {
    void reload();
  }, [ticketId]);

  const btn: CSSProperties = {
    border: `1px solid ${HQ.border}`,
    background: HQ.card,
    color: HQ.ink,
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <div style={{ padding: 16, color: HQ.ink, overflow: "auto", height: "100%" }}>
      {!insight ? (
        <div style={{ fontSize: 13, color: HQ.inkDim }}>{t("dashboard.platform.support.insightEmpty")}</div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{insight.summary}</div>
          {insight.rootCause ? (
            <div style={{ fontSize: 12, color: HQ.inkMuted, marginBottom: 10 }}>{insight.rootCause}</div>
          ) : null}
          <div style={{ fontSize: 11, color: HQ.inkDim, marginBottom: 10 }}>
            {insight.resolutionKind ?? "-"} · {insight.sentiment ?? "-"}
            {insight.confirmedAt ? ` · ${t("dashboard.platform.support.insightConfirmed")}` : ""}
          </div>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder={t("dashboard.platform.support.insightArea")} style={{ ...field, marginBottom: 8 }} />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("dashboard.platform.support.insightTags")} style={{ ...field, marginBottom: 8 }} />
          <button
            type="button"
            style={{ ...btn, marginBottom: 16 }}
            onClick={() => {
              void hqConfirmInsightAction({
                insightId: insight.id,
                productArea: area.trim() || undefined,
                tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
              }).then((r) => {
                if (!r.ok) setError(r.error);
                else void reload();
              });
            }}
          >
            {t("dashboard.platform.support.insightConfirm")}
          </button>
        </>
      )}
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{t("dashboard.platform.support.addFixLink")}</div>
      <select value={kind} onChange={(e) => setKind(e.target.value as FixLinkKind)} style={{ ...field, marginBottom: 8 }}>
        <option value="pr">pr</option>
        <option value="commit">commit</option>
        <option value="release">release</option>
        <option value="doc">doc</option>
      </select>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" style={{ ...field, marginBottom: 8 }} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("dashboard.platform.support.fixNote")} style={{ ...field, marginBottom: 8 }} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 8 }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        {t("dashboard.platform.support.notifyRequester")}
      </label>
      <button
        type="button"
        style={btn}
        onClick={() => {
          setError(null);
          void hqAddFixLinkAction({
            ticketId,
            kind,
            url,
            note: note.trim() || undefined,
            notifyRequester: notify,
          }).then((r) => {
            if (!r.ok) setError(r.error);
            else {
              setUrl("");
              setNote("");
              void reload();
            }
          });
        }}
      >
        {t("dashboard.platform.support.saveFixLink")}
      </button>
      {links.map((l) => (
        <div key={l.id} style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 8 }}>
          {l.kind} · {l.note || l.url}
        </div>
      ))}
      {error ? <div style={{ color: HQ.red, fontSize: 12, marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}
