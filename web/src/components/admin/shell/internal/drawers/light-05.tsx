"use client";
import { logServerError } from "@/lib/server/safe-error";
import type { Locale } from "@/lib/site-admin/locales";
import { DashboardLocaleToggle } from "@/components/dashboard-locale-toggle";
import { useDashboardText } from "../dashboard-i18n";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  Avatar,
  Bullet,
  COLORS,
  DrawerShell,
  FONTS,
  FieldRow,
  GhostButton,
  PrimaryButton,
  RepresentationCard,
  RepresentationChip,
  RoleChip,
  SecondaryButton,
  Section,
  SelectInput,
  StandardFooter,
  StateChip,
  StateExplainer,
  TALENT_STATE_LABEL,
  TextArea,
  TextInput,
  ToggleRow,
  loadWorkspaceAccountSettings,
  meetsRole,
  updateTalentIdentity,
  updateWorkspaceAccount,
  updateWorkspaceFields,
  useAdminShell,
  useQueuedRouterRefresh,
  useSaveAndClose
} from "./drawer-shared";

// Phase 1d (remediation §4): leaf drawer bodies, extracted from drawers.tsx;
// referenced ONLY by the DrawerSwitch barrel (zero cross-edges). The fixture
// DomainDrawer that lived here was DELETED when domain management went real —
// the "domain" key now renders drawers/domain-drawer.tsx (live registry).

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
  const { closeDrawer, toast, tenantSlug, supportedLocales, tenantDefaultLocale } = useAdminShell();
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
        {/* Dashboard display language — a SECOND home for the control that
            otherwise lives only in the top-bar account menu (IdentityBar).
            That single entry point was unreachable whenever anything overlaid
            the header, and "change the language" is not an obvious thing to
            look for behind an avatar. It is deliberately the first row here:
            it's the one setting in this drawer that changes what the person
            reading it sees, immediately, and it saves nothing (cookie-backed,
            applied on click) so it must not look like it's waiting on Save. */}
        <FieldRow
          label={tt("Dashboard display language")}
          hint={tt("Applies to your dashboard only, on this device. Does not change your public site.")}
        >
          {/* `w-fit` because FieldRow's control column is full-width: the
              toggle's own `flex` would otherwise stretch the pill across the
              drawer instead of hugging its two labels. `prototype` matches the
              account-menu rendering so the same control looks the same in both
              places a user can reach it. */}
          <DashboardLocaleToggle
            className="w-fit"
            variant="prototype"
            supportedLocales={supportedLocales}
            defaultLocale={tenantDefaultLocale}
          />
        </FieldRow>
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
