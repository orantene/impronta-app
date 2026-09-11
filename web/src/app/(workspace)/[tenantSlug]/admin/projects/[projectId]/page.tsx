/**
 * W42 — the project record, and W46/W47/W48/W49/W51 as its tabs, W50 as
 * its close sheet.
 *
 * AS THE BOARD DRAWS IT: the title with its status pill, the meta line
 * (client · payer, owner, next deadline, reference), `More ▾` and the one
 * primary action; four KPI cards (Agreement · Collected · Due now ·
 * Remaining) and the talent-fees sentence; the attention banner when the
 * client owes an approval; the tab strip; and the 320px right column with
 * Client, Team and Dates.
 *
 * ONE PAGE, SIX VIEWS. Scope, Milestones, Team, Money, Files & activity and
 * Who-sees-what are states of this record, not separate routes: they read
 * the same rows and a route each would mean six loads of the same project.
 * `?tab=` selects; the strip is real links with `aria-current`.
 *
 * THE PRIMARY ACTION IS ONE BUTTON. Which one is `nextProjectAction()`, next
 * door and tested. Collect never appears while a deliverable is waiting on
 * the client, and when that suppression happens the banner SAYS SO.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requestNowMs } from "@/lib/projects/request-clock";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { loadProject, loadProjectActivity, loadProjectContact } from "@/lib/projects/projects-reader";
import {
  acceptedAgreement,
  milestonesAwaitingApproval,
  nextDeadline,
  nextProjectAction,
  projectMoney,
  remainingCents,
  type ProjectRecord,
} from "@/lib/projects/project-record";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  KpiCard,
  MetaLine,
  Notice,
  PageShell,
  Pill,
  RecordShell,
  TabStrip,
  dayLabel,
  shortId,
} from "../_shared";
import { ACTION_KEY, STATUS_KEY } from "../_keys";
import { RecordSide } from "./record-side";
import { ActivityTab, MoneyTab, OverviewTab, ScopeTab, VisibilityTab } from "./record-tabs";
import { MilestonesTab } from "./milestones-tab";
import { TeamTab } from "./team-tab";
import { RecordMenu } from "./record-menu";
import { ApproveVerballyButton } from "./milestone-decisions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; projectId: string }>;
type PageSearch = Promise<{ tab?: string }>;

export type RecordTab = "overview" | "scope" | "milestones" | "team" | "money" | "activity" | "visibility";

const TABS: readonly RecordTab[] = ["overview", "scope", "milestones", "team", "money", "activity"];

const TAB_KEY: Record<RecordTab, string> = {
  overview: "dashboard.projects.tabOverview",
  scope: "dashboard.projects.tabScope",
  milestones: "dashboard.projects.tabMilestones",
  team: "dashboard.projects.tabTeam",
  money: "dashboard.projects.tabMoney",
  activity: "dashboard.projects.tabActivity",
  visibility: "dashboard.projects.tabVisibility",
};

type Tr = (key: string) => string;

export default async function ProjectRecordPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearch;
}) {
  const { tenantSlug, projectId } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const sp = await searchParams;
  const requested = sp.tab === "visibility" ? "visibility" : TABS.find((t) => t === sp.tab);
  const tab: RecordTab = requested ?? "overview";
  const base = `/${tenantSlug}/admin`;
  const nowMs = requestNowMs();

  const load = await loadProject(scope.tenantId, projectId);

  if (!load.ok) {
    // Three different answers, never one blank screen. `invalid` means the URL
    // is not a project address at all; `not_found` means it is, and there is
    // nothing there; `unavailable` means we could not look.
    const message =
      load.reason === "invalid"
        ? tr("dashboard.projects.invalidId")
        : load.reason === "not_found"
          ? tr("dashboard.projects.notFound")
          : tr("dashboard.projects.unavailable");
    return (
      <PageShell>
        <Link href={`${base}/projects`} className="text-[13px] text-admin-ink-muted underline underline-offset-4">
          {tr("dashboard.projects.backToList")}
        </Link>
        <h1 className="m-0 text-[22px]! font-semibold tracking-[-0.02em] text-admin-ink">{tr("dashboard.projects.pageTitle")}</h1>
        <Notice tone="warn">{message}</Notice>
      </PageShell>
    );
  }

  const project = load.project;
  const [contact, activity] = await Promise.all([
    loadProjectContact(scope.tenantId, project.customerId),
    loadProjectActivity(scope.tenantId, project.id),
  ]);
  const money = projectMoney(project);
  const accepted = acceptedAgreement(project);
  const action = nextProjectAction(project);
  const awaiting = milestonesAwaitingApproval(project);
  const deadline = nextDeadline(project);
  const remaining = remainingCents(money);
  const noDate = tr("dashboard.projects.noDate");
  const tabHref = (t: RecordTab) => (t === "overview" ? `${base}/projects/${project.id}` : `${base}/projects/${project.id}?tab=${t}`);
  const milestoneById = (id: string | undefined) => project.milestones.find((m) => m.id === id) ?? null;
  const actionMilestone = milestoneById(action.milestoneId);

  const main = (
    <>
      <header className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[24px]! font-semibold leading-tight tracking-[-0.02em] text-admin-ink">
              {project.title || shortId(project.id)}
            </h1>
            <Pill tone={statusTone(project)}>{tr(STATUS_KEY[project.status])}</Pill>
          </div>
          <MetaLine>
            <span>
              {tr("dashboard.projects.metaClient")}{" "}
              {project.customerId && project.clientName ? (
                <Link href={`${base}/clients/${project.customerId}`} className="font-semibold text-admin-ink no-underline hover:underline">
                  {project.clientName}
                </Link>
              ) : (
                <b className="text-admin-ink">{project.clientName ?? tr("dashboard.projects.noClient")}</b>
              )}
              {contact?.displayName && contact.displayName !== project.clientName
                ? ` · ${interpolate(tr("dashboard.projects.metaPayer"), { name: contact.displayName })}`
                : null}
            </span>
            <span>
              {tr("dashboard.projects.metaOwner")}{" "}
              <b className="text-admin-ink" title={tr("dashboard.projects.filterOwnerUnavailable")}>
                —
              </b>
            </span>
            <span>
              {tr("dashboard.projects.metaNextDeadline")}{" "}
              <b className="text-admin-ink">
                {deadline
                  ? `${deadline.title} · ${dayLabel(deadline.at, project.timeZone, locale, noDate, { weekday: true, time: true })}`
                  : noDate}
              </b>
            </span>
            <span className="font-mono">{shortId(project.id)}</span>
          </MetaLine>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RecordMenu
            tenantSlug={tenantSlug}
            project={project}
            primaryIsClose={action.id === "close_project"}
            hrefs={{
              visibility: `${base}/projects/${project.id}?tab=visibility`,
              conversation: project.inquiryId ? `/${tenantSlug}/admin/messages/${project.inquiryId}` : null,
              client: project.customerId ? `${base}/clients/${project.customerId}` : null,
              list: `${base}/projects`,
            }}
            copy={{
              more: tr("dashboard.projects.more"),
              menuLabel: tr("dashboard.projects.moreMenu"),
              close: tr("dashboard.projects.close.open"),
              visibility: tr("dashboard.projects.tabVisibility"),
              conversation: tr("dashboard.projects.openInquiry"),
              client: tr("dashboard.projects.openClient"),
              sheet: closeSheetCopy(tr),
            }}
          />
          <PrimaryAction
            project={project}
            actionId={action.id}
            milestoneTitle={actionMilestone?.title ?? null}
            dueCents={money.dueCents}
            currency={money.currency}
            hrefs={{
              collect: `${base}/pos?mode=projects&view=collect&project=${project.id}`,
              milestones: tabHref("milestones"),
              conversation: project.inquiryId ? `/${tenantSlug}/admin/messages/${project.inquiryId}` : null,
            }}
            tr={tr}
          />
        </div>
      </header>

      <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={tr("dashboard.projects.kpiAgreement")}
          value={
            money.quoted.known
              ? formatOrderMoney(money.quoted.cents, money.currency)
              : money.proposedCents !== null
                ? formatOrderMoney(money.proposedCents, money.currency)
                : "—"
          }
          note={
            accepted
              ? interpolate(tr("dashboard.projects.kpiAgreementNote"), {
                  n: accepted.version,
                  date: dayLabel(accepted.acceptedAt, project.timeZone, locale, noDate),
                })
              : money.proposedCents !== null
                ? tr("dashboard.projects.money.proposed")
                : tr("dashboard.projects.money.quotedNotAgreed")
          }
          tone={money.quoted.known ? "ink" : "muted"}
          testId="agreement"
        />
        <KpiCard
          label={tr("dashboard.projects.kpiCollected")}
          value={formatOrderMoney(money.collectedCents, money.currency)}
          note={interpolate(tr("dashboard.projects.kpiCollectedNote"), {
            count: project.balances.filter((b) => b.collectedCents > 0).length,
          })}
          testId="collected"
        />
        <KpiCard
          label={tr("dashboard.projects.kpiDueNow")}
          value={formatOrderMoney(money.dueCents, money.currency)}
          note={
            action.suppressed === "collect_blocked_by_approval"
              ? tr("dashboard.projects.kpiDueNowBlocked")
              : money.dueCents > 0
                ? tr("dashboard.projects.kpiDueNowOwed")
                : tr("dashboard.projects.kpiDueNowNothing")
          }
          tone={money.dueCents > 0 && !action.suppressed ? "coral" : money.dueCents > 0 ? "muted" : "ink"}
          testId="due"
        />
        <KpiCard
          label={tr("dashboard.projects.kpiRemaining")}
          value={remaining === null ? tr("dashboard.projects.openEnded") : formatOrderMoney(remaining, money.currency)}
          note={
            accepted
              ? interpolate(tr("dashboard.projects.kpiRemainingNote"), { n: accepted.version })
              : tr("dashboard.projects.kpiRemainingNone")
          }
          tone={remaining === null ? "muted" : "ink"}
          testId="remaining"
        />
      </dl>
      <p className="-mt-2 m-0 text-[12px] text-admin-ink-muted">
        {interpolate(tr("dashboard.projects.feesSentence"), {
          agreed: money.payable.known ? formatOrderMoney(money.payable.cents, money.currency) : "—",
        })}
      </p>

      {money.mixedCurrency ? <Notice tone="warn">{tr("dashboard.projects.money.mixedCurrency")}</Notice> : null}

      {awaiting.length > 0 ? (
        <div className="flex items-center gap-3.5 rounded-[12px] border border-admin-brand bg-admin-brand-soft px-4 py-3.5" data-project-banner="approval">
          <span aria-hidden className="text-admin-brand">
            !
          </span>
          <div className="flex-1">
            <p className="m-0 text-[14px] font-semibold text-admin-brand">
              {interpolate(tr("dashboard.projects.bannerApprovalTitle"), { title: awaiting[0]!.title })}
            </p>
            <p className="m-0 mt-0.5 text-[12.5px] text-admin-ink-muted">
              {tr("dashboard.projects.bannerApprovalBody")}
              {action.suppressed === "collect_blocked_by_approval" ? ` ${tr("dashboard.projects.collectSuppressed")}` : ""}
            </p>
          </div>
          {/* No reminder writer exists (D-POS-36): the board's "Request
              approval" is drawn disabled with the reason. */}
          <button type="button" disabled title={tr("dashboard.projects.bannerRequestUnavailable")} className={BTN_PRIMARY}>
            {tr("dashboard.projects.bannerRequest")}
          </button>
          <ApproveVerballyButton
            milestoneId={awaiting[0]!.id}
            label={tr("dashboard.projects.bannerRecordVerbal")}
            className={BTN_SECONDARY}
            refusals={{
              limitReached: tr("dashboard.projects.milestones.refusalLimitReached"),
              notSubmitted: tr("dashboard.projects.milestones.refusalNotSubmitted"),
              notFound: tr("dashboard.projects.milestones.refusalNotFound"),
              unavailable: tr("dashboard.projects.milestones.refusalUnavailable"),
              notAllowed: tr("dashboard.projects.milestones.refusalNotAllowed"),
              invalid: tr("dashboard.projects.milestones.refusalInvalid"),
            }}
          />
        </div>
      ) : null}

      <TabStrip
        label={tr("dashboard.projects.pageTitle")}
        tabs={TABS.map((t) => ({
          id: t,
          href: tabHref(t),
          label: tr(TAB_KEY[t]),
          // W51 opens under Team, as the board's breadcrumb has it.
          active: t === tab || (t === "team" && tab === "visibility"),
        }))}
      />

      {tab === "overview" ? (
        <OverviewTab project={project} activity={activity} locale={locale} nowMs={nowMs} hrefs={{ milestones: tabHref("milestones"), conversation: project.inquiryId ? `/${tenantSlug}/admin/messages/${project.inquiryId}` : null }} tr={tr} />
      ) : null}
      {tab === "scope" ? <ScopeTab project={project} locale={locale} tenantSlug={tenantSlug} tr={tr} /> : null}
      {tab === "milestones" ? <MilestonesTab project={project} locale={locale} tr={tr} /> : null}
      {tab === "team" ? <TeamTab project={project} locale={locale} visibilityHref={tabHref("visibility")} conversationHref={project.inquiryId ? `/${tenantSlug}/admin/messages/${project.inquiryId}` : null} tr={tr} /> : null}
      {tab === "money" ? <MoneyTab project={project} tenantSlug={tenantSlug} tr={tr} /> : null}
      {tab === "activity" ? <ActivityTab project={project} activity={activity} locale={locale} tr={tr} /> : null}
      {tab === "visibility" ? <VisibilityTab tr={tr} /> : null}
    </>
  );

  return (
    <RecordShell
      main={main}
      side={<RecordSide project={project} contact={contact} locale={locale} tenantSlug={tenantSlug} tr={tr} />}
    />
  );
}

function statusTone(project: ProjectRecord): "indigo" | "green" | "red" | "slate" {
  if (project.status === "in_progress") return "indigo";
  if (project.status === "confirmed" || project.status === "completed") return "green";
  if (project.status === "cancelled") return "red";
  return "slate";
}

/**
 * The one primary action. A link wherever the action lives on another
 * surface (the till, the conversation, a tab); `close_project` is the
 * menu's sheet and is rendered by `RecordMenu`; `nothing` draws nothing.
 */
function PrimaryAction({
  project,
  actionId,
  milestoneTitle,
  dueCents,
  currency,
  hrefs,
  tr,
}: {
  project: ProjectRecord;
  actionId: ReturnType<typeof nextProjectAction>["id"];
  milestoneTitle: string | null;
  dueCents: number;
  currency: string;
  hrefs: { collect: string; milestones: string; conversation: string | null };
  tr: Tr;
}) {
  const label = tr(ACTION_KEY[actionId]);
  if (actionId === "nothing" || actionId === "close_project") return null;
  if (actionId === "collect_balance") {
    return (
      <Link href={hrefs.collect} className={BTN_PRIMARY} data-project-primary="collect">
        {label} · {formatOrderMoney(dueCents, currency)}
      </Link>
    );
  }
  if (actionId === "review_milestone" || actionId === "chase_milestone") {
    return (
      <Link href={hrefs.milestones} className={BTN_PRIMARY} data-project-primary={actionId}>
        {milestoneTitle ? `${label} · ${milestoneTitle}` : label}
      </Link>
    );
  }
  // draft_agreement · send_agreement · await_client · assign_team live on
  // the conversation's offer composer and lineup.
  if (hrefs.conversation && project.inquiryId) {
    return (
      <Link href={hrefs.conversation} className={BTN_PRIMARY} data-project-primary={actionId}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" disabled title={tr("dashboard.projects.scope.noInquiry")} className={BTN_PRIMARY}>
      {label}
    </button>
  );
}

function closeSheetCopy(tr: Tr) {
  return {
    title: tr("dashboard.projects.close.title"),
    subtitle: tr("dashboard.projects.close.subtitle"),
    closeLabel: tr("dashboard.projects.close.closeSheet"),
    outstanding: tr("dashboard.projects.close.outstanding"),
    clientMoney: tr("dashboard.projects.close.rowClientMoney"),
    work: tr("dashboard.projects.close.rowWork"),
    talent: tr("dashboard.projects.close.rowTalent"),
    remaining: tr("dashboard.projects.close.remaining"),
    nothingOwed: tr("dashboard.projects.close.nothingOwed"),
    milestonesOpen: tr("dashboard.projects.close.milestonesOpen"),
    allDelivered: tr("dashboard.projects.close.allDelivered"),
    assigned: tr("dashboard.projects.close.assigned"),
    nobodyAssigned: tr("dashboard.projects.close.nobodyAssigned"),
    choose: tr("dashboard.projects.close.choose"),
    complete: tr("dashboard.projects.close.complete"),
    completeBody: tr("dashboard.projects.close.completeBody"),
    cancel: tr("dashboard.projects.close.cancel"),
    cancelBody: tr("dashboard.projects.close.cancelBody"),
    cancelNote: tr("dashboard.projects.close.cancelNote"),
    archive: tr("dashboard.projects.close.archive"),
    archiveBody: tr("dashboard.projects.close.archiveBody"),
    reopen: tr("dashboard.projects.close.reopen"),
    reopenBody: tr("dashboard.projects.close.reopenBody"),
    reason: {
      milestones_open: tr("dashboard.projects.close.reasonMilestonesOpen"),
      money_owed: tr("dashboard.projects.close.reasonMoneyOwed"),
      already_closed: tr("dashboard.projects.close.reasonAlreadyClosed"),
      not_confirmed: tr("dashboard.projects.close.reasonNotConfirmed"),
      not_closed: tr("dashboard.projects.close.reasonNotClosed"),
      no_writer: tr("dashboard.projects.close.reasonNoWriter"),
    },
    back: tr("dashboard.projects.close.back"),
    confirmComplete: tr("dashboard.projects.close.confirmComplete"),
    confirmCancel: tr("dashboard.projects.close.confirmCancel"),
    refused: tr("dashboard.projects.close.refused"),
    done: tr("dashboard.projects.close.done"),
  };
}
