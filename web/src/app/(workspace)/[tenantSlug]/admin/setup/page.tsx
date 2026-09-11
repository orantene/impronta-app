// /admin/setup — the first-run checklist (W55), the page the Overview's
// Setup readiness bar opens with "Finish setup".
//
// "Welcome, <name>" over "<workspace> · <preset> · N of M ready", then the
// eight things a workspace needs before it can sell (`loadSetupItems`, the
// SAME reader the Overview's bar counts, so the two never disagree), each
// with the fact when done and the consequence when not, and a "Set up" door
// to the screen that settles it. Beside it, "Blocked right now": the Issues
// queue's two most consequential rows (`loadExceptions`), each with its own
// next action, and the sentence that cash selling and free scheduling are
// never blocked by a missing payout destination.
//
// A canonical route inside the workspace shell (see canonical-routes.ts);
// read-only, nothing here writes.

import Link from "next/link";
import { notFound } from "next/navigation";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadExceptions } from "@/lib/exceptions/read";
import { setupProgress, type OverviewCopy, type SetupItemKey } from "@/lib/overview/model";
import { parseWordsSettings } from "@/lib/words/settings";
import { resolveIndustryPreset } from "@/lib/words/presets";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { loadProfileDisplayName } from "../../_layout-identity";
import { loadSetupItems, readAgencySetupRow } from "../../_data-bridge/setup-checklist";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

/** Where each item's "Set up" goes: the screen that settles it. */
const DOORS: Record<SetupItemKey, (base: string) => string> = {
  timeZone: (b) => `${b}/settings?focus=venue`,
  catalogItem: (b) => `${b}/menu`,
  whoPerforms: (b) => `${b}/people?view=bookable`,
  bookableHours: (b) => `${b}/settings?focus=appointments`,
  onlinePayments: (b) => `${b}/settings?focus=payments`,
  bookingPolicy: (b) => `${b}/settings?focus=commercial-terms`,
  payoutDestination: (b) => `${b}/payouts`,
  websitePublished: (b) => `${b}/website`,
};

const BUTTON =
  "inline-flex h-[30px] shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-[9px] border px-[12px] text-[12px] font-semibold";

export default async function SetupPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  const scope = session.user ? await getTenantScopeBySlug(tenantSlug) : null;
  if (!scope || !session.user) notFound();
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const t = (k: string) => tr(`dashboard.setupPage.${k}`);
  const copy = (c: OverviewCopy): string => ("text" in c ? c.text : interpolate(tr(c.key), c.params ?? {}));
  const base = `/${tenantSlug}/admin`;

  const admin = createServiceRoleClient();
  const [agency, displayName] = await Promise.all([readAgencySetupRow(scope.tenantId), loadProfileDisplayName(session.user.id)]);
  const [items, exceptions] = await Promise.all([
    loadSetupItems(scope.tenantId, agency),
    admin ? loadExceptions(admin, { tenantId: scope.tenantId, tenantSlug }) : Promise.resolve(null),
  ]);

  const { done, total } = setupProgress(items);
  const firstName = (displayName?.trim() || session.user.email?.split("@")[0] || "").split(/\s+/u)[0] ?? "";
  const preset = resolveIndustryPreset(parseWordsSettings(agency?.settings).presetId);
  const presetLabel = locale === "es" ? preset.label.es ?? preset.label.en : preset.label.en;
  const blocked = exceptions ? exceptions.rows.slice(0, 2) : [];

  return (
    <div data-tulala-setup-page className="flex w-full flex-col gap-[20px] font-admin-body">
      <div>
        <h1 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">
          {firstName ? interpolate(t("welcome"), { name: firstName }) : t("welcomeNoName")}
        </h1>
        <p className="m-0 mt-[4px] text-admin-13 text-admin-ink-muted">
          {interpolate(t("subline"), { workspace: scope.membership.display_name, preset: presetLabel, done, total })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-[1.2fr_1fr]">
        <section data-testid="setup-checklist" className="rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[14px]">
          <h2 className="m-0 mb-[4px] text-admin-13! font-semibold text-admin-ink">{t("checklistTitle")}</h2>
          <ol className="m-0 list-none p-0">
            {items.map((item) => (
              <li key={item.key} data-setup-item={item.key} data-done={item.done ? "true" : "false"} className="flex items-center gap-[12px] border-t border-admin-border-soft py-[10px]">
                <span
                  aria-hidden
                  className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${item.done ? "bg-admin-green text-white" : "border border-admin-border-strong bg-admin-card"}`}
                >
                  {item.done ? <Icon name="check" size={11} stroke={2.5} /> : null}
                </span>
                <span className="min-w-0 flex-1 text-admin-13 font-semibold text-admin-ink">{t(`item.${item.key}`)}</span>
                <span className="text-admin-13 text-admin-ink-muted">{copy(item.detail)}</span>
                {!item.done ? (
                  <Link href={DOORS[item.key](base)} className={`${BUTTON} border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong`}>
                    {t("setUp")}
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section data-testid="setup-blocked" className="rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[14px]">
          <h2 className="m-0 mb-[10px] text-admin-13! font-semibold text-admin-ink">{t("blockedTitle")}</h2>
          {!exceptions ? (
            <p role="alert" className="m-0 text-admin-13 text-admin-red">{t("blockedUnreadable")}</p>
          ) : blocked.length === 0 ? (
            <p className="m-0 text-admin-13 text-admin-ink-muted">{t("blockedNone")}</p>
          ) : (
            <div className="flex flex-col gap-[10px]">
              {blocked.map((row) => (
                <div key={row.key} data-blocked-row className="rounded-[10px] bg-admin-coral-soft px-[14px] py-[12px]">
                  <div className="text-admin-13 font-semibold text-admin-coral-deep">{row.title}</div>
                  <div className="mt-[2px] text-admin-13 text-admin-ink-muted">{row.detail}</div>
                  <Link
                    href={row.href ?? `${base}/exceptions`}
                    className={`${BUTTON} mt-[8px] border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep`}
                  >
                    {row.nextAction.kind === "resume" ? row.nextAction.label : t("openIssue")}
                  </Link>
                </div>
              ))}
            </div>
          )}
          {exceptions && exceptions.unavailable.length > 0 ? (
            <p role="alert" className="mt-[10px] text-[12px] text-admin-red">{t("blockedIncomplete")}</p>
          ) : null}
          <p className="mt-[12px] text-admin-13 text-admin-ink-muted">{t("blockedFootnote")}</p>
        </section>
      </div>
    </div>
  );
}
