"use client";

import { useState, useTransition, type CSSProperties } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { PrimaryButton, SecondaryButton } from "@/components/admin/shell/internal/primitives";
import {
  publishTalentPersonalSiteAction,
  saveTalentPersonalSiteDraftAction,
  unpublishTalentPersonalSiteAction,
} from "@/lib/talent-site/server/actions";
import type { TalentSiteDashboardState, TalentSiteSnapshot } from "@/lib/talent-site/types";

type Props = {
  state: TalentSiteDashboardState;
  initialSnapshot: TalentSiteSnapshot;
  onSaved?: () => void;
};

const FIELD_LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.7,
  textTransform: "uppercase",
  color: COLORS.inkMuted,
  marginBottom: 6,
  fontFamily: FONTS.body,
};

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 13.5,
  fontFamily: FONTS.body,
  color: COLORS.ink,
  background: "#fff",
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  outline: "none",
  boxSizing: "border-box",
};

const DISABLED_INPUT_STYLE: CSSProperties = {
  ...INPUT_STYLE,
  background: COLORS.surfaceAlt,
  color: COLORS.inkMuted,
  cursor: "not-allowed",
};

export function TalentSiteEditorForm({ state, initialSnapshot, onSaved }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [version, setVersion] = useState(state.site?.version ?? 1);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "error" | "success">("info");
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
        expectedVersion: version,
        snapshot,
      });
      if (!result.ok) {
        setMessage(result.error);
        setMessageTone("error");
        return;
      }
      if (result.data?.version) {
        setVersion(result.data.version);
        setSnapshot((prev) => ({ ...prev, pageVersion: result.data!.version }));
      }
      setMessage("Draft saved.");
      setMessageTone("success");
      onSaved?.();
    });
  }

  function handlePublish() {
    startTransition(async () => {
      setMessage(null);
      const saveResult = await saveTalentPersonalSiteDraftAction({
        expectedVersion: version,
        snapshot,
      });
      if (!saveResult.ok) {
        setMessage(saveResult.error);
        setMessageTone("error");
        return;
      }
      const nextVersion = saveResult.data?.version ?? version;
      setVersion(nextVersion);

      const pub = await publishTalentPersonalSiteAction({ expectedVersion: nextVersion });
      if (!pub.ok) {
        setMessage(pub.error);
        setMessageTone("error");
        return;
      }
      if (pub.data?.version) setVersion(pub.data.version);
      setMessage("Published. Your personal site is live.");
      setMessageTone("success");
      onSaved?.();
    });
  }

  function handleUnpublish() {
    startTransition(async () => {
      setMessage(null);
      const result = await unpublishTalentPersonalSiteAction();
      if (!result.ok) {
        setMessage(result.error);
        setMessageTone("error");
        return;
      }
      setMessage("Unpublished. Public visitors will no longer see your personal site.");
      setMessageTone("info");
      onSaved?.();
    });
  }

  const messagePalette: Record<typeof messageTone, { fg: string; bg: string; border: string }> = {
    info: {
      fg: COLORS.ink,
      bg: COLORS.surfaceAlt,
      border: COLORS.borderSoft,
    },
    success: {
      fg: COLORS.successDeep,
      bg: COLORS.successSoft,
      border: "rgba(46,125,91,0.22)",
    },
    error: {
      fg: COLORS.criticalDeep,
      bg: COLORS.criticalSoft,
      border: "rgba(176,48,58,0.22)",
    },
  };
  const palette = messagePalette[messageTone];

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
        <label>
          <span style={FIELD_LABEL_STYLE}>Site title</span>
          <input
            type="text"
            value={snapshot.fields.title}
            disabled={disabled}
            onChange={(e) => updateFields({ title: e.target.value })}
            onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.fill)}
            onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
            style={disabled ? DISABLED_INPUT_STYLE : INPUT_STYLE}
          />
        </label>
        <label>
          <span style={FIELD_LABEL_STYLE}>Meta description</span>
          <textarea
            value={snapshot.fields.metaDescription ?? ""}
            disabled={disabled}
            onChange={(e) => updateFields({ metaDescription: e.target.value || null })}
            onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.fill)}
            onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
            rows={3}
            style={{
              ...(disabled ? DISABLED_INPUT_STYLE : INPUT_STYLE),
              resize: "vertical",
              lineHeight: 1.5,
            }}
          />
        </label>
        <label>
          <span style={FIELD_LABEL_STYLE}>Intro tagline</span>
          <input
            type="text"
            value={snapshot.fields.introTagline ?? ""}
            disabled={disabled}
            onChange={(e) => updateFields({ introTagline: e.target.value || null })}
            onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.fill)}
            onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
            style={disabled ? DISABLED_INPUT_STYLE : INPUT_STYLE}
          />
        </label>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          paddingTop: 12,
          borderTop: `1px solid ${COLORS.borderSoft}`,
        }}
      >
        <SecondaryButton onClick={handleSave} disabled={disabled}>
          Save draft
        </SecondaryButton>
        <PrimaryButton onClick={handlePublish} disabled={disabled || !state.canPublishPersonalSite}>
          Publish
        </PrimaryButton>
        {state.site?.status === "published" ? (
          <SecondaryButton
            onClick={handleUnpublish}
            disabled={disabled || !state.canPublishPersonalSite}
          >
            Unpublish
          </SecondaryButton>
        ) : null}
      </div>

      {message ? (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            fontSize: 12.5,
            color: palette.fg,
            background: palette.bg,
            border: `1px solid ${palette.border}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
          }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
