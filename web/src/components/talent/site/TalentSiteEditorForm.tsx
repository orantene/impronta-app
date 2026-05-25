"use client";

import { useState, useTransition } from "react";

import {
  publishTalentPersonalSiteAction,
  saveTalentPersonalSiteDraftAction,
  unpublishTalentPersonalSiteAction,
} from "@/lib/talent-site/server/actions";
import type { TalentSiteDashboardState, TalentSiteSnapshot } from "@/lib/talent-site/types";

const FONT = '"Inter", system-ui, sans-serif';

type Props = {
  tenantSlug: string;
  state: TalentSiteDashboardState;
  initialSnapshot: TalentSiteSnapshot;
  onSaved?: () => void;
};

export function TalentSiteEditorForm({
  tenantSlug,
  state,
  initialSnapshot,
  onSaved,
}: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [version, setVersion] = useState(state.site?.version ?? 1);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = !state.canEditPersonalSite || pending;

  function updateFields(patch: Partial<TalentSiteSnapshot["fields"]>) {
    setSnapshot((prev) => ({
      ...prev,
      fields: { ...prev.fields, ...patch },
    }));
  }

  function handleSave() {
    startTransition(async () => {
      setMessage(null);
      const result = await saveTalentPersonalSiteDraftAction({
        tenantSlug,
        expectedVersion: version,
        snapshot,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (result.data?.version) {
        setVersion(result.data.version);
        setSnapshot((prev) => ({ ...prev, pageVersion: result.data!.version }));
      }
      setMessage("Draft saved.");
      onSaved?.();
    });
  }

  function handlePublish() {
    startTransition(async () => {
      setMessage(null);
      const saveResult = await saveTalentPersonalSiteDraftAction({
        tenantSlug,
        expectedVersion: version,
        snapshot,
      });
      if (!saveResult.ok) {
        setMessage(saveResult.error);
        return;
      }
      const nextVersion = saveResult.data?.version ?? version;
      setVersion(nextVersion);

      const pub = await publishTalentPersonalSiteAction({
        tenantSlug,
        expectedVersion: nextVersion,
      });
      if (!pub.ok) {
        setMessage(pub.error);
        return;
      }
      if (pub.data?.version) setVersion(pub.data.version);
      setMessage("Published. Your personal site is live.");
      onSaved?.();
    });
  }

  function handleUnpublish() {
    startTransition(async () => {
      setMessage(null);
      const result = await unpublishTalentPersonalSiteAction(tenantSlug);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Unpublished. Public visitors will no longer see your personal site.");
      onSaved?.();
    });
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Site title
          <input
            type="text"
            value={snapshot.fields.title}
            disabled={disabled}
            onChange={(e) => updateFields({ title: e.target.value })}
            style={{
              border: "1px solid rgba(24,24,27,0.12)",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 14,
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Meta description
          <textarea
            value={snapshot.fields.metaDescription ?? ""}
            disabled={disabled}
            onChange={(e) => updateFields({ metaDescription: e.target.value || null })}
            rows={2}
            style={{
              border: "1px solid rgba(24,24,27,0.12)",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 14,
              resize: "vertical",
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Intro tagline
          <input
            type="text"
            value={snapshot.fields.introTagline ?? ""}
            disabled={disabled}
            onChange={(e) => updateFields({ introTagline: e.target.value || null })}
            style={{
              border: "1px solid rgba(24,24,27,0.12)",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 14,
            }}
          />
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={handleSave}
          style={btnStyle(disabled)}
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={disabled || !state.canPublishPersonalSite}
          onClick={handlePublish}
          style={btnStyle(disabled || !state.canPublishPersonalSite, true)}
        >
          Publish
        </button>
        {state.site?.status === "published" ? (
          <button
            type="button"
            disabled={disabled || !state.canPublishPersonalSite}
            onClick={handleUnpublish}
            style={btnStyle(disabled, false, true)}
          >
            Unpublish
          </button>
        ) : null}
      </div>

      {message ? (
        <p style={{ marginTop: 12, fontSize: 13, color: "rgba(11,11,13,0.7)" }}>{message}</p>
      ) : null}
    </div>
  );
}

function btnStyle(disabled: boolean, primary = false, ghost = false) {
  return {
    background: primary ? "#0B0B0D" : ghost ? "transparent" : "#fff",
    color: primary ? "#fff" : "#0B0B0D",
    border: primary ? "none" : "1px solid rgba(24,24,27,0.12)",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontFamily: FONT,
  } as const;
}
