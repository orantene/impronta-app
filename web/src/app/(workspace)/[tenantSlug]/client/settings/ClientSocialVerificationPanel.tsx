"use client";

import * as React from "react";

import { useT } from "@/i18n/use-t";
import {
  connectManualClientIntegrationAction,
  disconnectClientIntegrationAction,
  fetchClientConnectionSettingsAction,
  saveClientIntegrationControlsAction,
  type ClientConnectionProviderState,
} from "@/lib/client-integrations/actions";
import { getClientIntegrationCatalogList } from "@/lib/client-integrations/catalog";
import {
  clearConnectionFeedbackParams,
  readConnectionFeedback,
} from "@/lib/connection-oauth/connection-feedback";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  borderStrong: "rgba(37,99,235,0.22)",
  cardBg: "#ffffff",
  surface: "rgba(24,24,27,0.035)",
  accent: "#1D4ED8",
  blueSoft: "rgba(37,99,235,0.08)",
  green: "#2E7D5B",
  amber: "#D97706",
  red: "#B42318",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const fallbackProviders: ClientConnectionProviderState[] =
  getClientIntegrationCatalogList().map((def) => ({
    key: def.key,
    label: def.label,
    category: def.category,
    connectionMethods: def.connectionMethods,
    capabilities: def.capabilities,
    consentSummary: def.consentSummary,
    setupCopy: def.setupCopy,
    profileUrlHint: def.fieldHints?.profileUrl ?? null,
    row: null,
  }));

type ControlKey =
  | "trustSignalEnabled"
  | "agencyVisible"
  | "talentVisible"
  | "publicProfileEnabled"
  | "autoRefreshEnabled";

// English label/description stay as the non-UI fallback; *Key is the localized
// display path (same additive pattern as lib/status-labels.ts).
const CONTROL_COPY: Array<{
  key: ControlKey;
  label: string;
  labelKey: string;
  description: string;
  descriptionKey: string;
  capability?: string;
}> = [
  {
    key: "trustSignalEnabled",
    label: "Use for trust verification",
    labelKey: "client.settings.social.trustSignalLabel",
    description: "Only OAuth-verified account ownership can affect trust. Manual links stay unverified.",
    descriptionKey: "client.settings.social.trustSignalDescription",
    capability: "verify_account",
  },
  {
    key: "agencyVisible",
    label: "Share with agencies",
    labelKey: "client.settings.social.agencyVisibleLabel",
    description: "Tenant staff can see connection status and account label for trust review.",
    descriptionKey: "client.settings.social.agencyVisibleDescription",
  },
  {
    key: "talentVisible",
    label: "Share with talent on inquiries",
    labelKey: "client.settings.social.talentVisibleLabel",
    description: "Talent can see approved trust proof, not private content or tokens.",
    descriptionKey: "client.settings.social.talentVisibleDescription",
    capability: "talent_inquiry_badge",
  },
  {
    key: "publicProfileEnabled",
    label: "Show on public client profile",
    labelKey: "client.settings.social.publicProfileLabel",
    description: "Reserved for future client/company profiles. Keep off unless you want this public later.",
    descriptionKey: "client.settings.social.publicProfileDescription",
  },
  {
    key: "autoRefreshEnabled",
    label: "Auto-refresh proof",
    labelKey: "client.settings.social.autoRefreshLabel",
    description: "Refreshes account metadata after OAuth is available.",
    descriptionKey: "client.settings.social.autoRefreshDescription",
    capability: "verify_account",
  },
];

function defaultControls(provider: ClientConnectionProviderState) {
  return provider.row?.controls ?? {
    trustSignalEnabled: false,
    agencyVisible: true,
    talentVisible: true,
    publicProfileEnabled: false,
    autoRefreshEnabled: false,
  };
}

function statusMeta(provider: ClientConnectionProviderState, t: (key: string) => string) {
  const status = provider.row?.status ?? "not_connected";
  const verification = provider.row?.verificationStatus;
  if (status === "connected" && verification === "oauth_verified") {
    return { label: t("client.settings.social.statusVerified"), color: C.green };
  }
  if (status === "connected") {
    return { label: t("client.settings.social.statusLinked"), color: C.amber };
  }
  if (status === "pending" || status === "needs_reauth") {
    return {
      label:
        status === "pending"
          ? t("client.settings.social.statusPending")
          : t("client.settings.social.statusReconnect"),
      color: C.amber,
    };
  }
  if (status === "error") {
    return { label: t("client.settings.social.statusError"), color: C.red };
  }
  if (status === "disabled") {
    return { label: t("client.settings.social.statusOff"), color: C.inkDim };
  }
  return { label: t("client.settings.social.statusNotConnected"), color: C.inkMuted };
}

function SmallButton({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 34,
        padding: "0 14px",
        borderRadius: 8,
        border: isPrimary ? "none" : `1px solid ${C.border}`,
        background: isPrimary ? C.accent : C.cardBg,
        color: isPrimary ? "#fff" : variant === "danger" ? C.red : C.ink,
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        minHeight: 36,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        padding: "0 10px",
        fontFamily: FONT,
        fontSize: 12.5,
        color: C.ink,
        outline: "none",
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const t = useT();
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minWidth: 112,
        cursor: "pointer",
        fontFamily: FONT,
        fontSize: 12,
        fontWeight: 700,
        color: C.ink,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        style={{ width: 16, height: 16, accentColor: C.accent }}
      />
      {checked ? t("client.settings.social.toggleOn") : t("client.settings.social.toggleOff")}
    </label>
  );
}

function ProviderButton({
  provider,
  selected,
  onSelect,
}: {
  provider: ClientConnectionProviderState;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const meta = statusMeta(provider, t);
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 11px",
        borderRadius: 8,
        border: `1px solid ${selected ? C.borderStrong : C.border}`,
        background: selected ? C.blueSoft : C.cardBg,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONT,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{provider.label}</div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
          {provider.category} · {provider.connectionMethods.join(" / ")}
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, whiteSpace: "nowrap" }}>
        {meta.label}
      </span>
    </button>
  );
}

export function ClientSocialVerificationPanel({ tenantSlug }: { tenantSlug: string }) {
  const t = useT();
  const [providers, setProviders] = React.useState<ClientConnectionProviderState[]>(fallbackProviders);
  const [selectedKey, setSelectedKey] = React.useState(fallbackProviders[0]?.key ?? "");
  const [profileUrl, setProfileUrl] = React.useState("");
  const [accountLabel, setAccountLabel] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    startTransition(async () => {
      const result = await fetchClientConnectionSettingsAction();
      setProviders(result.providers);
      if (!result.ok) setMessage(result.error);
    });
  }, []);

  // Surface the OAuth round-trip result the callback redirected back with
  // (?connection_error=... / ?connection=...). Without this the connect button
  // looks dead — especially in the OAuth-dormant state (oauth_setup).
  React.useEffect(() => {
    const feedback = readConnectionFeedback(window.location.search);
    if (feedback) {
      setMessage(feedback.message);
      clearConnectionFeedbackParams();
    }
  }, []);

  const selected = React.useMemo(
    () => providers.find((provider) => provider.key === selectedKey) ?? providers[0],
    [providers, selectedKey],
  );
  const controls = selected ? defaultControls(selected) : defaultControls(fallbackProviders[0]);
  const accountHint = selected?.profileUrlHint ?? "https://...";
  const canManualConnect = selected?.connectionMethods.includes("manual") ?? false;
  const canOAuthConnect = selected?.key === "youtube";
  const selectedStatus = selected ? statusMeta(selected, t) : null;

  function mergeSelected(next: ClientConnectionProviderState | null) {
    if (!next) return;
    setProviders((current) => current.map((provider) => (provider.key === next.key ? next : provider)));
  }

  function saveControl(key: ControlKey, value: boolean) {
    if (!selected) return;
    setProviders((current) =>
      current.map((provider) => {
        if (provider.key !== selected.key) return provider;
        const row = provider.row ?? {
          status: "not_connected" as const,
          providerAccountLabel: null,
          providerAccountId: null,
          connectionMethod: provider.connectionMethods[0] ?? "manual",
          lastSyncAt: null,
          lastVerifiedAt: null,
          lastError: null,
          verificationStatus: null,
          controls: defaultControls(provider),
        };
        return {
          ...provider,
          row: {
            ...row,
            controls: {
              ...row.controls,
              [key]: value,
            },
          },
        };
      }),
    );

    startTransition(async () => {
      setMessage(null);
      const result = await saveClientIntegrationControlsAction({
        tenantSlug,
        providerKey: selected.key,
        controls: { [key]: value },
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      mergeSelected(result.provider);
    });
  }

  function connectManual() {
    if (!selected || !profileUrl.trim()) return;
    startTransition(async () => {
      setMessage(null);
      const result = await connectManualClientIntegrationAction({
        tenantSlug,
        providerKey: selected.key,
        profileUrl: profileUrl.trim(),
        accountLabel: accountLabel.trim() || undefined,
        controls,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      mergeSelected(result.provider);
      setProfileUrl("");
      setAccountLabel("");
      setMessage(t("client.settings.social.savedNotice"));
    });
  }

  function connectOAuth() {
    if (!selected || selected.key !== "youtube") return;
    const returnTo = window.location.pathname + window.location.search;
    const url = new URL("/api/connections/oauth/start", window.location.origin);
    url.searchParams.set("owner", "client");
    url.searchParams.set("provider", selected.key);
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("returnTo", returnTo);
    window.location.href = url.toString();
  }

  function disconnectSelected() {
    if (!selected) return;
    startTransition(async () => {
      setMessage(null);
      const result = await disconnectClientIntegrationAction({
        tenantSlug,
        providerKey: selected.key,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      mergeSelected(result.provider);
      setMessage(t("client.settings.social.turnedOffNotice"));
    });
  }

  return (
    <section className="flex flex-col gap-3" style={{ fontFamily: FONT }}>
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${C.borderStrong}`,
          background: C.blueSoft,
          color: C.ink,
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>
          {t("client.settings.social.explainerTitle")}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: C.inkMuted }}>
          {t("client.settings.social.explainerBody")}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.78fr) minmax(0, 1.22fr)", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {providers.map((provider) => (
            <ProviderButton
              key={provider.key}
              provider={provider}
              selected={provider.key === selected?.key}
              onSelect={() => {
                setSelectedKey(provider.key);
                setMessage(null);
              }}
            />
          ))}
        </div>

        {selected ? (
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              background: C.cardBg,
              padding: "13px 14px",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: C.inkDim, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {selected.category}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, marginTop: 3 }}>
                  {selected.label}
                </div>
                <p style={{ margin: "5px 0 0", fontSize: 12.5, lineHeight: 1.5, color: C.inkMuted }}>
                  {selected.consentSummary}
                </p>
              </div>
              {selectedStatus ? (
                <span style={{ color: selectedStatus.color, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {selectedStatus.label}
                </span>
              ) : null}
            </div>

            <div style={{ height: 1, background: C.border, margin: "13px 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CONTROL_COPY.filter((control) => !control.capability || selected.capabilities.includes(control.capability)).map((control) => (
                <div
                  key={control.key}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    padding: "9px 10px",
                    borderRadius: 8,
                    background: C.surface,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>
                      {t(control.labelKey) === control.labelKey ? control.label : t(control.labelKey)}
                    </div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.45, color: C.inkMuted, marginTop: 2 }}>
                      {t(control.descriptionKey) === control.descriptionKey
                        ? control.description
                        : t(control.descriptionKey)}
                    </div>
                  </div>
                  <Toggle
                    checked={Boolean(controls[control.key])}
                    onChange={(value) => saveControl(control.key, value)}
                    label={t(control.labelKey) === control.labelKey ? control.label : t(control.labelKey)}
                  />
                </div>
              ))}
            </div>

            {canOAuthConnect ? (
              <>
                <div style={{ height: 1, background: C.border, margin: "13px 0" }} />
                <div style={{ display: "grid", gap: 8 }}>
                  <SmallButton onClick={connectOAuth} disabled={isPending}>
                    {t("client.settings.social.connectYoutube")}
                  </SmallButton>
                  <div style={{ fontSize: 11.5, lineHeight: 1.45, color: C.inkMuted }}>
                    {t("client.settings.social.youtubeConsent")}
                  </div>
                </div>
              </>
            ) : null}

            {canManualConnect ? (
              <>
                <div style={{ height: 1, background: C.border, margin: "13px 0" }} />
                <div style={{ display: "grid", gap: 8 }}>
                  <TextInput
                    value={profileUrl}
                    onChange={setProfileUrl}
                    placeholder={accountHint}
                  />
                  <TextInput
                    value={accountLabel}
                    onChange={setAccountLabel}
                    placeholder={t("client.settings.social.displayLabelPlaceholder")}
                  />
                  <div className="flex flex-wrap gap-2">
                    <SmallButton onClick={connectManual} disabled={isPending || !profileUrl.trim()}>
                      {isPending ? t("client.settings.saving") : t("client.settings.social.saveLink")}
                    </SmallButton>
                    {selected.row?.status === "connected" ? (
                      <SmallButton onClick={disconnectSelected} disabled={isPending} variant="danger">
                        {t("client.settings.social.turnOff")}
                      </SmallButton>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ height: 1, background: C.border, margin: "13px 0" }} />
                <div style={{ fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
                  {t("client.settings.social.oauthComingSoon")}
                </div>
              </>
            )}

            <details style={{ marginTop: 13 }}>
              <summary style={{ fontSize: 12, color: C.accent, fontWeight: 800, cursor: "pointer" }}>
                {t("client.settings.social.providerNotes")}
              </summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: C.inkMuted, fontSize: 12, lineHeight: 1.55 }}>
                {selected.setupCopy.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
      </div>

      {message ? (
        <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.45 }}>
          {message}
        </div>
      ) : null}
    </section>
  );
}
