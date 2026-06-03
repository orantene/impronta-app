"use client";

import * as React from "react";

import {
  connectManualClientIntegrationAction,
  disconnectClientIntegrationAction,
  fetchClientConnectionSettingsAction,
  saveClientIntegrationControlsAction,
  type ClientConnectionProviderState,
} from "@/lib/client-integrations/actions";
import { getClientIntegrationCatalogList } from "@/lib/client-integrations/catalog";

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

const CONTROL_COPY: Array<{
  key: ControlKey;
  label: string;
  description: string;
  capability?: string;
}> = [
  {
    key: "trustSignalEnabled",
    label: "Use for trust verification",
    description: "Only OAuth-verified account ownership can affect trust. Manual links stay unverified.",
    capability: "verify_account",
  },
  {
    key: "agencyVisible",
    label: "Share with agencies",
    description: "Tenant staff can see connection status and account label for trust review.",
  },
  {
    key: "talentVisible",
    label: "Share with talent on inquiries",
    description: "Talent can see approved trust proof, not private content or tokens.",
    capability: "talent_inquiry_badge",
  },
  {
    key: "publicProfileEnabled",
    label: "Show on public client profile",
    description: "Reserved for future client/company profiles. Keep off unless you want this public later.",
  },
  {
    key: "autoRefreshEnabled",
    label: "Auto-refresh proof",
    description: "Refreshes account metadata after OAuth is available.",
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

function statusMeta(provider: ClientConnectionProviderState) {
  const status = provider.row?.status ?? "not_connected";
  const verification = provider.row?.verificationStatus;
  if (status === "connected" && verification === "oauth_verified") {
    return { label: "Verified", color: C.green };
  }
  if (status === "connected") {
    return { label: "Linked", color: C.amber };
  }
  if (status === "pending" || status === "needs_reauth") {
    return { label: status === "pending" ? "Pending" : "Reconnect", color: C.amber };
  }
  if (status === "error") {
    return { label: "Needs attention", color: C.red };
  }
  if (status === "disabled") {
    return { label: "Off", color: C.inkDim };
  }
  return { label: "Not connected", color: C.inkMuted };
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
      {checked ? "On" : "Off"}
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
  const meta = statusMeta(provider);
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

  const selected = React.useMemo(
    () => providers.find((provider) => provider.key === selectedKey) ?? providers[0],
    [providers, selectedKey],
  );
  const controls = selected ? defaultControls(selected) : defaultControls(fallbackProviders[0]);
  const accountHint = selected?.profileUrlHint ?? "https://...";
  const canManualConnect = selected?.connectionMethods.includes("manual") ?? false;
  const selectedStatus = selected ? statusMeta(selected) : null;

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
      setMessage("Connection saved. Manual links are shared context, not verified trust proof.");
    });
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
      setMessage("Connection turned off for agency and talent trust views.");
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
          What Tulala does with connected accounts
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: C.inkMuted }}>
          We store the public account label, connection status, your sharing switches, and encrypted OAuth tokens only when a one-click provider is enabled. Manual links can help agencies and talent recognize you, but only verified provider ownership can become a trust signal.
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
                      {control.label}
                    </div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.45, color: C.inkMuted, marginTop: 2 }}>
                      {control.description}
                    </div>
                  </div>
                  <Toggle
                    checked={Boolean(controls[control.key])}
                    onChange={(value) => saveControl(control.key, value)}
                    label={control.label}
                  />
                </div>
              ))}
            </div>

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
                    placeholder="Display label (optional)"
                  />
                  <div className="flex flex-wrap gap-2">
                    <SmallButton onClick={connectManual} disabled={isPending || !profileUrl.trim()}>
                      {isPending ? "Saving..." : "Save link"}
                    </SmallButton>
                    {selected.row?.status === "connected" ? (
                      <SmallButton onClick={disconnectSelected} disabled={isPending} variant="danger">
                        Turn off
                      </SmallButton>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ height: 1, background: C.border, margin: "13px 0" }} />
                <div style={{ fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
                  One-click OAuth is the next provider-specific step. This consent and storage foundation is ready for it.
                </div>
              </>
            )}

            <details style={{ marginTop: 13 }}>
              <summary style={{ fontSize: 12, color: C.accent, fontWeight: 800, cursor: "pointer" }}>
                Provider notes
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
