"use client";

import { useState, type CSSProperties } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { HQ, HQ_FD } from "../tenants/hq-kit";
import type { HqInsightsDashboard } from "@/lib/support/insights/types";

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatPct(share: number | null): string {
  return share == null ? "-" : `${Math.round(share * 100)}%`;
}

const card: CSSProperties = {
  background: HQ.card,
  border: `1px solid ${HQ.border}`,
  borderRadius: 12,
  padding: "16px 18px",
};

export function SupportInsightsView({ data }: { data: HqInsightsDashboard }) {
  const t = useT();
  const maxFriction = Math.max(1, ...data.friction.map((f) => f.count));
  const maxWeek = Math.max(1, ...data.weeklyVolume.map((w) => w.count));
  const points = data.weeklyVolume.map((w, i) => {
    const x = data.weeklyVolume.length <= 1 ? 280 : 10 + (i * 540) / (data.weeklyVolume.length - 1);
    const y = 90 - (w.count / maxWeek) * 70;
    return { x, y, label: `${w.weekLabel} · ${w.count}` };
  });
  const poly = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: HQ.inkDim }}>
            {t("dashboard.platform.support.statOpenNow")}
          </div>
          <div style={{ fontFamily: HQ_FD, fontSize: 26, fontWeight: 600, color: HQ.ink, marginTop: 6 }}>{data.openNow}</div>
          <div style={{ fontSize: 11, color: HQ.red, marginTop: 4 }}>
            {interpolate(t("dashboard.platform.support.statNeedYou"), { count: data.needsYou })}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: HQ.inkDim }}>
            {t("dashboard.platform.support.statMedianReply")}
          </div>
          <div style={{ fontFamily: HQ_FD, fontSize: 26, fontWeight: 600, color: HQ.ink, marginTop: 6 }}>
            {formatDuration(data.medianFirstReplyMs)}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: HQ.inkDim }}>
            {t("dashboard.platform.support.statResolvedWeek")}
          </div>
          <div style={{ fontFamily: HQ_FD, fontSize: 26, fontWeight: 600, color: HQ.ink, marginTop: 6 }}>
            {data.resolvedThisWeek}
          </div>
          <div style={{ fontSize: 11, color: HQ.inkMuted, marginTop: 4 }}>
              {data.avgRating != null
              ? interpolate(t("dashboard.platform.support.statAvgRating"), { n: data.avgRating.toFixed(1) })
              : t("dashboard.platform.support.statNoRatings")}
          </div>
        </div>
        <div style={{ ...card, borderColor: "rgba(160,122,224,0.30)" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: HQ.purple }}>
            {t("dashboard.platform.support.statAiResolved")}
          </div>
          <div style={{ fontFamily: HQ_FD, fontSize: 26, fontWeight: 600, color: HQ.ink, marginTop: 6 }}>
            {data.aiResolvedShare == null ? "-" : `${Math.round(data.aiResolvedShare * 100)}%`}
          </div>
          <div style={{ fontSize: 11, color: HQ.inkMuted, marginTop: 4 }}>
            {data.aiResolvedShare == null
              ? t("dashboard.platform.support.insightsPending")
              : interpolate(t("dashboard.platform.support.statAiResolvedHint"), {
                  // Must be the SAME denominator the percentage above divides
                  // by. This read resolvedThisWeek while the share was computed
                  // over insight rows, so the tile disagreed with itself.
                  n: data.aiResolvedCount,
                  total: data.aiResolvedTotal,
                })}
          </div>
        </div>
      </div>

      {/*
        Second row: every one of these is computed from columns the engine has
        always written and which nothing read. Resolution time, backlog age,
        reopen rate and escalation rate were all absent from the dashboard, not
        from the database.
      */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: HQ.inkDim }}>
            {t("dashboard.platform.support.statMedianResolve")}
          </div>
          <div style={{ fontFamily: HQ_FD, fontSize: 26, fontWeight: 600, color: HQ.ink, marginTop: 6 }}>
            {formatDuration(data.medianResolveMs)}
          </div>
          <div style={{ fontSize: 11, color: HQ.inkMuted, marginTop: 4 }}>
            {t("dashboard.platform.support.statMedianResolveHint")}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: HQ.inkDim }}>
            {t("dashboard.platform.support.statBacklogAge")}
          </div>
          <div style={{ fontFamily: HQ_FD, fontSize: 26, fontWeight: 600, color: HQ.ink, marginTop: 6 }}>
            {formatDuration(data.backlogAgeMs)}
          </div>
          <div style={{ fontSize: 11, color: HQ.inkMuted, marginTop: 4 }}>
            {t("dashboard.platform.support.statBacklogAgeHint")}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: HQ.inkDim }}>
            {t("dashboard.platform.support.statReopenRate")}
          </div>
          <div style={{ fontFamily: HQ_FD, fontSize: 26, fontWeight: 600, color: HQ.ink, marginTop: 6 }}>
            {formatPct(data.reopenRate)}
          </div>
          <div style={{ fontSize: 11, color: HQ.inkMuted, marginTop: 4 }}>
            {interpolate(t("dashboard.platform.support.statReopenRateHint"), { n: data.reopenedTickets })}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: HQ.inkDim }}>
            {t("dashboard.platform.support.statEscalationRate")}
          </div>
          <div style={{ fontFamily: HQ_FD, fontSize: 26, fontWeight: 600, color: HQ.ink, marginTop: 6 }}>
            {formatPct(data.escalationRate)}
          </div>
          <div style={{ fontSize: 11, color: HQ.inkMuted, marginTop: 4 }}>
            {interpolate(t("dashboard.platform.support.statEscalationRateHint"), { n: data.escalatedCount })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: HQ.ink, marginBottom: 12 }}>
              {t("dashboard.platform.support.frictionTitle")}
            </div>
            {data.friction.length === 0 ? (
              <div style={{ fontSize: 12, color: HQ.inkDim }}>{t("dashboard.platform.support.frictionEmpty")}</div>
            ) : (
              data.friction.map((f) => (
                <div key={f.area} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <span style={{ width: 150, fontSize: 11.5, color: HQ.inkMuted, flexShrink: 0 }}>{f.area}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.04)" }}>
                    <div
                      style={{
                        width: `${Math.round((f.count / maxFriction) * 100)}%`,
                        height: 8,
                        borderRadius: 4,
                        background: HQ.blue,
                      }}
                    />
                  </div>
                  <span style={{ width: 30, fontSize: 11.5, color: HQ.ink, textAlign: "right" }}>{f.count}</span>
                </div>
              ))
            )}
          </div>
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: HQ.ink }}>{t("dashboard.platform.support.trendTitle")}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: HQ.inkDim }}>{t("dashboard.platform.support.trendHint")}</span>
            </div>
            <svg viewBox="0 0 560 110" style={{ width: "100%", height: 110 }}>
              {points.length > 1 ? (
                <polyline points={poly} fill="none" stroke={HQ.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : null}
              {points.map((p) => (
                <circle key={p.label} cx={p.x} cy={p.y} r="3.5" fill={HQ.blue} />
              ))}
              {points.map((p) => (
                <text key={`t-${p.label}`} x={p.x} y={102} fill={HQ.inkDim} fontSize="10" textAnchor="middle">
                  {p.label}
                </text>
              ))}
            </svg>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...card, background: "rgba(160,122,224,0.08)", borderColor: "rgba(160,122,224,0.25)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: HQ.purple, marginBottom: 10 }}>
              {t("dashboard.platform.support.weeklyAiTitle")}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: HQ.inkMuted, marginBottom: 10 }}>
              {data.digest?.summary ?? t("dashboard.platform.support.weeklyAiEmpty")}
            </div>
            {(data.digest?.suggestedFixes ?? []).length > 0 ? (
              <div style={{ borderTop: "1px solid rgba(160,122,224,0.18)", paddingTop: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: HQ.inkDim, marginBottom: 6 }}>
                  {t("dashboard.platform.support.suggestedFixes")}
                </div>
                {(data.digest?.suggestedFixes ?? []).map((fix) => (
                  <div key={fix} style={{ fontSize: 12, color: HQ.inkMuted, marginBottom: 4 }}>
                    {fix}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <PastDigests items={data.pastDigests} />
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: HQ.ink, marginBottom: 10 }}>
              {t("dashboard.platform.support.shippedTitle")}
            </div>
            {data.shipped.length === 0 ? (
              <div style={{ fontSize: 12, color: HQ.inkDim }}>{t("dashboard.platform.support.shippedEmpty")}</div>
            ) : (
              data.shipped.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: HQ.green, flexShrink: 0 }} />
                  <a href={s.url} style={{ flex: 1, fontSize: 12, color: HQ.inkMuted, textDecoration: "none" }}>
                    {s.note || s.url}
                  </a>
                  <span style={{ fontSize: 10.5, color: HQ.inkDim }}>
                    {s.ticketNumber != null ? `#${s.ticketNumber}` : s.kind}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PastDigests({ items }: { items: Array<{ weekStart: string; summary: string }> }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div style={card}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: HQ.ink, marginBottom: 10 }}>
        {t("dashboard.platform.support.pastDigests")}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: HQ.inkDim }}>{t("dashboard.platform.support.noDigests")}</div>
      ) : (
        items.map((item) => {
          const firstLine = item.summary.split(/\n/)[0]?.slice(0, 140) || item.weekStart;
          const expanded = open === item.weekStart;
          return (
            <button
              key={item.weekStart}
              type="button"
              onClick={() => setOpen(expanded ? null : item.weekStart)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                padding: "8px 0",
                cursor: "pointer",
                color: HQ.inkMuted,
              }}
            >
              <div style={{ fontSize: 11, color: HQ.inkDim, marginBottom: 2 }}>{item.weekStart}</div>
              <div style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: expanded ? "pre-wrap" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {expanded ? item.summary : firstLine}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
