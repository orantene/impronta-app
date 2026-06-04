"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  connectManualTalentIntegrationAction,
  disconnectTalentIntegrationAction,
  fetchTalentConnectionSettingsAction,
  saveTalentIntegrationControlsAction,
  type TalentConnectionProviderState,
} from "@/lib/talent-integrations/actions";
import { getTalentIntegrationCatalogList } from "@/lib/talent-integrations/catalog";
import {
  CapsLabel,
  Divider,
  DrawerShell,
  PrimaryButton,
  SecondaryButton,
  StatDot,
  TextInput,
  Toggle,
} from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS, useAdminShell } from "@/components/admin/shell/internal/state";
import { TalentFeaturedMediaSection } from "./TalentFeaturedMediaSection";

const fallbackProviders: TalentConnectionProviderState[] =
  getTalentIntegrationCatalogList().map((def) => ({
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
  | "publicBadgeEnabled"
  | "agencyVisible"
  | "publicProfileEnabled"
  | "personalSiteEnabled"
  | "autoRefreshEnabled"
  | "calendarAvailabilityEnabled"
  | "calendarWriteEnabled";

const CONTROL_COPY: Array<{
  key: ControlKey;
  label: string;
  description: string;
  capability?: string;
}> = [
  {
    key: "agencyVisible",
    label: "Share connection status with agencies",
    description: "Agencies can see that this account is connected, not your private tokens.",
  },
  {
    key: "publicBadgeEnabled",
    label: "Show verified badge",
    description: "Only becomes a trust badge after Tulala verifies ownership through OAuth/API.",
    capability: "public_profile_badge",
  },
  {
    key: "publicProfileEnabled",
    label: "Show on public profile",
    description: "Adds the selected account or item to your Tulala profile when available.",
  },
  {
    key: "personalSiteEnabled",
    label: "Use in My pages",
    description: "Makes the connection available to your personal page builder.",
    capability: "personal_site_embed",
  },
  {
    key: "autoRefreshEnabled",
    label: "Auto-refresh selected media",
    description: "Lets Tulala refresh approved items so your page stays current.",
    capability: "media_import",
  },
  {
    key: "calendarAvailabilityEnabled",
    label: "Use busy/free for booking availability",
    description: "Reads busy blocks so coordinators avoid double-booking you.",
    capability: "availability_read",
  },
  {
    key: "calendarWriteEnabled",
    label: "Create confirmed booking events",
    description: "Writes confirmed Tulala bookings to your external calendar.",
    capability: "booking_write",
  },
];

function defaultControls(provider: TalentConnectionProviderState) {
  return provider.row?.controls ?? {
    publicBadgeEnabled: false,
    agencyVisible: true,
    publicProfileEnabled: false,
    personalSiteEnabled: false,
    autoRefreshEnabled: false,
    calendarAvailabilityEnabled: false,
    calendarWriteEnabled: false,
  };
}

function statusMeta(provider: TalentConnectionProviderState) {
  const status = provider.row?.status ?? "not_connected";
  if (status === "connected") {
    return { label: "Connected", tone: "green" as const };
  }
  if (status === "pending" || status === "needs_reauth") {
    return { label: status === "pending" ? "Pending" : "Reconnect", tone: "amber" as const };
  }
  if (status === "error") {
    return { label: "Needs attention", tone: "red" as const };
  }
  return { label: "Not connected", tone: "dim" as const };
}

function ProviderCard({
  provider,
  selected,
  onSelect,
}: {
  provider: TalentConnectionProviderState;
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
        padding: "11px 12px",
        borderRadius: 10,
        border: `1px solid ${selected ? COLORS.accent : COLORS.borderSoft}`,
        background: selected ? "rgba(15,79,62,0.06)" : "#fff",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
      }}
    >
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>
          {provider.label}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
          {provider.category} · {provider.connectionMethods.join(" / ")}
        </div>
      </div>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          color:
            meta.tone === "green"
              ? COLORS.successDeep
              : meta.tone === "amber"
                ? COLORS.amberDeep
                : meta.tone === "red"
                  ? COLORS.criticalDeep
                  : COLORS.inkMuted,
        }}
      >
        <StatDot tone={meta.tone} />
        {meta.label}
      </span>
    </button>
  );
}

export function TalentConnectionsDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const open = state.drawer.drawerId === "talent-connections";
  const [providers, setProviders] = useState<TalentConnectionProviderState[]>(fallbackProviders);
  const [selectedKey, setSelectedKey] = useState(fallbackProviders[0]?.key ?? "");
  const [profileUrl, setProfileUrl] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const result = await fetchTalentConnectionSettingsAction();
      setProviders(result.providers);
      if (!result.ok) setMessage(result.error);
    });
  }, [open]);

  const selected = useMemo(
    () => providers.find((p) => p.key === selectedKey) ?? providers[0],
    [providers, selectedKey],
  );
  const controls = selected ? defaultControls(selected) : defaultControls(fallbackProviders[0]);
  const canManualConnect = selected?.connectionMethods.includes("manual") ?? false;
  const canOAuthConnect = selected?.key === "youtube";
  const accountHint = selected?.profileUrlHint ?? "https://...";

  function mergeSelected(next: TalentConnectionProviderState | null) {
    if (!next) return;
    setProviders((current) => current.map((p) => (p.key === next.key ? next : p)));
  }

  function saveControl(key: ControlKey, value: boolean) {
    if (!selected) return;
    setProviders((current) =>
      current.map((p) => {
        if (p.key !== selected.key) return p;
        const row = p.row ?? {
          status: "not_connected" as const,
          providerAccountLabel: null,
          providerAccountId: null,
          connectionMethod: p.connectionMethods[0] ?? "manual",
          lastSyncAt: null,
          lastVerifiedAt: null,
          lastError: null,
          controls: defaultControls(p),
        };
        return {
          ...p,
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
      const result = await saveTalentIntegrationControlsAction({
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
      const result = await connectManualTalentIntegrationAction({
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
      setMessage("Connection saved. Manual links are display-ready but not verification badges.");
    });
  }

  function connectOAuth() {
    if (!selected || selected.key !== "youtube") return;
    const returnTo = window.location.pathname + window.location.search;
    const url = new URL("/api/connections/oauth/start", window.location.origin);
    url.searchParams.set("owner", "talent");
    url.searchParams.set("provider", selected.key);
    url.searchParams.set("returnTo", returnTo);
    window.location.href = url.toString();
  }

  function disconnectSelected() {
    if (!selected) return;
    startTransition(async () => {
      setMessage(null);
      const result = await disconnectTalentIntegrationAction({
        providerKey: selected.key,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      mergeSelected(result.provider);
      setMessage("Connection turned off and stored OAuth tokens were removed.");
    });
  }

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Connections & verification"
      description="Connect accounts once, then choose exactly where Tulala can use each one."
      width={740}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid rgba(15,79,62,0.18)`,
          background: "rgba(15,79,62,0.06)",
          fontFamily: FONTS.body,
          color: COLORS.ink,
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
          What Tulala stores
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: COLORS.inkMuted }}>
          We store connection status, the public account label, your consent switches, and encrypted provider tokens when OAuth is enabled. You choose separately whether an account can verify you, appear on your public profile, power My pages, or help calendar availability.
        </div>
      </div>

      {!bridgeTalentSelfProfile ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${COLORS.borderSoft}`,
            background: COLORS.surfaceAlt,
            fontFamily: FONTS.body,
            fontSize: 12,
            color: COLORS.inkMuted,
            marginBottom: 14,
          }}
        >
          Preview mode: sign in as a real talent to save connections.
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(210px, 0.9fr) minmax(0, 1.4fr)", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {providers.map((provider) => (
            <ProviderCard
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
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              background: "#fff",
              padding: "14px 16px",
              fontFamily: FONTS.body,
              minWidth: 0,
            }}
          >
            <CapsLabel>{selected.category}</CapsLabel>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginTop: 6 }}>
              <div>
                <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 700, color: COLORS.ink }}>
                  {selected.label}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.55, color: COLORS.inkMuted }}>
                  {selected.consentSummary}
                </p>
              </div>
              <span style={{ whiteSpace: "nowrap", fontSize: 11.5, fontWeight: 700, color: COLORS.inkMuted }}>
                {statusMeta(selected).label}
              </span>
            </div>

            <Divider label="Use this connection for" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CONTROL_COPY.filter((control) => !control.capability || selected.capabilities.includes(control.capability)).map((control) => (
                <div
                  key={control.key}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "9px 10px",
                    borderRadius: 10,
                    background: COLORS.surfaceAlt,
                  }}
                >
                  <Toggle
                    on={Boolean(controls[control.key])}
                    onChange={(value) => saveControl(control.key, value)}
                    label={control.label}
                  />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.ink }}>
                      {control.label}
                    </div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.45, color: COLORS.inkMuted, marginTop: 2 }}>
                      {control.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {canOAuthConnect ? (
              <>
                <Divider label="One-click connection" />
                <div style={{ display: "grid", gap: 8 }}>
                  <PrimaryButton onClick={connectOAuth} disabled={isPending}>
                    Connect with YouTube
                  </PrimaryButton>
                  <div style={{ fontSize: 11.5, lineHeight: 1.45, color: COLORS.inkMuted }}>
                    You will approve read-only channel access with Google. Tulala stores encrypted tokens and marks the channel as verified ownership.
                  </div>
                </div>
              </>
            ) : null}

            {canManualConnect ? (
              <>
                <Divider label="Manual connection" />
                <div style={{ display: "grid", gap: 8 }}>
                  <TextInput
                    value={profileUrl}
                    onChange={(e) => setProfileUrl(e.target.value)}
                    placeholder={accountHint}
                  />
                  <TextInput
                    value={accountLabel}
                    onChange={(e) => setAccountLabel(e.target.value)}
                    placeholder="Display label (optional)"
                  />
                  <PrimaryButton onClick={connectManual} disabled={isPending || !profileUrl.trim()}>
                    {isPending ? "Saving..." : "Save manual connection"}
                  </PrimaryButton>
                  {selected.row?.status === "connected" ? (
                    <SecondaryButton onClick={disconnectSelected}>
                      Turn off connection
                    </SecondaryButton>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <Divider label="One-click connection" />
                <div style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                  OAuth callback wiring is the next provider-specific slice. The consent model and storage are ready for it.
                </div>
              </>
            )}

            <Divider label="Provider notes" />
            <ul style={{ margin: 0, paddingLeft: 18, color: COLORS.inkMuted, fontSize: 12, lineHeight: 1.55 }}>
              {selected.setupCopy.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {bridgeTalentSelfProfile ? (
        <TalentFeaturedMediaSection active={open} />
      ) : null}

      {message ? (
        <div style={{ marginTop: 14, fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted }}>
          {message}
        </div>
      ) : null}
    </DrawerShell>
  );
}
