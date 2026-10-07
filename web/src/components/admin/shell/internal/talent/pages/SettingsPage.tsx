"use client";

import { useEffect, useState, type ReactNode } from "react";
import { loadWebsiteSettingsEnabledAction } from "@/components/talent/website-settings/website-settings-gate-action";
import { requestWebsiteSettingsView } from "@/components/talent/website-settings/website-settings-intent";
import { languageName } from "@/lib/i18n/locale-field-model";
import { CommercialBookingTermsCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/CommercialBookingTermsCard";
import { DefaultCurrencyCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/DefaultCurrencyCard";
import { PreferredLanguageCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/PreferredLanguageCard";
import { ProfileVisibilityCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityCard";
import { TalentPlanCard } from "@/app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard";
import { HowYouWorkCard } from "@/components/settings/how-you-work-card";
import { HYW_DESC, HYW_TITLE } from "@/components/settings/how-you-work-copy";
import { AccountDeletionCard } from "@/components/account/AccountDeletionCard";
import { usePresenceText } from "@/components/talent/studio/presence-i18n";
import { useDashboardText } from "../../dashboard-i18n";
import { PasskeysCard } from "../../modern-features";
import { Icon } from "../../primitives";
import { MY_TALENT_PROFILE, TALENT_TIER_META, useAdminShell } from "../../state";
import { openWorkingHoursPanel } from "../agenda/WorkingHoursPanel";
import { PageHeader } from "../shared/page-chrome-1";

const TAG_TONE: Record<"ok" | "warn" | "risk", string> = {
  ok: "bg-admin-success-soft text-admin-success-deep",
  warn: "bg-admin-amber-soft text-admin-amber-deep",
  risk: "bg-admin-critical-soft text-admin-critical-deep",
};

type Row = {
  key: string;
  label: string;
  sub?: string;
  value?: ReactNode;
  tag?: { text: string; tone: "ok" | "warn" | "risk" };
  /** Opens a drawer or a page. */
  onOpen?: () => void;
  /** Or unfolds an inline editor under the row. */
  panel?: ReactNode;
};

function SettingsGroup({ title, rows, tone = "plain" }: { title: string; rows: Row[]; tone?: "plain" | "risk" }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (rows.length === 0) return null;
  return (
    <section
      data-tulala-settings-group
      className={`overflow-hidden rounded-[12px] border bg-admin-card font-admin-body ${
        tone === "risk" ? "border-admin-critical-soft" : "border-admin-border-soft"
      }`}
    >
      <h2
        className={`m-0 px-[18px] py-[13px] text-[13.5px] font-semibold ${
          tone === "risk" ? "bg-admin-critical-soft text-admin-critical-deep" : "text-admin-ink"
        }`}
      >
        {title}
      </h2>
      <ul className="m-0 list-none divide-y divide-admin-border-soft border-t border-admin-border-soft p-0">
        {rows.map((r) => {
          const expanded = openKey === r.key;
          const onClick = r.panel ? () => setOpenKey(expanded ? null : r.key) : r.onOpen;
          return (
            <li key={r.key}>
              <button
                type="button"
                data-tulala-settings-row={r.key}
                aria-expanded={r.panel ? expanded : undefined}
                onClick={onClick}
                className="flex w-full cursor-pointer items-center gap-[12px] border-0 bg-transparent px-[18px] py-[12px] text-left hover:bg-admin-surface-alt"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-admin-ink">{r.label}</span>
                  {r.sub ? (
                    <span className="mt-[2px] block text-[11.5px] leading-snug text-admin-ink-muted">{r.sub}</span>
                  ) : null}
                </span>
                {r.tag ? (
                  <span className={`shrink-0 rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-semibold ${TAG_TONE[r.tag.tone]}`}>
                    {r.tag.text}
                  </span>
                ) : null}
                {r.value ? <span className="shrink-0 text-[12.5px] text-admin-ink-muted">{r.value}</span> : null}
                <span aria-hidden className={`inline-flex shrink-0 text-admin-ink-dim ${expanded ? "rotate-90" : ""}`}>
                  <Icon name="chevron-right" size={13} stroke={1.8} color="currentColor" />
                </span>
              </button>
              {r.panel && expanded ? <div className="px-[12px] pb-[12px]">{r.panel}</div> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Talent Settings: two columns of row lists, grouped by the question a solo
 * talent is asking (when she works, the money rules, her account, what is
 * hard to undo, who she works with). Each row opens its drawer or page;
 * inline editors unfold under their own row instead of stacking open cards.
 * Agency and network concepts (add an agency, My Circle, talent network,
 * multi-agency workspaces) are not a solo talent's settings and are gone;
 * existing agency relationships still show, and only when they exist.
 */
export function SettingsPage() {
  const { openDrawer, setTalentPage, bridgeTalentSelfProfile, bridgeTalentAgencies, tenantSlug, state, talentLocales } = useAdminShell();
  // PR 7: languages are managed in Website settings > Languages (single
  // source); this row becomes a summary + link when that screen is on.
  const [settingsOn, setSettingsOn] = useState(false);
  useEffect(() => {
    let live = true;
    void loadWebsiteSettingsEnabledAction()
      .then((on) => {
        if (live) setSettingsOn(on);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const copy = useDashboardText();
  const { t: tx } = usePresenceText();
  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  const agencies = bridgeTalentAgencies ?? [];
  const openSection = (section: string) =>
    openDrawer("talent-profile-shell", { mode: "edit-self", talentId: selfTalentId, section });
  const displayName = bridgeTalentSelfProfile?.displayName ?? MY_TALENT_PROFILE.name;

  const whenYouWork: Row[] = [
    {
      key: "hours",
      label: tx("Working hours and days off"),
      sub: tx("Hours, breaks, time between appointments, how far ahead and how late clients can book."),
      onOpen: openWorkingHoursPanel,
    },
  ];

  const money: Row[] = [];
  if (bridgeTalentSelfProfile) {
    money.push(
      {
        key: "terms",
        label: tx("Deposit and cancellations"),
        sub: tx("Your defaults for new bookings. Each booking can still set its own."),
        panel: <CommercialBookingTermsCard talentId={bridgeTalentSelfProfile.id} />,
      },
      {
        key: "currency",
        label: tx("Currency"),
        sub: tx("Everything you charge and everything you are shown."),
        panel: <DefaultCurrencyCard />,
      },
    );
  }
  money.push(
    {
      key: "payouts",
      label: tx("Where your money goes"),
      sub: tx("Card payments are paid out to your account."),
      onOpen: () => setTalentPage("payouts"),
    },
    {
      key: "tax",
      label: tx("Tax details on receipts"),
      tag: { text: tx("Optional"), tone: "ok" },
      onOpen: () => openDrawer("talent-tax-docs"),
    },
    {
      key: "services",
      label: tx("Services and prices"),
      sub: tx("Everything clients can book or buy lives in Services."),
      onOpen: () => setTalentPage("services"),
    },
  );

  const account: Row[] = [
    {
      key: "identity",
      label: tx("Your name and photo"),
      sub: tx("Shown on every page you appear on."),
      value: displayName,
      onOpen: () => openSection("identity"),
    },
  ];
  if (bridgeTalentSelfProfile && talentLocales && settingsOn) {
    const own = (c: string) => languageName(c, c, true);
    account.push({
      key: "language",
      label: copy.t("Language"),
      sub: copy.t("Change in Website settings"),
      value:
        talentLocales.secondary.length === 0
          ? copy.t("{lang} only").replace("{lang}", own(talentLocales.primary))
          : copy
              .t("{primary} and {secondary}")
              .replace("{primary}", own(talentLocales.primary))
              .replace("{secondary}", talentLocales.secondary.map(own).join(", ")),
      onOpen: () => {
        requestWebsiteSettingsView("lang");
        setTalentPage("public-page");
      },
    });
  } else if (bridgeTalentSelfProfile) {
    account.push({
      key: "language",
      label: tx("Language"),
      sub: tx("Your dashboard. Your public pages follow the visitor."),
      panel: <PreferredLanguageCard />,
    });
  }
  if (bridgeTalentSelfProfile) {
    const l = copy.isSpanish ? "es" : "en";
    account.push({ key: "how-you-work", label: HYW_TITLE[l], sub: HYW_DESC[l], panel: <HowYouWorkCard /> });
  }
  account.push(
    {
      key: "signin",
      label: tx("Sign in"),
      sub: tx("Passkeys let you sign in with Face ID or your fingerprint."),
      panel: <PasskeysCard userName={displayName} userId={bridgeTalentSelfProfile?.id ?? "talent-self"} />,
    },
    {
      key: "verification",
      label: tx("Verification"),
      sub: tx("Email, ownership and connected accounts."),
      onOpen: () => openDrawer("talent-trust-detail"),
    },
    {
      key: "notifications",
      label: tx("What you are told about"),
      sub: tx("New enquiries and payments are always on."),
      onOpen: () => openDrawer("talent-notifications", { expanded: "settings" }),
    },
    {
      key: "contact",
      label: tx("Who can contact you"),
      sub: tx("Which clients can send you enquiries."),
      onOpen: () => openDrawer("talent-contact-preferences"),
    },
    {
      key: "privacy",
      label: tx("Privacy"),
      sub: tx("Search-engine indexing, sensitive measurements and document visibility."),
      onOpen: () => openSection("admin"),
    },
    {
      key: "download-data",
      label: tx("Download my data"),
      sub: copy.t("A copy of the information Tulala holds about you, as a file."),
      onOpen: () => {
        window.location.assign("/api/account/export");
      },
    },
    bridgeTalentSelfProfile
      ? {
          key: "plan",
          label: tx("Plan"),
          value: copy.t(TALENT_TIER_META[state.talentTier].label),
          panel: (
            <TalentPlanCard
              onCompare={() => openDrawer("talent-tier-compare")}
              onUpgrade={() => openDrawer("talent-tier-compare")}
            />
          ),
        }
      : {
          key: "plan",
          label: tx("Plan"),
          value: copy.t(TALENT_TIER_META[state.talentTier].label),
          onOpen: () => openDrawer("talent-tier-compare"),
        },
    {
      key: "help",
      label: tx("Help and support"),
      sub: tx("Common questions, payouts, contact our team."),
      onOpen: () => openDrawer("help"),
    },
  );

  const hard: Row[] = [
    {
      key: "hide",
      label: tx("Hide a public page"),
      sub: tx("One page stops being public. Bookings, payments and messages are untouched. Reversible in a tap."),
      tag: { text: tx("In Where I appear"), tone: "ok" },
      onOpen: () => setTalentPage("public-page"),
    },
  ];
  if (bridgeTalentSelfProfile && tenantSlug) {
    hard.push({
      key: "visibility",
      label: tx("Hide everywhere"),
      sub: tx("One switch that overrides every page and listing."),
      panel: (
        <ProfileVisibilityCard
          tenantSlug={tenantSlug}
          talentId={bridgeTalentSelfProfile.id}
          initialHidden={bridgeTalentSelfProfile.isPubliclyHidden}
          onOpenRepresentation={() => openDrawer("representation")}
          agencies={agencies.map((a) => ({
            id: a.id,
            agencyName: a.agencyName,
            agencyVisibility: a.agencyVisibility,
            talentSiteHidden: a.talentSiteHidden,
          }))}
        />
      ),
    });
  }
  if (agencies.length > 0) {
    hard.push({
      key: "leave",
      label: tx("Leave an agency"),
      sub: tx("You stop receiving their jobs. Work already agreed is still yours to finish and still gets paid."),
      tag: { text: tx("Ends a relationship"), tone: "warn" },
      onOpen: () => openDrawer("representation"),
    });
  }
  hard.push({
    key: "close",
    label: tx("Close your account"),
    sub: tx(
      "Your profile, pages and sign-in are removed after 14 days. Bookings and payment records are kept, anonymized.",
    ),
    tag: { text: tx("Cancellable for 14 days"), tone: "risk" },
    panel: <AccountDeletionCard surface="talent" es={copy.isSpanish} />,
  });

  // Only relationships that exist. A solo talent has none, so the group hides.
  const workWith: Row[] = agencies.map((a) => ({
    key: a.id,
    label: a.agencyName,
    sub: a.isPrimary ? tx("Primary") : undefined,
    tag: { text: tx("Active"), tone: "ok" as const },
    onOpen: () => openDrawer("representation", { focusAgencyId: a.id }),
  }));

  return (
    <>
      <PageHeader guideNodeId="talent-notifications" title={copy.t("Settings")} subtitle={displayName} />
      <div data-tulala-settings-grid className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-[16px]">
          <SettingsGroup title={tx("When you work")} rows={whenYouWork} />
          <SettingsGroup title={tx("Money rules")} rows={money} />
        </div>
        <div className="flex min-w-0 flex-col gap-[16px]">
          <SettingsGroup title={tx("You and your account")} rows={account} />
          <SettingsGroup title={tx("Things that are hard to undo")} rows={hard} tone="risk" />
          <SettingsGroup title={tx("Who you work with")} rows={workWith} />
        </div>
      </div>
    </>
  );
}
