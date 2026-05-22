"use client";
import { logServerError } from "@/lib/server/safe-error";
import type { Locale } from "@/lib/site-admin/locales";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Bullet,
  COLORS,
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
  const { state, closeDrawer, toast, effectiveTenant } = useAdminShell();
  const [pending, startTransition] = useTransition();
  const isLive = meetsPlan(state.plan, "studio");
  // I3 — read live domain status from the Website page's source of
  // truth so the drawer stays in sync with WebsiteDomainPanel.
  const domain = WEBSITE_STATE.domain;
  const [customDomain, setCustomDomain] = useState(isLive ? domain.primaryDomain : "");
  const [redirectToWww, setRedirectToWww] = useState(domain.redirectsToWww);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
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
  }, []);

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
  const copy = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    toast(`${label} copied`);
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Custom domain"
      description={isLive ? `Your storefront runs on ${domain.primaryDomain}.` : "Your storefront runs on Tulala's subdomain."}
      width={580}
      footer={<StandardFooter onSave={onSave} disabled={pending || !loaded} saveLabel={pending ? "Saving…" : "Save"} />}
    >
      <Section title="Public URL">
        <FieldRow label="Tulala subdomain" hint="Always available. Used as fallback.">
          <TextInput defaultValue={effectiveTenant.domain} prefix="https://" />
        </FieldRow>
        <FieldRow label="Custom domain" optional>
          <TextInput
            value={customDomain}
            onChange={(e) => setCustomDomain((e.target as HTMLInputElement).value)}
            placeholder="acme-models.com"
            prefix="https://"
          />
        </FieldRow>
        {isLive && (
          <FieldRow label="Redirect bare → www" optional hint="When on, atelier-roma.com is rewritten to www.atelier-roma.com at the edge.">
            <ToggleControl value={redirectToWww} label="" onChange={(v) => setRedirectToWww(v)} />
          </FieldRow>
        )}
      </Section>

      {isLive && (
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
                        onClick={() => copy(r.value, `${r.type} value`)}
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

      {isLive && domain.alternateDomains.length > 0 && (
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

      {!isLive && (
        <Section title="Why upgrade" description="Studio takes you off the Tulala subdomain and onto your own brand.">
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
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [defaultLocale, setDefaultLocale] = useState<Locale>("en");
  const [activeLocales, setActiveLocales] = useState<Locale[]>(["en"]);
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
          setDefaultLocale(res.data.defaultLocale);
          setActiveLocales(res.data.activeLocales.length ? res.data.activeLocales : [res.data.defaultLocale]);
          if (res.data.timezone) setTimezone(res.data.timezone);
          if (res.data.preferredCurrency) setCurrency(res.data.preferredCurrency);
        }
      } finally { setIsLoading(false); }
    })();
  }, [tenantSlug]);

  // Map prototype-friendly labels to canonical values + back.
  const localeOptions = [
    { label: "English", value: "en" as const },
    { label: "Español", value: "es" as const },
  ];
  const localeLabel = localeOptions.find((o) => o.value === defaultLocale)?.label ?? "English";
  const handleLocaleChange = (label: string) => {
    const match = localeOptions.find((o) => o.label === label);
    if (!match) return;
    setDefaultLocale(match.value);
    setActiveLocales((current) =>
      current.includes(match.value) ? current : [...current, match.value],
    );
  };
  const toggleActiveLocale = (code: Locale, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...activeLocales, code]))
      : activeLocales.filter((l) => l !== code);
    if (next.length === 0) return;
    if (!next.includes(defaultLocale)) {
      setDefaultLocale(next[0] ?? "en");
    }
    setActiveLocales(next);
  };
  const languagePreview =
    activeLocales.length > 1
      ? `Visitors can switch between ${activeLocales.map((l) => l.toUpperCase()).join(" and ")}.`
      : `Only ${activeLocales[0]?.toUpperCase() ?? defaultLocale.toUpperCase()} is active for this site.`;

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
      toast("Settings saved (demo)");
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
      });
      if (!result.ok) {
        toast(result.error || "Couldn't save. Try again.");
        return;
      }
      toast("Settings saved");
      queueRouterRefresh();
      closeDrawer();
    } catch (err) {
      logServerError("updateworkspacefields", err);
      toast("Couldn't save. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Workspace settings"
      description="Operational defaults — language, currency, timezone."
      footer={<StandardFooter onSave={onSave} disabled={isSaving || isLoading} saveLabel={isSaving ? "Saving…" : isLoading ? "Loading…" : "Save"} />}
    >
      <Section title="Language & localization" framed>
        <FieldRow label="Default public language">
          <SelectInput
            options={localeOptions.map((o) => o.label)}
            value={localeLabel}
            onChange={handleLocaleChange}
          />
        </FieldRow>
        <FieldRow label="Active public languages">
          <div className="flex flex-col gap-2" style={{ fontFamily: FONTS.body }}>
            {localeOptions.map((opt) => {
              const checked = activeLocales.includes(opt.value);
              const locked = checked && activeLocales.length === 1;
              return (
                <label key={opt.value} className="flex items-center gap-2 text-admin-ink" style={{ fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(e) => toggleActiveLocale(opt.value, e.currentTarget.checked)}
                    className="size-4 cursor-pointer rounded border-admin-border"
                  />
                  <span>{opt.label}</span>
                  {opt.value === defaultLocale ? (
                    <span style={{ fontSize: 10.5 }} className="text-admin-ink-muted">
                      default
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </FieldRow>
        <FieldRow label="Public language switcher" hint={activeLocales.length > 1 ? "Shown automatically." : "Hidden because one language is active."}>
          <div style={{ fontSize: 12.5, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
            {languagePreview}
          </div>
        </FieldRow>
      </Section>

      <Section title="Regional defaults" framed>
        <FieldRow label="Timezone">
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
        <FieldRow label="Default currency">
          <SelectInput
            options={currencyOptions.map((o) => o.label)}
            value={currencyLabel}
            onChange={handleCurrencyChange}
          />
        </FieldRow>
        <FieldRow label="First day of week" hint="Cosmetic — calendar grid only. Not yet persisted.">
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
