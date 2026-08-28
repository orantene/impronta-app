"use client";

import { useState, type CSSProperties } from "react";
import { useT } from "@/i18n/use-t";
import { HQ } from "../tenants/hq-kit";
import { hqProposeFixAction } from "@/lib/support/proposed-actions/actions";
import { SETTINGS_PATCH_KEYS, type ProposedActionKind } from "@/lib/support/proposed-actions/kinds";

const field: CSSProperties = {
  width: "100%",
  background: HQ.card,
  color: HQ.ink,
  border: `1px solid ${HQ.border}`,
  borderRadius: 8,
  padding: 8,
  fontSize: 12,
};

export function ProposeFixComposer({
  ticketId,
  onSubmitted,
}: {
  ticketId: string;
  onSubmitted: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ProposedActionKind>("settings_patch");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [payloadText, setPayloadText] = useState("{\n  \"branding.tagline\": \"\"\n}");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          border: `1px solid ${HQ.border}`,
          background: "transparent",
          color: HQ.ink,
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        {t("dashboard.platform.support.proposeFix")}
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${HQ.border}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: HQ.ink, marginBottom: 8 }}>
        {t("dashboard.platform.support.proposeFix")}
      </div>
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as ProposedActionKind)}
        style={{ ...field, marginBottom: 8 }}
      >
        <option value="settings_patch">{t("dashboard.platform.support.proposeKindSettings")}</option>
        <option value="builder_draft_revision">{t("dashboard.platform.support.proposeKindBuilder")}</option>
        <option value="instruction">{t("dashboard.platform.support.proposeKindInstruction")}</option>
      </select>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("dashboard.platform.support.proposeTitle")}
        style={{ ...field, marginBottom: 8 }}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("dashboard.platform.support.proposeDescription")}
        rows={2}
        style={{ ...field, marginBottom: 8, resize: "vertical" }}
      />
      {kind === "settings_patch" ? (
        <div style={{ fontSize: 10, color: HQ.inkDim, marginBottom: 6 }}>
          {SETTINGS_PATCH_KEYS.join(", ")}
        </div>
      ) : null}
      <textarea
        value={payloadText}
        onChange={(e) => setPayloadText(e.target.value)}
        placeholder={t("dashboard.platform.support.proposePayload")}
        rows={5}
        style={{ ...field, fontFamily: "ui-monospace, monospace", marginBottom: 8 }}
      />
      {error ? <div style={{ color: HQ.red, fontSize: 12, marginBottom: 8 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setError(null);
              let payload: Record<string, unknown> = {};
              try {
                const parsed = JSON.parse(payloadText) as unknown;
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                  setError(t("dashboard.platform.support.proposePayloadInvalid"));
                  return;
                }
                payload = parsed as Record<string, unknown>;
              } catch {
                setError(t("dashboard.platform.support.proposePayloadInvalid"));
                return;
              }
              setBusy(true);
              const r = await hqProposeFixAction({
                ticketId,
                kind,
                title: title.trim(),
                description: description.trim(),
                payload,
              });
              setBusy(false);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setOpen(false);
              setTitle("");
              setDescription("");
              onSubmitted();
            })();
          }}
          style={{
            background: "#F5F2EB",
            color: "#0B0B0D",
            border: "none",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("dashboard.platform.support.proposeSubmit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: "transparent",
            color: HQ.inkMuted,
            border: "none",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {t("dashboard.adminSupport.close")}
        </button>
      </div>
    </div>
  );
}
