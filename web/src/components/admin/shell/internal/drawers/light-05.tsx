"use client";
import { logServerError } from "@/lib/server/safe-error";
import type { Locale } from "@/lib/site-admin/locales";
import { useDashboardText } from "../dashboard-i18n";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Bullet,
  COLORS,
  accentAlpha,
  DrawerShell,
  FONTS,
  FieldRow,
  GhostButton,
  Icon,
  PrimaryButton,
  RepresentationCard,
  RepresentationChip,
  RoleChip,
  SecondaryButton,
  Section,
  SelectInput,
  StandardFooter,
  StatDot,
  StateChip,
  StateExplainer,
  TALENT_STATE_LABEL,
  TextArea,
  TextInput,
  ToggleControl,
  ToggleRow,
  WEBSITE_STATE,
  loadAgencySettingsNamespace,
  loadWorkspaceAccountSettings,
  meetsPlan,
  meetsRole,
  patchAgencySettingsNamespace,
  updateTalentIdentity,
  updateWorkspaceAccount,
  updateWorkspaceFields,
  useAdminShell,
  useQueuedRouterRefresh,
  useSaveAndClose
} from "./drawer-shared";

// Phase 1d (remediation §4): 5 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

// Q5: extracted from DomainDrawer render so react-hooks/purity stops
// flagging the Date.now() call. The value is "days until SSL expires"
// computed against wall-clock — a per-render request-time read, but the
// rule (correctly) treats render-body Date.now() as impure.
function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400e3);
}

export function DomainDrawer() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { state, closeDrawer, openUpgrade, toast, effectiveTenant } = useAdminShell();
  const [pending, startTransition] = useTransition();
  const isStudio = meetsPlan(state.plan, "studio");
  // I3 — read live domain status from the Website page's source of
  // truth so the drawer stays in sync with WebsiteDomainPanel.
  const domain = WEBSITE_STATE.domain;
  const [customDomain, setCustomDomain] = useState(isStudio ? domain.primaryDomain : "");
  const [redirectToWww, setRedirectToWww] = useState(domain.redirectsToWww);
  const [loaded, setLoaded] = useState(false);

  // The assigned Tulala subdomain — always real, comes from the bridge.
  const tulalaSubdomain = effectiveTenant.domain;

  useEffect(() => {
    if (!isStudio) { setLoaded(true); return; }
    let cancelled = false;
    void loadAgencySettingsNamespace("", "domain").then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        const v = r.data as Record<string, unknown>;
        if (typeof v.customDomain === "string") setCustomDomain(v.customDomain);
        if (typeof v.redirectToWww === "boolean") setRedirectToWww(v.redirectToWww);
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [isStudio]);

  const onSave = () => {
    startTransition(async () => {
      const r = await patchAgencySettingsNamespace("", "domain", {
        customDomain: customDomain.trim(),
        redirectToWww,
      });
      if (!r.ok) toast(`Save failed: ${r.error}`);
      else { toast("Domain settings saved"); queueRouterRefresh(); closeDrawer(); }
    });
  };
  const sslDaysLeft = domain.sslExpiresOn ? daysUntil(domain.sslExpiresOn) : null;
  const dnsAllMatched = (domain.dnsRecords ?? []).every(r => r.matched);
  const verified = domain.status === "verified" && dnsAllMatched;
  const sslHealthy = domain.sslStatus === "active";
  const copyText = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    toast(`${label} copied`);
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Workspace domain"
      description={
        isStudio
          ? `Your storefront runs on ${domain.primaryDomain}.`
          : `Your storefront is live at ${tulalaSubdomain}.`
      }
      width={580}
      footer={
        isStudio
          ? <StandardFooter onSave={onSave} disabled={pending || !loaded} saveLabel={pending ? "Saving…" : "Save"} />
          : undefined
      }
    >
      <Section title="Your Tulala subdomain">
        <FieldRow label="Subdomain" hint="Always available — your permanent address on the platform.">
          {/* Read-only subdomain display with one-click copy.
              Every plan can see and copy this; no plan gate. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <div style={{
              flex: 1, display: "flex", alignItems: "center",
              padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              background: COLORS.surfaceAlt,
              fontFamily: "ui-monospace, monospace", fontSize: 13,
              overflow: "hidden",
            }}>
              <span style={{ color: COLORS.inkMuted, marginRight: 2, userSelect: "none" }}>https://</span>
              <span style={{ color: COLORS.ink, fontWeight: 500 }}>{tulalaSubdomain}</span>
            </div>
            <button
              type="button"
              onClick={() => copyText(`https://${tulalaSubdomain}`, "Subdomain URL")}
              style={{
                padding: "7px 14px", borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff", cursor: "pointer",
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
                color: COLORS.ink, flexShrink: 0,
              }}
            >
              Copy
            </button>
          </div>
        </FieldRow>
      </Section>

      {isStudio ? (
        <Section title="Custom domain" description="Point any domain you own at your Tulala storefront.">
          <FieldRow label="Custom domain" optional>
            <TextInput
              value={customDomain}
              onChange={(e) => setCustomDomain((e.target as HTMLInputElement).value)}
              placeholder="acme-models.com"
              prefix="https://"
            />
          </FieldRow>
          <FieldRow label="Redirect bare → www" optional hint="When on, atelier-roma.com is rewritten to www.atelier-roma.com at the edge.">
            <ToggleControl value={redirectToWww} label="" onChange={(v) => setRedirectToWww(v)} />
          </FieldRow>
        </Section>
      ) : (
        /* Free tier: show upsell instead of the custom-domain input. */
        <Section title="Custom domain" description="Run your storefront at your own brand's domain.">
          <div style={{
            padding: "16px 16px", borderRadius: 10,
            background: COLORS.accentSoft, border: `1px solid ${accentAlpha("20")}`,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>
              Your storefront lives at <span style={{ fontFamily: "ui-monospace, monospace", color: COLORS.accent }}>{tulalaSubdomain}</span>.
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
              Want a branded domain? Upgrade to Studio to connect your own domain (e.g.&nbsp;<em>your-agency.com</em>), auto-renew SSL, and use a verified email-from address.
            </div>
            <button
              type="button"
              onClick={() => {
                closeDrawer();
                openUpgrade({ feature: "Custom domain", why: "Run your storefront at your own brand's domain — not a Tulala subdomain.", unlocks: ["Custom domain (e.g. acme-models.com)", "Auto-renewed SSL", "Verified email-from address"] });
              }}
              style={{
                alignSelf: "flex-start",
                padding: "8px 16px", borderRadius: 999,
                border: "none", cursor: "pointer",
                background: COLORS.accent, color: "#fff",
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 700,
              }}
            >
              Upgrade to Studio →
            </button>
          </div>
        </Section>
      )}

      {isStudio && (
        <Section title="Verification & SSL">
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 14,
              display: "flex", flexDirection: "column", gap: 12,
            }}
          >
            {/* Status row */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div className="flex items-center gap-2">
                <StatDot tone={verified ? "green" : "amber"} />
                <span style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
                  {verified ? "Domain verified" : "Verification pending"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StatDot tone={sslHealthy ? "green" : "amber"} />
                <span style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
                  SSL {domain.sslStatus}
                </span>
                {sslDaysLeft !== null && (
                  <span style={{ fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">
                    · renews in {sslDaysLeft} days
                  </span>
                )}
              </div>
            </div>

            {/* DNS records */}
            {domain.dnsRecords && domain.dnsRecords.length > 0 && (
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6, fontFamily: FONTS.body }} className="text-admin-ink-muted">
                  DNS records
                </div>
                <div className="flex flex-col gap-1">
                  {domain.dnsRecords.map((r, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "60px 80px 1fr auto auto", gap: 8,
                      padding: "7px 10px", borderRadius: 8,
                      background: r.matched ? "rgba(46,125,91,0.05)" : "rgba(245,166,35,0.07)",
                      border: `1px solid ${r.matched ? "rgba(46,125,91,0.15)" : "rgba(245,166,35,0.20)"}`,
                      fontSize: 11.5, fontFamily: "ui-monospace, monospace",
                      alignItems: "center",
                    }}>
                      <span style={{ fontWeight: 600 }} className="text-admin-ink-muted">{r.type}</span>
                      <span className="text-admin-ink">{r.host}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink">{r.value}</span>
                      <button
                        type="button"
                        onClick={() => copyText(r.value, `${r.type} value`)}
                        style={{
                          padding: "2px 8px", borderRadius: 999,
                          border: `1px solid ${COLORS.borderSoft}`,
                          background: "#fff", cursor: "pointer",
                          fontSize: 10, fontWeight: 600, color: COLORS.inkMuted,
                          fontFamily: FONTS.body, letterSpacing: 0.3,
                        }}
                      >COPY</button>
                      <span style={{
                        color: r.matched ? COLORS.green : "#8a5a1f",
                        textAlign: "center", fontWeight: 700,
                        fontFamily: FONTS.body,
                      }}>
                        {r.matched ? "✓" : "!"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => toast("Re-checking DNS… (production: hits the verify endpoint)")}
              style={{
                alignSelf: "flex-start",
                padding: "6px 12px", borderRadius: 999,
                border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
                color: COLORS.ink, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
              }}
            >
              Re-check DNS
            </button>
          </div>
        </Section>
      )}

      {isStudio && domain.alternateDomains.length > 0 && (
        <Section title="Alternate domains" description="Additional domains that redirect to the primary.">
          <div className="flex flex-col gap-1.5">
            {domain.alternateDomains.map(d => (
              <div key={d.domain} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 10,
                background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
              }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }} className="text-admin-ink">
                  {d.domain}
                </span>
                <span style={{
                  padding: "2px 9px", borderRadius: 999,
                  background: d.status === "verified" ? "rgba(46,125,91,0.10)" : "rgba(245,166,35,0.12)",
                  color: d.status === "verified" ? COLORS.green : "#8a5a1f",
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
                  fontFamily: FONTS.body,
                }}>
                  {d.status === "verified" ? "VERIFIED" : "PENDING DNS"}
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => toast("Add alternate domain — wires to verification flow in production")}
              style={{
                padding: "8px 12px", borderRadius: 10,
                border: `1px dashed ${COLORS.borderStrong}`, background: "transparent",
                color: COLORS.inkMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body, textAlign: "left",
              }}
            >+ Add alternate domain</button>
          </div>
        </Section>
      )}

      {!isStudio && (
        <Section title="What Studio unlocks" description="Beyond your Tulala subdomain.">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {["Your own domain (e.g. acme-models.com)", "Auto-renewed SSL", "Verified email-from address", "Removed from Tulala discovery"].map((p) => (
              <li key={p} style={{ display: "flex", gap: 10, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>
                <Icon name="check" size={14} stroke={2} color={COLORS.green} />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Identity
// ════════════════════════════════════════════════════════════════════


export function IdentityDrawer() {
  const { closeDrawer, toast, tenantSlug, effectiveTenant } = useAdminShell();
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [displayName, setDisplayName] = useState(effectiveTenant.name);
  const [contactEmail, setContactEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!tenantSlug);

  useEffect(() => {
    if (!tenantSlug) { setIsLoading(false); return; }
    void (async () => {
      try {
        const res = await loadWorkspaceAccountSettings();
        if (res.ok) {
          if (res.data.displayName) setDisplayName(res.data.displayName);
          if (res.data.contactEmail) setContactEmail(res.data.contactEmail);
        }
      } finally { setIsLoading(false); }
    })();
  }, [tenantSlug]);

  const onSave = async () => {
    if (isSaving || isLoading) return;
    if (!tenantSlug) {
      toast("Identity saved (demo)");
      closeDrawer();
      return;
    }
    setIsSaving(true);
    try {
      const result = await updateWorkspaceAccount({
        display_name: displayName.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
      });
      if (!result.ok) {
        toast(result.error || "Couldn't save. Try again.");
        return;
      }
      toast("Identity saved");
      queueRouterRefresh();
      closeDrawer();
    } catch (err) {
      logServerError("updateworkspaceaccount", err);
      toast("Couldn't save. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Identity"
      description="The basics — who you are inside Tulala."
      footer={<StandardFooter onSave={onSave} disabled={isSaving || isLoading} saveLabel={isSaving ? "Saving…" : isLoading ? "Loading…" : "Save"} />}
    >
      <Section title="Workspace" framed>
        <FieldRow label="Workspace name" hint="Shown in browser tab, emails, and the public storefront.">
          <TextInput
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </FieldRow>
        <FieldRow label="Workspace slug" hint="Used in URLs. Slug change is a separate flow (URL redirect mapping required) — coming next iteration.">
          <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, fontSize: 13, fontFamily: FONTS.body }} className="bg-admin-surface-alt text-admin-ink-muted">tulala.app/{effectiveTenant.slug}</div>
        </FieldRow>
        <FieldRow label="Contact email">
          <TextInput
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="hello@your-agency.com"
          />
        </FieldRow>
        <FieldRow label="Support email" optional hint="Coming next iteration — stored under settings.support_email.">
          <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, fontSize: 13, fontFamily: FONTS.body, fontStyle: "italic" }} className="bg-admin-surface-alt text-admin-ink-dim">not yet wired</div>
        </FieldRow>
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Workspace settings
// ════════════════════════════════════════════════════════════════════


export function WorkspaceSettingsDrawer() {
  const { closeDrawer, toast, tenantSlug } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [defaultLocale, setDefaultLocale] = useState<Locale>("en");
  const [activeLocales, setActiveLocales] = useState<Locale[]>(["en"]);
  const [showLanguageSwitcher, setShowLanguageSwitcher] = useState(true);
  // Selectable languages — sourced from the `app_locales` registry via
  // loadWorkspaceAccountSettings (no longer a hardcoded ["en","es"] list).
  // Seeded with EN so the picker is never empty before the load resolves.
  const [availableLocales, setAvailableLocales] = useState<
    { code: Locale; labelNative: string; labelEn: string }[]
  >([{ code: "en", labelNative: "English", labelEn: "English" }]);
  const [timezone, setTimezone] = useState("America/Cancun");
  const [currency, setCurrency] = useState("USD");
  const [firstDay, setFirstDay] = useState("Monday");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!tenantSlug);

  useEffect(() => {
    if (!tenantSlug) { setIsLoading(false); return; }
    void (async () => {
      try {
        const res = await loadWorkspaceAccountSettings();
        if (res.ok) {
          if (res.data.availableLocales.length) setAvailableLocales(res.data.availableLocales);
          setDefaultLocale(res.data.defaultLocale);
          setActiveLocales(res.data.activeLocales.length ? res.data.activeLocales : [res.data.defaultLocale]);
          setShowLanguageSwitcher(res.data.showLanguageSwitcher);
          if (res.data.timezone) setTimezone(res.data.timezone);
          if (res.data.preferredCurrency) setCurrency(res.data.preferredCurrency);
        }
      } finally { setIsLoading(false); }
    })();
  }, [tenantSlug]);

  // Display label for a locale: native, plus the English name in parens when
  // it differs (so "Español (Spanish)" but just "English").
  const labelFor = useCallback((code: Locale): string => {
    const opt = availableLocales.find((o) => o.code === code);
    if (!opt) return code.toUpperCase();
    return opt.labelNative === opt.labelEn
      ? opt.labelNative
      : `${opt.labelNative} (${opt.labelEn})`;
  }, [availableLocales]);

  // The active list ORDER expresses priority (primary first → ordered
  // secondary). Keep the default/primary at index 0 whenever we mutate it so
  // the saved `supported_locales` array order is [primary, ...secondary].
  const orderPrimaryFirst = useCallback((list: Locale[], primary: Locale): Locale[] => {
    const rest = list.filter((l) => l !== primary);
    return list.includes(primary) ? [primary, ...rest] : rest;
  }, []);

  const localeLabel = labelFor(defaultLocale);
  const handleLocaleChange = (label: string) => {
    const match = availableLocales.find((o) => labelFor(o.code) === label);
    if (!match) return;
    setDefaultLocale(match.code);
    setActiveLocales((current) =>
      orderPrimaryFirst(
        current.includes(match.code) ? current : [...current, match.code],
        match.code,
      ),
    );
  };
  const toggleActiveLocale = (code: Locale, checked: boolean) => {
    const union = checked
      ? Array.from(new Set([...activeLocales, code]))
      : activeLocales.filter((l) => l !== code);
    if (union.length === 0) return;
    // If we just removed the current primary, promote the first survivor.
    const nextPrimary = union.includes(defaultLocale) ? defaultLocale : (union[0] ?? "en");
    if (nextPrimary !== defaultLocale) setDefaultLocale(nextPrimary);
    setActiveLocales(orderPrimaryFirst(union, nextPrimary));
  };
  const languagePreview =
    activeLocales.length > 1 && showLanguageSwitcher
      ? tt("Visitors can switch between {languages}.").replace(
          "{languages}",
          activeLocales.map((l) => l.toUpperCase()).join(" and "),
        )
      : activeLocales.length > 1
        ? tt("Visitors will use {language} by default; the public switcher is hidden.").replace(
            "{language}",
            defaultLocale.toUpperCase(),
          )
      : tt("Only {language} is active for this site.").replace(
          "{language}",
          activeLocales[0]?.toUpperCase() ?? defaultLocale.toUpperCase(),
        );

  // Render the active-languages checklist primary-first (active locales in
  // their saved priority order), then the remaining registry options — so the
  // UI order mirrors the persisted `supported_locales` priority.
  const orderedLocaleOptions: Locale[] = (() => {
    const inactive = availableLocales
      .map((o) => o.code)
      .filter((c) => !activeLocales.includes(c));
    return [...activeLocales, ...inactive];
  })();

  const currencyOptions = [
    { label: "USD $", value: "USD" },
    { label: "EUR €", value: "EUR" },
    { label: "GBP £", value: "GBP" },
    { label: "MXN $", value: "MXN" },
    { label: "BRL R$", value: "BRL" },
  ];
  const currencyLabel = currencyOptions.find((o) => o.value === currency)?.label ?? "USD $";
  const handleCurrencyChange = (label: string) => {
    const match = currencyOptions.find((o) => o.label === label);
    if (match) setCurrency(match.value);
  };

  const onSave = async () => {
    if (isSaving || isLoading) return;
    if (!tenantSlug) {
      toast(tt("Settings saved (demo)"));
      closeDrawer();
      return;
    }
    setIsSaving(true);
    try {
      const result = await updateWorkspaceFields({
        preferred_currency: currency,
        timezone,
        default_locale: defaultLocale,
        active_locales: activeLocales,
        show_language_switcher: showLanguageSwitcher,
      });
      if (!result.ok) {
        toast(result.error || tt("Couldn't save. Try again."));
        return;
      }
      toast(tt("Settings saved"));
      queueRouterRefresh();
      closeDrawer();
    } catch (err) {
      logServerError("updateworkspacefields", err);
      toast(tt("Couldn't save. Try again."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Workspace settings")}
      description={tt("Operational defaults — language, currency, timezone.")}
      footer={<StandardFooter onSave={onSave} disabled={isSaving || isLoading} saveLabel={isSaving ? tt("Saving…") : isLoading ? tt("Loading…") : tt("Save")} />}
    >
      <Section title={tt("Language & localization")} framed>
        <FieldRow label={tt("Default public language")}>
          <SelectInput
            options={availableLocales.map((o) => labelFor(o.code))}
            value={localeLabel}
            onChange={handleLocaleChange}
          />
        </FieldRow>
        <FieldRow label={tt("Active public languages")}>
          <div className="flex flex-col gap-2" style={{ fontFamily: FONTS.body }}>
            {orderedLocaleOptions.map((code) => {
              const checked = activeLocales.includes(code);
              const locked = checked && activeLocales.length === 1;
              return (
                <label key={code} className="flex items-center gap-2 text-admin-ink" style={{ fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(e) => toggleActiveLocale(code, e.currentTarget.checked)}
                    className="size-4 cursor-pointer rounded border-admin-border"
                  />
                  <span>{labelFor(code)}</span>
                  {code === defaultLocale ? (
                    <span style={{ fontSize: 10.5 }} className="text-admin-ink-muted">
                      {tt("default")}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </FieldRow>
        <FieldRow
          label={tt("Public language switcher")}
          hint={activeLocales.length > 1 ? tt("Controls public and auth chrome.") : tt("Hidden because one language is active.")}
        >
          <div className="flex flex-col gap-2" style={{ fontFamily: FONTS.body }}>
            <label className="flex items-center gap-2 text-admin-ink" style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={showLanguageSwitcher}
                disabled={activeLocales.length <= 1}
                onChange={(e) => setShowLanguageSwitcher(e.currentTarget.checked)}
                className="size-4 cursor-pointer rounded border-admin-border disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span>{tt("Show when multiple languages are active")}</span>
            </label>
            <div style={{ fontSize: 12.5, color: COLORS.inkMuted }}>
              {languagePreview}
            </div>
          </div>
        </FieldRow>
      </Section>

      <Section title={tt("Regional defaults")} framed>
        <FieldRow label={tt("Timezone")}>
          <SelectInput
            options={[
              "America/Cancun",
              "America/Mexico_City",
              "America/New_York",
              "America/Los_Angeles",
              "Europe/Madrid",
              "Europe/Lisbon",
              "Europe/Paris",
              "Europe/Rome",
              "Asia/Tokyo",
            ]}
            value={timezone}
            onChange={setTimezone}
          />
        </FieldRow>
        <FieldRow label={tt("Default currency")}>
          <SelectInput
            options={currencyOptions.map((o) => o.label)}
            value={currencyLabel}
            onChange={handleCurrencyChange}
          />
        </FieldRow>
        <FieldRow label={tt("First day of week")} hint={tt("Cosmetic — calendar grid only. Not yet persisted.")}>
          <SelectInput
            options={["Monday", "Sunday"]}
            value={firstDay}
            onChange={setFirstDay}
          />
        </FieldRow>
      </Section>
    </DrawerShell>
  );
}


export function TalentProfileDrawer() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { state, closeDrawer, openDrawer, toast, effectiveRoster } = useAdminShell();
  const id = state.drawer.payload?.id as string | undefined;
  const profile = effectiveRoster.find((p) => p.id === id) ?? effectiveRoster[0];
  const canEdit = meetsRole(state.role, "editor");
  const fallbackToast = useSaveAndClose("Profile saved");
  const [pending, startTransition] = useTransition();
  const [stageName, setStageName] = useState(profile.name);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.id);

  const onSave = () => {
    // Synthetic mock ids → fall through to the toast stub. Real profile
    // UUIDs from the bridge get the canonical updateTalentIdentity write.
    if (!isUuid) { fallbackToast(); return; }
    startTransition(async () => {
      const result = await updateTalentIdentity({
        talent_profile_id: profile.id,
        stage_name: stageName.trim() || profile.name,
      });
      if (!result.ok) toast(`Save failed: ${result.error}`);
      else { toast("Profile published"); queueRouterRefresh(); closeDrawer(); }
    });
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={profile.name}
      description={`${profile.height ?? "—"} · ${profile.city ?? "—"}`}
      width={580}
      toolbar={
        <GhostButton
          size="sm"
          onClick={() =>
            openDrawer("talent-share-card", { name: profile.name, slug: profile.id })
          }
        >
          Share with client
        </GhostButton>
      }
      footer={
        canEdit ? (
          <>
            <button
              onClick={closeDrawer}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                cursor: "pointer",
                marginRight: "auto",
              }}
            >
              Archive
            </button>
            <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
            <PrimaryButton onClick={onSave} disabled={pending}>
              {pending ? "Publishing…" : "Publish"}
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <div
        style={{
          display: "flex",
          gap: 14,
          marginBottom: 18,
          padding: 14,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
        }}
      >
        <div style={{ width: 88, height: 110, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50, flexShrink: 0 }} className="bg-admin-surface-alt">
          {profile.thumb}
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <StateChip state={profile.state} label={TALENT_STATE_LABEL[profile.state]} />
            {profile.representation && (
              <RepresentationChip representation={profile.representation} />
            )}
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, letterSpacing: -0.3, marginTop: 6 }} className="text-admin-ink">
            {profile.name}
          </div>
          <div style={{ fontFamily: FONTS.body, fontSize: 12.5, marginTop: 2 }} className="text-admin-ink-muted">
            {profile.height} <Bullet /> {profile.city}
          </div>
        </div>
      </div>

      <Section title="State">
        <StateExplainer state={profile.state} />
      </Section>

      {profile.representation && (
        <Section
          title="Representation"
          description="How this talent is represented relates to who owns inquiries that come in via different surfaces."
        >
          <RepresentationCard representation={profile.representation} talentName={profile.name} />
        </Section>
      )}

      <Section title="Basics" framed>
        <FieldRow label="Stage name">
          <TextInput
            value={stageName}
            onChange={(e) => setStageName((e.target as HTMLInputElement).value)}
          />
        </FieldRow>
        <FieldRow label="Height">
          <TextInput defaultValue={profile.height ?? ""} />
        </FieldRow>
        <FieldRow label="City">
          <TextInput defaultValue={profile.city ?? ""} />
        </FieldRow>
      </Section>

      <Section title="Visibility" framed>
        <ToggleRow label="Show in public roster" defaultOn={profile.state === "published"} />
        <ToggleRow label="Allow direct inquiries" defaultOn={profile.state === "published"} />
        <ToggleRow label="Include in Tulala discovery" defaultOn={state.plan === "free"} />
      </Section>
    </DrawerShell>
  );
}


export function MyProfileDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const onSave = useSaveAndClose("Your profile saved");

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Your profile"
      description={state.alsoTalent ? "You're an admin AND on the roster — both views live here." : "Your account in this workspace."}
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Account">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 14,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
          }}
        >
          <Avatar initials="OT" size={48} tone="ink" />
          <div className="flex-1">
            <div style={{ fontFamily: FONTS.body, fontSize: 14, fontWeight: 600 }} className="text-admin-ink">
              Oran Tene
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 1 }} className="text-admin-ink-muted">
              oran@acme-models.com
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <RoleChip role={state.role} />
              {state.alsoTalent && (
                <span style={{ background: "rgba(11,11,13,0.05)", fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999 }} className="text-admin-ink">
                  On roster
                </span>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Personal" framed>
        <FieldRow label="Display name">
          <TextInput defaultValue="Oran Tene" />
        </FieldRow>
        <FieldRow label="Email">
          <TextInput type="email" defaultValue="oran@acme-models.com" />
        </FieldRow>
      </Section>

      {state.alsoTalent && (
        <Section title="Your talent profile" description="What clients see when they book you. Edits go through admin approval." framed>
          <FieldRow label="Stage name">
            <TextInput defaultValue="Oran T." />
          </FieldRow>
          <FieldRow label="Bio">
            <TextArea rows={3} defaultValue="Editorial / runway · based Madrid, traveling Q2 to Milan." />
          </FieldRow>
          <FieldRow label="Direct inquiries">
            <ToggleRow label="Allow clients to inquire about you directly" defaultOn />
          </FieldRow>
        </Section>
      )}

      <Section title="Notifications" framed>
        <ToggleRow label="Email me when an inquiry mentions a talent I manage" defaultOn />
        <ToggleRow label="Email me when a client confirms a booking" defaultOn />
        <ToggleRow label="Daily digest at 9am Madrid time" defaultOn={false} />
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Inquiries: peek + new + new booking
// ════════════════════════════════════════════════════════════════════
