"use client";

// Client wrapper that holds the editable Profile and Account rows.
// Lives in a separate client component so the parent settings page can
// remain a server component and pass server-loaded data + bind the
// server actions.

import { useState, useTransition } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { EditableTextRow } from "./EditableTextRow";
import {
  updateClientSelfProfile,
  updateClientSelfEmail,
  updateClientSelfPassword,
} from "../actions";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.10)",
  surface:    "rgba(11,11,13,0.02)",
  blue:       "#1D4ED8",
  green:      "#0F766E",
  red:        "#B91C1C",
} as const;

export function ProfileFields({
  tenantSlug,
  initialDisplayName,
  initialCompany,
  agencyName,
}: {
  tenantSlug: string;
  initialDisplayName: string;
  initialCompany: string;
  agencyName: string;
}) {
  const t = useT();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [company, setCompany] = useState(initialCompany);

  return (
    <>
      <EditableTextRow
        label={t("client.settings.nameLabel")}
        value={displayName}
        placeholder={t("client.settings.namePlaceholder")}
        onSave={async (next) => {
          const res = await updateClientSelfProfile({
            tenantSlug,
            displayName: next,
            company,
          });
          if (res.ok) setDisplayName(next);
          return res;
        }}
      />
      <EditableTextRow
        label={t("client.settings.companyLabel")}
        hint={t("client.settings.companyHint")}
        value={company}
        placeholder={t("client.settings.companyPlaceholder")}
        emptyLabel={t("client.settings.companyEmpty")}
        onSave={async (next) => {
          const res = await updateClientSelfProfile({
            tenantSlug,
            displayName,
            company: next,
          });
          if (res.ok) setCompany(next);
          return res;
        }}
      />
      <div
        style={{
          padding: "12px 0 0",
          fontSize: 11.5,
          color: C.inkMuted,
          fontFamily: FONT,
        }}
      >
        {interpolate(t("client.settings.editsVisibleTo"), { agency: agencyName })}
      </div>
    </>
  );
}

export function AccountFields({
  initialEmail,
  signInMethodLabel,
}: {
  initialEmail: string;
  signInMethodLabel: string;
}) {
  // `email` stays at the current confirmed address until Supabase
  // verifies the change on both sides; `pendingEmail` holds the
  // unconfirmed new value for the hint copy.
  const t = useT();
  const [email] = useState(initialEmail);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  return (
    <>
      <EditableTextRow
        label={t("client.settings.emailLabel")}
        hint={
          pendingEmail
            ? interpolate(t("client.settings.emailPendingHint"), { email: pendingEmail })
            : t("client.settings.emailHint")
        }
        value={email}
        type="email"
        placeholder="you@company.com"
        onSave={async (next) => {
          const res = await updateClientSelfEmail({ newEmail: next });
          if (res.ok) {
            setPendingEmail(next);
            // We don't change `email` until the user confirms — Supabase only
            // applies the change once both sides verify.
          }
          return res;
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 0",
          borderBottom: `1px solid ${C.borderSoft}`,
          fontFamily: FONT,
        }}
      >
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{t("client.settings.passwordLabel")}</div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
            {interpolate(t("client.settings.signInMethod"), { method: signInMethodLabel })}
          </div>
        </div>
        {!showPasswordForm && (
          <button
            type="button"
            onClick={() => setShowPasswordForm(true)}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              padding: "5px 10px",
              borderRadius: 7,
              border: `1px solid ${C.borderSoft}`,
              background: C.surface,
              color: C.ink,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            {t("client.settings.changePassword")}
          </button>
        )}
      </div>

      {showPasswordForm && (
        <PasswordChangeForm onClose={() => setShowPasswordForm(false)} />
      )}
    </>
  );
}

function PasswordChangeForm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await updateClientSelfPassword({ newPassword, confirmPassword });
      if (res.ok) {
        setDone(true);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "14px 0",
          borderBottom: `1px solid ${C.borderSoft}`,
          fontFamily: FONT,
        }}
      >
        <div style={{ fontSize: 13, color: C.green, fontWeight: 500 }}>
          ✓ {t("client.settings.passwordUpdated")}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: 11.5,
            fontWeight: 500,
            padding: "5px 10px",
            borderRadius: 7,
            border: `1px solid ${C.borderSoft}`,
            background: "transparent",
            color: C.inkMuted,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {t("client.settings.done")}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "14px 0",
        borderBottom: `1px solid ${C.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{t("client.settings.changePassword")}</div>
      <PasswordInput
        placeholder={t("client.settings.newPasswordPlaceholder")}
        value={newPassword}
        onChange={setNewPassword}
        disabled={pending}
      />
      <PasswordInput
        placeholder={t("client.settings.confirmPasswordPlaceholder")}
        value={confirmPassword}
        onChange={setConfirmPassword}
        disabled={pending}
        onEnter={submit}
      />
      {error && <div style={{ fontSize: 11.5, color: C.red }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !newPassword || !confirmPassword}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 12px",
            borderRadius: 7,
            border: "none",
            background: C.ink,
            color: "#fff",
            cursor: pending ? "default" : "pointer",
            opacity: pending || !newPassword || !confirmPassword ? 0.6 : 1,
            fontFamily: FONT,
          }}
        >
          {pending ? t("client.settings.updating") : t("client.settings.updatePassword")}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          style={{
            fontSize: 12,
            fontWeight: 500,
            padding: "6px 12px",
            borderRadius: 7,
            border: `1px solid ${C.borderSoft}`,
            background: "transparent",
            color: C.inkMuted,
            cursor: pending ? "default" : "pointer",
            fontFamily: FONT,
          }}
        >
          {t("client.settings.cancel")}
        </button>
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  onEnter?: () => void;
}) {
  return (
    <input
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
      style={{
        width: "100%",
        maxWidth: 360,
        padding: "8px 10px",
        borderRadius: 8,
        border: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
        fontSize: 13,
        color: C.ink,
        background: "#fff",
        outline: "none",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = C.blue; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = C.borderSoft; }}
    />
  );
}
