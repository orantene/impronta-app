"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/use-t";
import { HQ, HQ_F, HQ_FD } from "../tenants/hq-kit";
import { hqUpdateFeatureRequestAction } from "@/lib/support/feature-request-actions";
import {
  FEATURE_REQUEST_STATUSES,
  type FeatureRequestStatus,
  type HqFeatureRequestRow,
} from "@/lib/support/feature-request-types";

const STATUS_TONE: Record<FeatureRequestStatus, { bg: string; fg: string }> = {
  new: { bg: "rgba(122,183,224,0.15)", fg: HQ.blue },
  under_review: { bg: HQ.amberSoft, fg: HQ.amber },
  planned: { bg: "rgba(160,122,224,0.15)", fg: HQ.purple },
  in_progress: { bg: HQ.amberSoft, fg: HQ.amber },
  shipped: { bg: HQ.greenSoft, fg: HQ.green },
  declined: { bg: HQ.cardSoft, fg: HQ.inkDim },
};

function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d+]/g, "").replace(/^\+/, "")}`;
}

/**
 * The owner's standing list of what customers asked for: who, when, their
 * phone, the vote count, and where it stands. Follow-up lives here.
 */
export function SupportIdeasView({ rows }: { rows: HqFeatureRequestRow[] }) {
  const t = useT();
  const [filter, setFilter] = useState<"open" | FeatureRequestStatus>("open");
  const [items, setItems] = useState(rows);

  const filtered = useMemo(() => {
    const list =
      filter === "open"
        ? items.filter((r) =>
            ["new", "under_review", "planned", "in_progress"].includes(r.request.status),
          )
        : items.filter((r) => r.request.status === filter);
    return [...list].sort((a, b) => b.request.voteCount - a.request.voteCount);
  }, [items, filter]);

  const patch = (id: string, next: Partial<HqFeatureRequestRow["request"]>) =>
    setItems((prev) =>
      prev.map((r) => (r.request.id === id ? { ...r, request: { ...r.request, ...next } } : r)),
    );

  return (
    <div style={{ fontFamily: HQ_F }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {(["open", ...FEATURE_REQUEST_STATUSES] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id as "open" | FeatureRequestStatus)}
            style={{
              border: filter === id ? "none" : `1px solid ${HQ.borderSoft}`,
              background: filter === id ? "#F5F2EB" : "rgba(255,255,255,0.04)",
              color: filter === id ? "#0F0F11" : HQ.inkMuted,
              borderRadius: 999,
              padding: "6px 13px",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {id === "open"
              ? t("dashboard.platform.support.filterAllOpen")
              : t(`dashboard.platform.support.ideasStatus_${id}`)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: HQ.inkMuted, fontSize: 13, padding: "28px 4px" }}>
          {t("dashboard.platform.support.ideasEmpty")}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((row) => (
          <IdeaCard
            key={row.request.id}
            row={row}
            onPatch={(next) => patch(row.request.id, next)}
          />
        ))}
      </div>
    </div>
  );
}

function IdeaCard({
  row,
  onPatch,
}: {
  row: HqFeatureRequestRow;
  onPatch: (next: Partial<HqFeatureRequestRow["request"]>) => void;
}) {
  const t = useT();
  const r = row.request;
  const tone = STATUS_TONE[r.status];
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(r.ownerNote ?? "");
  const [ref, setRef] = useState(r.shippedRef ?? "");
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = (status?: FeatureRequestStatus) => {
    setBusy(true);
    setErr(null);
    void hqUpdateFeatureRequestAction({
      requestId: r.id,
      status,
      ownerNote: note,
      shippedRef: ref || undefined,
      notifyRequester: notify,
    }).then((res) => {
      setBusy(false);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onPatch({ ownerNote: note, shippedRef: ref, ...(status ? { status } : {}) });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: "13px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 46,
            padding: "6px 0",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
          }}
        >
          <span style={{ fontFamily: HQ_FD, fontSize: 16, fontWeight: 600, color: HQ.ink }}>
            {r.voteCount}
          </span>
          <span style={{ fontSize: 9.5, color: HQ.inkDim }}>
            {t("dashboard.platform.support.ideasVotes")}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: HQ.ink }}>{r.title}</span>
            {r.body ? (
              <span
                style={{
                  display: "block",
                  fontSize: 12,
                  color: HQ.inkMuted,
                  marginTop: 3,
                  ...(open ? {} : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
                }}
              >
                {r.body}
              </span>
            ) : null}
          </button>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              marginTop: 7,
              fontSize: 11.5,
              color: HQ.inkMuted,
            }}
          >
            <span>{row.requesterName ?? "Someone"}</span>
            {row.tenantName ? <span>{row.tenantName}</span> : null}
            {r.area ? <span>{r.area}</span> : null}
            <span>{new Date(r.createdAt).toLocaleDateString()}</span>
            {r.contactPhone ? (
              <>
                <a href={`tel:${r.contactPhone}`} style={{ color: HQ.blue }}>
                  {t("dashboard.platform.support.ideasCall")}
                </a>
                <a
                  href={waLink(r.contactPhone)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: HQ.green }}
                >
                  {t("dashboard.platform.support.ideasWhatsapp")}
                </a>
                <span style={{ color: HQ.inkDim }}>{r.contactPhone}</span>
              </>
            ) : null}
          </div>
        </div>

        <span
          style={{
            background: tone.bg,
            color: tone.fg,
            borderRadius: 999,
            padding: "3px 10px",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {t(`dashboard.platform.support.ideasStatus_${r.status}`)}
        </span>
      </div>

      {open ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FEATURE_REQUEST_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => save(s)}
                style={{
                  border: `1px solid ${r.status === s ? HQ.border : HQ.borderSoft}`,
                  background: r.status === s ? "rgba(255,255,255,0.08)" : "transparent",
                  color: r.status === s ? HQ.ink : HQ.inkMuted,
                  borderRadius: 999,
                  padding: "5px 11px",
                  fontSize: 11,
                  cursor: busy ? "default" : "pointer",
                }}
              >
                {t(`dashboard.platform.support.ideasStatus_${s}`)}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={t("dashboard.platform.support.ideasOwnerNote")}
            style={hqField}
          />
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            maxLength={800}
            placeholder={t("dashboard.platform.support.ideasShippedRef")}
            style={hqField}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: HQ.inkMuted }}>
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              {t("dashboard.platform.support.ideasNotify")}
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => save()}
              style={{
                background: "#F5F2EB",
                color: "#0F0F11",
                border: "none",
                borderRadius: 999,
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
              }}
            >
              {t("dashboard.platform.support.ideasSave")}
            </button>
            {saved ? (
              <span style={{ fontSize: 11.5, color: HQ.green }}>
                {t("dashboard.platform.support.ideasSaved")}
              </span>
            ) : null}
            {err ? <span style={{ fontSize: 11.5, color: HQ.red }}>{err}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const hqField: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${HQ.borderSoft}`,
  borderRadius: 9,
  padding: "9px 11px",
  fontSize: 12.5,
  color: HQ.ink,
  fontFamily: HQ_F,
  resize: "vertical",
};
