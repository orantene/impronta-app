"use client";

/**
 * WebsiteTracking.tsx — Website → Setup → Tracking.
 *
 * Replaces the "Tracking — not set up yet" placeholder card that PR #1244
 * shipped. One row per provider: paste the ID, it saves, and the provider's
 * snippet starts running on the tenant's public site. Clearing the field
 * disconnects it.
 *
 * WHO CAN SEE IT
 * ──────────────
 * The server action gate is `manage_agency_domains` (owner-only — see
 * `lib/server-actions/admin-tracking.ts` for why this is owner class and not
 * editor class). This component mirrors that with `meetsRole(role, "owner")` so
 * a manager is told plainly that this is an owner surface instead of being shown
 * controls that would fail on click. The client check is a courtesy; the server
 * check is the security boundary.
 *
 * COPY RULES THIS FILE FOLLOWS
 * ────────────────────────────
 * The reader is an agency owner, not a marketer with a tag-manager
 * certification. Every provider row carries an InfoTip that says, in one or two
 * plain sentences, what that account does and where to find the ID. A rejected
 * ID gets the provider's own sentence back, describing what a correct one looks
 * like, because a silently wrong ID is a tracker that never fires while this
 * screen says "Connected".
 *
 * STYLING — token classes only (`ratchet/no-new-inline-style`). No `style={{}}`
 * anywhere in this file.
 */

import { useEffect, useState } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { useT } from "@/i18n/use-t";
import {
  TRACKING_ID_MAX,
  TRACKING_PROVIDER_IDS,
  type TenantTrackingConfig,
  type TrackingProviderId,
} from "@/lib/site-admin/tracking";
import { readTrackingSettings, saveTrackingId } from "@/lib/server-actions/admin-tracking";

import { meetsRole, useAdminShell } from "../state";

const FIELD_CLASS =
  "w-full min-w-0 rounded-admin-sm border border-admin-border bg-admin-card px-[10px] py-[7px] font-mono text-admin-12h text-admin-ink outline-none";

const BUTTON_CLASS =
  "shrink-0 cursor-pointer rounded-admin-md border border-admin-border bg-admin-accent-soft px-[12px] py-[6px] text-admin-11h font-semibold text-admin-accent-deep disabled:cursor-not-allowed disabled:opacity-50";

type ProviderCopy = {
  name: string;
  info: string;
  fieldLabel: string;
  placeholder: string;
};

/**
 * Per-provider copy, resolved with LITERAL keys.
 *
 * A tidier `t(\`…${provider}.name\`)` would be unreadable to
 * `message-key-usage.static.test.ts`, which relates every catalog key to a
 * literal call site: eight perfectly live keys would be reported as dead. The
 * repetition here is what keeps that guard able to see this surface.
 */
function providerCopy(
  t: (key: string) => string,
  provider: TrackingProviderId,
): ProviderCopy {
  switch (provider) {
    case "ga4":
      return {
        name: t("dashboard.adminWebsite.setup.tracking.ga4.name"),
        info: t("dashboard.adminWebsite.setup.tracking.ga4.info"),
        fieldLabel: t("dashboard.adminWebsite.setup.tracking.ga4.fieldLabel"),
        placeholder: t("dashboard.adminWebsite.setup.tracking.ga4.placeholder"),
      };
    case "gtm":
      return {
        name: t("dashboard.adminWebsite.setup.tracking.gtm.name"),
        info: t("dashboard.adminWebsite.setup.tracking.gtm.info"),
        fieldLabel: t("dashboard.adminWebsite.setup.tracking.gtm.fieldLabel"),
        placeholder: t("dashboard.adminWebsite.setup.tracking.gtm.placeholder"),
      };
    case "metaPixel":
      return {
        name: t("dashboard.adminWebsite.setup.tracking.metaPixel.name"),
        info: t("dashboard.adminWebsite.setup.tracking.metaPixel.info"),
        fieldLabel: t("dashboard.adminWebsite.setup.tracking.metaPixel.fieldLabel"),
        placeholder: t("dashboard.adminWebsite.setup.tracking.metaPixel.placeholder"),
      };
    case "plausible":
      return {
        name: t("dashboard.adminWebsite.setup.tracking.plausible.name"),
        info: t("dashboard.adminWebsite.setup.tracking.plausible.info"),
        fieldLabel: t("dashboard.adminWebsite.setup.tracking.plausible.fieldLabel"),
        placeholder: t("dashboard.adminWebsite.setup.tracking.plausible.placeholder"),
      };
  }
}

export function WebsiteTracking() {
  const t = useT();
  const { state } = useAdminShell();
  const canManage = meetsRole(state.role, "owner");

  const [config, setConfig] = useState<TenantTrackingConfig>({});
  const [drafts, setDrafts] = useState<Partial<Record<TrackingProviderId, string>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<TrackingProviderId | null>(null);
  const [errors, setErrors] = useState<Partial<Record<TrackingProviderId, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!canManage) {
      setLoading(false);
      return;
    }
    readTrackingSettings()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(res.error);
          return;
        }
        setConfig(res.config);
        setDrafts({ ...res.config });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  async function onSave(provider: TrackingProviderId) {
    setBusy(provider);
    setNotice(null);
    setErrors((prev) => ({ ...prev, [provider]: undefined }));
    const res = await saveTrackingId({ provider, value: drafts[provider] ?? "" });
    setBusy(null);
    if (!res.ok) {
      setErrors((prev) => ({ ...prev, [provider]: res.error }));
      return;
    }
    setConfig(res.config);
    setDrafts((prev) => ({ ...prev, [provider]: res.config[provider] ?? "" }));
    setNotice(
      res.config[provider]
        ? t("dashboard.adminWebsite.setup.tracking.connectedNotice")
        : t("dashboard.adminWebsite.setup.tracking.disconnectedNotice"),
    );
  }

  if (!canManage) {
    return (
      <p className="m-0 text-admin-11h leading-relaxed text-admin-ink-muted">
        {t("dashboard.adminWebsite.setup.tracking.ownerOnly")}
      </p>
    );
  }

  if (loading) {
    return (
      <p className="m-0 text-admin-11h text-admin-ink-muted">
        {t("dashboard.adminWebsite.setup.tracking.loading")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <p className="m-0 rounded-admin-md border border-admin-border-soft bg-admin-surface-alt p-[10px] text-admin-11h leading-relaxed text-admin-ink-muted">
        {t("dashboard.adminWebsite.setup.tracking.intro")}
      </p>

      {loadError ? (
        <p className="m-0 text-admin-11h text-admin-critical">{loadError}</p>
      ) : null}
      {notice ? (
        <p className="m-0 text-admin-11h text-admin-success-deep">{notice}</p>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-[8px] p-0">
        {TRACKING_PROVIDER_IDS.map((provider) => {
          const copy = providerCopy(t, provider);
          const connected = Boolean(config[provider]);
          const dirty = (drafts[provider] ?? "") !== (config[provider] ?? "");
          return (
            <li
              key={provider}
              className="flex flex-col gap-[6px] rounded-admin-md border border-admin-border bg-admin-card p-[10px]"
            >
              <div className="flex flex-wrap items-center gap-[8px]">
                <span className="text-admin-12h font-semibold text-admin-ink">
                  {copy.name}
                </span>
                <InfoTip
                  label={copy.info}
                  triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
                  placement="bottom-start"
                  className="text-admin-ink-dim hover:text-admin-ink"
                />
                <span
                  className={`ml-auto shrink-0 rounded-admin-sm bg-admin-surface-alt px-[7px] py-px text-admin-10 font-semibold uppercase tracking-[0.5px] ${
                    connected ? "text-admin-success-deep" : "text-admin-ink-dim"
                  }`}
                >
                  {connected
                    ? t("dashboard.adminWebsite.setup.tracking.statusConnected")
                    : t("dashboard.adminWebsite.setup.tracking.statusNotConnected")}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-[8px]">
                <label className="flex min-w-[220px] flex-1 flex-col gap-[3px]">
                  <span className="text-admin-10h font-semibold uppercase tracking-[0.5px] text-admin-ink-muted">
                    {copy.fieldLabel}
                  </span>
                  <input
                    className={FIELD_CLASS}
                    value={drafts[provider] ?? ""}
                    maxLength={TRACKING_ID_MAX}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={copy.placeholder}
                    onChange={(e) => {
                      setNotice(null);
                      setErrors((prev) => ({ ...prev, [provider]: undefined }));
                      setDrafts((prev) => ({ ...prev, [provider]: e.target.value }));
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={`${BUTTON_CLASS} self-end`}
                  disabled={busy === provider || !dirty}
                  onClick={() => void onSave(provider)}
                >
                  {busy === provider
                    ? t("dashboard.adminWebsite.setup.tracking.savingAction")
                    : (drafts[provider] ?? "").trim() === ""
                      ? t("dashboard.adminWebsite.setup.tracking.disconnectAction")
                      : t("dashboard.adminWebsite.setup.tracking.saveAction")}
                </button>
              </div>

              {errors[provider] ? (
                <p className="m-0 text-admin-11h leading-relaxed text-admin-critical">
                  {errors[provider]}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="m-0 text-admin-10h leading-relaxed text-admin-ink-dim">
        {t("dashboard.adminWebsite.setup.tracking.consentNote")}
      </p>
    </div>
  );
}
