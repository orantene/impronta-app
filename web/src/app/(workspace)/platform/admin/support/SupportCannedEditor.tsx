"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { HQ, HQ_F } from "../tenants/hq-kit";
import { hqSaveCannedRepliesAction } from "@/lib/support/hq-actions";
import type { SupportCannedReply } from "@/lib/platform/support-canned";

export function SupportCannedEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: SupportCannedReply[];
  onClose: () => void;
  /** Lets the shell refresh the composer popover without a full reload. */
  onSaved?: (entries: SupportCannedReply[]) => void;
}) {
  const t = useT();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.border}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: HQ_F, fontSize: 13, fontWeight: 600, color: HQ.ink }}>
          {t("dashboard.platform.support.cannedReplies")}
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            color: HQ.inkMuted,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {t("dashboard.platform.support.closeEditor")}
        </button>
      </div>
      {rows.map((row, i) => (
        <div key={row.id} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <input
            value={row.title}
            onChange={(e) => {
              const title = e.target.value;
              setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, title } : r)));
            }}
            placeholder={t("dashboard.platform.support.cannedTitle")}
            maxLength={60}
            style={field}
          />
          <textarea
            value={row.body}
            onChange={(e) => {
              const body = e.target.value;
              setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, body } : r)));
            }}
            placeholder={t("dashboard.platform.support.cannedBody")}
            maxLength={2000}
            rows={3}
            style={{ ...field, resize: "vertical" }}
          />
          <button
            type="button"
            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            style={{ alignSelf: "flex-start", ...ghost }}
          >
            {t("dashboard.platform.support.cannedDelete")}
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() =>
            setRows((prev) =>
              prev.length >= 30
                ? prev
                : [...prev, { id: crypto.randomUUID(), title: "", body: "" }],
            )
          }
          style={ghost}
        >
          {t("dashboard.platform.support.cannedAdd")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            // Empty rows are a leftover "add" click, not intent — drop them
            // instead of failing the whole save with a generic error.
            const cleaned = rows.filter((x) => x.title.trim() || x.body.trim());
            setBusy(true);
            setErr(null);
            void hqSaveCannedRepliesAction({ entries: cleaned }).then((r) => {
              setBusy(false);
              if (!r.ok) setErr(r.error);
              else {
                onSaved?.(cleaned);
                onClose();
              }
            });
          }}
          style={{
            border: "none",
            background: "#F5F2EB",
            color: "#0F0F11",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("dashboard.platform.support.cannedSave")}
        </button>
      </div>
      {err ? <div style={{ fontSize: 12, color: HQ.red, marginTop: 8 }}>{err}</div> : null}
    </div>
  );
}

const field = {
  background: "transparent",
  border: `1px solid ${HQ.border}`,
  color: HQ.ink,
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  fontFamily: HQ_F,
} as const;

const ghost = {
  border: `1px solid ${HQ.border}`,
  background: "transparent",
  color: HQ.inkMuted,
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
} as const;
