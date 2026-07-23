"use client";

/**
 * C.9 — Per-person audit history section for the platform user drawer.
 * Lazy-fetches on first expand; shows last 20 admin actions on this person.
 */

import { useState, useTransition } from "react";
import { HQ, HQ_F, HQ_FM, SectionLabel } from "../tenants/hq-kit";
import { getPlatformUserAuditLog } from "./actions";
import type { AuditEntry } from "./actions";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { PlatformUserRow } from "../../platform-data";

function formatActionLabel(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string, t: (key: string) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return t("dashboard.platform.users.audit.relToday");
  if (diffDays === 1) return t("dashboard.platform.users.audit.relYesterday");
  if (diffDays < 7) return interpolate(t("dashboard.platform.users.audit.relDaysAgo"), { count: diffDays });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.beforeJsonb || entry.afterJsonb || entry.contextJsonb;

  return (
    <li
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "9px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: HQ.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {formatActionLabel(entry.action)}
          </div>
          <div style={{ fontSize: 11, color: HQ.inkDim, marginTop: 2 }}>
            {t("dashboard.platform.users.audit.byPlatformAdmin")} · {formatDate(entry.createdAt, t)}
          </div>
        </div>
        {hasDetail && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "transparent",
              border: "none",
              color: HQ.inkMuted,
              cursor: "pointer",
              fontSize: 11,
              fontFamily: HQ_FM,
              padding: "4px 6px",
              flexShrink: 0,
            }}
          >
            {expanded ? t("dashboard.platform.users.audit.hide") : t("dashboard.platform.users.audit.detail")}
          </button>
        )}
      </div>
      {expanded && hasDetail && (
        <div
          style={{
            borderTop: `1px solid ${HQ.borderSoft}`,
            padding: "8px 12px",
            background: HQ.bg,
          }}
        >
          {entry.beforeJsonb && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: HQ.inkDim, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{t("dashboard.platform.users.audit.before")}</div>
              <pre
                style={{
                  fontSize: 10.5,
                  color: HQ.inkMuted,
                  fontFamily: HQ_FM,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(entry.beforeJsonb, null, 2)}
              </pre>
            </div>
          )}
          {entry.afterJsonb && (
            <div style={{ marginBottom: entry.contextJsonb ? 6 : 0 }}>
              <div style={{ fontSize: 10, color: HQ.inkDim, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{t("dashboard.platform.users.audit.after")}</div>
              <pre
                style={{
                  fontSize: 10.5,
                  color: HQ.inkMuted,
                  fontFamily: HQ_FM,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(entry.afterJsonb, null, 2)}
              </pre>
            </div>
          )}
          {entry.contextJsonb && (
            <div>
              <div style={{ fontSize: 10, color: HQ.inkDim, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{t("dashboard.platform.users.audit.context")}</div>
              <pre
                style={{
                  fontSize: 10.5,
                  color: HQ.inkMuted,
                  fontFamily: HQ_FM,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(entry.contextJsonb, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function AuditHistorySection({ user }: { user: PlatformUserRow }) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();

  function handleToggle() {
    if (!isOpen && !loaded) {
      startTransition(async () => {
        const data = await getPlatformUserAuditLog(user.id);
        setEntries(data);
        setLoaded(true);
      });
    }
    setIsOpen(!isOpen);
  }

  return (
    <section style={{ marginBottom: 18 }}>
      <div
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleToggle()}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: HQ.ink,
          fontFamily: HQ_FM,
          letterSpacing: 0.2,
          textTransform: "uppercase",
          marginBottom: isOpen ? 8 : 0,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 11 }}>{isOpen ? "▼" : "▶"}</span>
        {t("dashboard.platform.users.audit.title")}
      </div>

      {isOpen && (
        <div>
          {!loaded ? (
            <div
              style={{
                padding: "14px",
                background: HQ.cardSoft,
                border: `1px dashed ${HQ.borderSoft}`,
                borderRadius: 10,
                fontSize: 12.5,
                color: HQ.inkDim,
                textAlign: "center",
                fontFamily: HQ_F,
              }}
            >
              {t("dashboard.platform.users.audit.loading")}
            </div>
          ) : entries.length === 0 ? (
            <div
              style={{
                padding: "14px",
                background: HQ.cardSoft,
                border: `1px dashed ${HQ.borderSoft}`,
                borderRadius: 10,
                fontSize: 12.5,
                color: HQ.inkDim,
                textAlign: "center",
                fontFamily: HQ_F,
              }}
            >
              {t("dashboard.platform.users.audit.empty")}
            </div>
          ) : (
            <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
              {entries.map((e) => (
                <AuditRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
