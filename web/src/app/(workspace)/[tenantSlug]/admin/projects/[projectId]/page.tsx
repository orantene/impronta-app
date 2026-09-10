/**
 * W42 — the project record, and W46/W47/W48/W49/W50/W51 as its tabs.
 *
 * ONE PAGE, SIX VIEWS. Scope, Milestones, Team, Money, Close and Who-sees-what
 * are states of this record, not separate routes: they read the same rows and a
 * route each would mean six loads of the same project. `?tab=` selects; the
 * strip is real links with `aria-current`, so it works with JavaScript off and
 * a screen reader announces which one is open.
 *
 * THE NEXT-ACTION PANEL DECIDES ONE BUTTON. Which one is
 * `nextProjectAction()`, next door and tested. The rule that matters most is
 * that Collect never appears while a deliverable is waiting on the client, and
 * when that suppression happens the panel SAYS SO — an action that silently
 * disappears reads as a bug.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { loadProject } from "@/lib/projects/projects-reader";
import {
  acceptedAgreement,
  amendmentVerdict,
  closeReadiness,
  liveAgreement,
  priorAgreements,
  nextProjectAction,
  projectMoney,
  visibilityRows,
  type AgreementVersion,
  type MilestoneStatus,
  type ProjectRecord,
  type VisibilityAudience,
} from "@/lib/projects/project-record";
import { Card, Chip, Figure, Notice, PageHeading, PageShell, isoDate, shortId } from "../_shared";
import { ACTION_KEY, STATUS_KEY } from "../_keys";
import { MilestoneDecisions } from "./milestone-decisions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; projectId: string }>;
type PageSearch = Promise<{ tab?: string }>;

type Tab = "summary" | "scope" | "milestones" | "team" | "money" | "close" | "visibility";

const TABS: readonly Tab[] = [
  "summary",
  "scope",
  "milestones",
  "team",
  "money",
  "close",
  "visibility",
];

const TAB_KEY: Record<Tab, string> = {
  summary: "dashboard.projects.tabSummary",
  scope: "dashboard.projects.tabScope",
  milestones: "dashboard.projects.tabMilestones",
  team: "dashboard.projects.tabTeam",
  money: "dashboard.projects.tabMoney",
  close: "dashboard.projects.tabClose",
  visibility: "dashboard.projects.tabVisibility",
};

const MILESTONE_STATUS_KEY: Record<MilestoneStatus, string> = {
  draft: "dashboard.projects.milestones.statusDraft",
  submitted: "dashboard.projects.milestones.statusSubmitted",
  approved: "dashboard.projects.milestones.statusApproved",
  revision_requested: "dashboard.projects.milestones.statusRevisionRequested",
  cancelled: "dashboard.projects.milestones.statusCancelled",
};

const AUDIENCE_KEY: Record<VisibilityAudience, string> = {
  staff: "dashboard.projects.visibility.audienceStaff",
  assigned_professional: "dashboard.projects.visibility.audienceProfessional",
  client: "dashboard.projects.visibility.audienceClient",
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
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "summary";
  const base = `/${tenantSlug}/admin/projects`;

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
        <PageHeading
          title={tr("dashboard.projects.pageTitle")}
          back={{ href: base, label: tr("dashboard.projects.backToList") }}
        />
        <Notice tone="warn">{message}</Notice>
      </PageShell>
    );
  }

  const project = load.project;

  return (
    <PageShell>
      <PageHeading
        title={project.title || shortId(project.id)}
        back={{ href: base, label: tr("dashboard.projects.backToList") }}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Chip active>{tr(STATUS_KEY[project.status])}</Chip>
        <span className="text-sm text-muted-foreground">
          {project.clientName ?? tr("dashboard.projects.noClient")}
        </span>
        <span className="text-sm text-muted-foreground">
          {isoDate(project.startsAt, tr("dashboard.projects.noDate"))}
        </span>
        {project.customerId ? (
          <Link
            href={`/${tenantSlug}/admin/clients/${project.customerId}`}
            className="text-sm underline underline-offset-4"
          >
            {tr("dashboard.projects.openClient")}
          </Link>
        ) : null}
        {project.inquiryId ? (
          <Link
            href={`/${tenantSlug}/admin/messages?inquiry=${project.inquiryId}`}
            className="text-sm underline underline-offset-4"
          >
            {tr("dashboard.projects.openInquiry")}
          </Link>
        ) : null}
      </div>

      <NextActionPanel project={project} tr={tr} />

      <nav
        aria-label={tr("dashboard.projects.pageTitle")}
        className="mb-6 mt-6 flex flex-wrap gap-2"
      >
        {TABS.map((t) => (
          <Link
            key={t}
            href={t === "summary" ? `${base}/${project.id}` : `${base}/${project.id}?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className="no-underline"
          >
            <Chip active={t === tab}>{tr(TAB_KEY[t])}</Chip>
          </Link>
        ))}
      </nav>

      {tab === "summary" ? <SummaryTab project={project} tr={tr} /> : null}
      {tab === "scope" ? (
        <ScopeTab project={project} tr={tr} tenantSlug={tenantSlug} />
      ) : null}
      {tab === "milestones" ? <MilestonesTab project={project} tr={tr} /> : null}
      {tab === "team" ? <TeamTab project={project} tr={tr} /> : null}
      {tab === "money" ? <MoneyTab project={project} tr={tr} tenantSlug={tenantSlug} /> : null}
      {tab === "close" ? <CloseTab project={project} tr={tr} /> : null}
      {tab === "visibility" ? <VisibilityTab tr={tr} /> : null}
    </PageShell>
  );
}

function NextActionPanel({ project, tr }: { project: ProjectRecord; tr: Tr }) {
  const action = nextProjectAction(project);
  return (
    <Card title={tr("dashboard.projects.nextActionTitle")}>
      <p className="m-0 text-base font-medium text-foreground">{tr(ACTION_KEY[action.id])}</p>
      {action.suppressed === "collect_blocked_by_approval" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {tr("dashboard.projects.collectSuppressed")}
        </p>
      ) : null}
    </Card>
  );
}

// ── Summary ──────────────────────────────────────────────────────────

function SummaryTab({ project, tr }: { project: ProjectRecord; tr: Tr }) {
  const money = projectMoney(project);
  const readiness = closeReadiness(project);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card title={tr("dashboard.projects.money.title")}>
        <dl className="grid grid-cols-2 gap-4">
          <Figure
            label={tr("dashboard.projects.money.quoted")}
            value={
              money.quoted.known
                ? formatOrderMoney(money.quoted.cents, money.currency)
                : money.proposedCents !== null
                  ? formatOrderMoney(money.proposedCents, money.currency)
                  : tr("dashboard.projects.money.quotedNotAgreed")
            }
            note={
              money.quoted.known
                ? undefined
                : money.proposedCents !== null
                  ? tr("dashboard.projects.money.proposed")
                  : undefined
            }
          />
          <Figure
            label={tr("dashboard.projects.money.due")}
            value={formatOrderMoney(money.dueCents, money.currency)}
          />
        </dl>
      </Card>
      <Card title={tr("dashboard.projects.milestones.title")}>
        {project.milestones.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            {tr("dashboard.projects.milestones.none")}
          </p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {project.milestones.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-foreground">{m.title}</span>
                <span className="text-xs text-muted-foreground">
                  {tr(MILESTONE_STATUS_KEY[m.status])}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={tr("dashboard.projects.team.title")} className="sm:col-span-2">
        {project.assignments.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{tr("dashboard.projects.team.none")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {project.assignments.map((a) => (
              <li key={a.id}>
                <Chip>{a.name || tr("dashboard.projects.team.unnamed")}</Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {readiness.closable ? (
        <Card className="sm:col-span-2">
          <p className="m-0 text-sm text-muted-foreground">{tr("dashboard.projects.close.ready")}</p>
        </Card>
      ) : null}
    </div>
  );
}

// ── W46 Scope and agreement ──────────────────────────────────────────

function AgreementLines({ a, tr }: { a: AgreementVersion; tr: Tr }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-4">
      <Figure
        label={tr("dashboard.projects.scope.total")}
        value={formatOrderMoney(a.totalClientCents, a.currency)}
      />
      <Figure
        label={tr("dashboard.projects.scope.coordinatorFee")}
        value={formatOrderMoney(a.coordinatorFeeCents, a.currency)}
      />
    </dl>
  );
}

function ScopeTab({
  project,
  tr,
  tenantSlug,
}: {
  project: ProjectRecord;
  tr: Tr;
  tenantSlug: string;
}) {
  const live = liveAgreement(project);
  const accepted = acceptedAgreement(project);
  const prior = priorAgreements(project);
  const verdict = amendmentVerdict(project);

  return (
    <div className="grid gap-4">
      <Card title={tr("dashboard.projects.scope.title")}>
        {!project.inquiryId ? (
          <p className="m-0 text-sm text-muted-foreground">
            {tr("dashboard.projects.scope.noInquiry")}
          </p>
        ) : !live && !accepted ? (
          <p className="m-0 text-sm text-muted-foreground">{tr("dashboard.projects.scope.none")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chip active>
                {interpolate(tr("dashboard.projects.scope.version"), {
                  n: (accepted ?? live)!.version,
                })}
              </Chip>
              <span className="text-sm text-muted-foreground">
                {tr("dashboard.projects.scope.inForce")}
              </span>
              {(accepted ?? live)!.acceptedAt ? (
                <span className="text-sm text-muted-foreground">
                  {tr("dashboard.projects.scope.accepted")}{" "}
                  {isoDate((accepted ?? live)!.acceptedAt, tr("dashboard.projects.noDate"))}
                </span>
              ) : (accepted ?? live)!.sentAt ? (
                <span className="text-sm text-muted-foreground">
                  {tr("dashboard.projects.scope.sent")}{" "}
                  {isoDate((accepted ?? live)!.sentAt, tr("dashboard.projects.noDate"))}
                </span>
              ) : null}
            </div>
            <AgreementLines a={(accepted ?? live)!} tr={tr} />
            {(accepted ?? live)!.notes ? (
              <p className="mt-3 whitespace-pre-line text-sm text-foreground">
                {(accepted ?? live)!.notes}
              </p>
            ) : null}
          </>
        )}
      </Card>

      <Card title={tr("dashboard.projects.scope.history")}>
        {prior.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            {tr("dashboard.projects.scope.historyNone")}
          </p>
        ) : (
          <ul className="m-0 list-none space-y-4 p-0">
            {prior.map((a) => (
              <li key={a.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip>{interpolate(tr("dashboard.projects.scope.version"), { n: a.version })}</Chip>
                  <span className="text-sm text-muted-foreground">
                    {formatOrderMoney(a.totalClientCents, a.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={tr("dashboard.projects.scope.amend")}>
        <p className="m-0 text-sm text-muted-foreground">
          {tr("dashboard.projects.scope.amendIntro")}
        </p>
        {/* The refusal is stated BEFORE the operator can act, because the
            database refuses this with a unique violation nobody can read. */}
        {!verdict.ok ? (
          <p className="mt-3 text-sm text-foreground">
            {verdict.reason === "nothing_to_amend"
              ? tr("dashboard.projects.scope.refusalNothingToAmend")
              : verdict.reason === "version_already_live"
                ? tr("dashboard.projects.scope.refusalVersionLive")
                : tr("dashboard.projects.scope.refusalClosed")}
          </p>
        ) : project.inquiryId ? (
          // An amendment is drafted on the conversation, where the offer engine
          // lives. This screen shows the history and says whether the slot is
          // free; it does not carry a second offer composer.
          <p className="mt-3 text-sm">
            <Link
              href={`/${tenantSlug}/admin/messages?inquiry=${project.inquiryId}`}
              className="underline underline-offset-4"
            >
              {tr("dashboard.projects.openInquiry")}
            </Link>
          </p>
        ) : null}
      </Card>
    </div>
  );
}

// ── W47 Milestones and deliverables ──────────────────────────────────

function MilestonesTab({ project, tr }: { project: ProjectRecord; tr: Tr }) {
  return (
    <div className="grid gap-4">
      <Card title={tr("dashboard.projects.milestones.title")}>
        {project.milestones.length === 0 ? (
          <>
            <p className="m-0 text-sm text-foreground">
              {tr("dashboard.projects.milestones.none")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {tr("dashboard.projects.milestones.noneHint")}
            </p>
          </>
        ) : (
          <MilestoneDecisions
            milestones={project.milestones.map((m) => ({
              id: m.id,
              title: m.title,
              kind: m.kind,
              status: m.status,
              revision: m.revision,
              revisionLimit: m.revisionLimit,
              dueAt: isoDate(m.dueAt, tr("dashboard.projects.milestones.noDue")),
              statusLabel: tr(MILESTONE_STATUS_KEY[m.status]),
              revisionsLabel: interpolate(tr("dashboard.projects.milestones.revisionsUsed"), {
                used: m.revision,
                limit: m.revisionLimit,
              }),
            }))}
            copy={{
              colItem: tr("dashboard.projects.milestones.colItem"),
              colStatus: tr("dashboard.projects.milestones.colStatus"),
              colDue: tr("dashboard.projects.milestones.colDue"),
              colRevisions: tr("dashboard.projects.milestones.colRevisions"),
              caption: tr("dashboard.projects.milestones.tableCaption"),
              approve: tr("dashboard.projects.milestones.approve"),
              requestRevision: tr("dashboard.projects.milestones.requestRevision"),
              passthrough: tr("dashboard.projects.milestones.passthrough"),
              limitReached: tr("dashboard.projects.milestones.refusalLimitReached"),
              notSubmitted: tr("dashboard.projects.milestones.refusalNotSubmitted"),
              notFound: tr("dashboard.projects.milestones.refusalNotFound"),
              unavailable: tr("dashboard.projects.milestones.refusalUnavailable"),
              notAllowed: tr("dashboard.projects.milestones.refusalNotAllowed"),
              invalid: tr("dashboard.projects.milestones.refusalInvalid"),
            }}
          />
        )}
      </Card>
      <Card>
        <p className="m-0 text-sm text-muted-foreground">
          {tr("dashboard.projects.milestones.passthroughNote")}
        </p>
      </Card>
    </div>
  );
}

// ── W48 Team ─────────────────────────────────────────────────────────

function TeamTab({ project, tr }: { project: ProjectRecord; tr: Tr }) {
  return (
    <div className="grid gap-4">
      <Card title={tr("dashboard.projects.team.title")}>
        {project.assignments.length === 0 ? (
          <>
            <p className="m-0 text-sm text-foreground">{tr("dashboard.projects.team.none")}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {tr("dashboard.projects.team.noneHint")}
            </p>
          </>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full caption-bottom border-collapse text-sm">
              <caption className="sr-only">{tr("dashboard.projects.team.tableCaption")}</caption>
              <thead className="[&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                <tr>
                  <th scope="col">{tr("dashboard.projects.team.colPerson")}</th>
                  <th scope="col">{tr("dashboard.projects.team.colRole")}</th>
                  <th scope="col">{tr("dashboard.projects.team.colUnits")}</th>
                  <th scope="col">{tr("dashboard.projects.team.colFee")}</th>
                  <th scope="col">{tr("dashboard.projects.team.colCharge")}</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-b [&_td]:border-border/60 [&_td]:py-2 [&_td]:pr-4 [&_tr:last-child_td]:border-0">
                {project.assignments.map((a) => (
                  <tr key={a.id}>
                    <th scope="row" className="py-2 pr-4 text-left font-normal text-foreground">
                      {a.name || tr("dashboard.projects.team.unnamed")}
                    </th>
                    <td className="text-muted-foreground">{a.roleLabel ?? ""}</td>
                    <td className="text-muted-foreground">
                      {a.units} {a.pricingUnit}
                    </td>
                    <td className="text-foreground">
                      {formatOrderMoney(a.talentCostCents, a.currency)}
                    </td>
                    <td className="text-foreground">
                      {formatOrderMoney(a.clientChargeCents, a.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <p className="m-0 text-sm text-muted-foreground">
          {tr("dashboard.projects.team.marginNote")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {tr("dashboard.projects.team.replaceNote")}
        </p>
      </Card>
    </div>
  );
}

// ── W49 Money ────────────────────────────────────────────────────────

function MoneyTab({
  project,
  tr,
  tenantSlug,
}: {
  project: ProjectRecord;
  tr: Tr;
  tenantSlug: string;
}) {
  const money = projectMoney(project);
  return (
    <div className="grid gap-4">
      {money.mixedCurrency ? (
        <Notice>{tr("dashboard.projects.money.mixedCurrency")}</Notice>
      ) : null}
      <Card title={tr("dashboard.projects.money.title")}>
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label={tr("dashboard.projects.money.quoted")}
            value={
              money.quoted.known
                ? formatOrderMoney(money.quoted.cents, money.currency)
                : money.proposedCents !== null
                  ? formatOrderMoney(money.proposedCents, money.currency)
                  : tr("dashboard.projects.money.quotedNotAgreed")
            }
            note={
              money.quoted.known
                ? undefined
                : money.proposedCents !== null
                  ? tr("dashboard.projects.money.proposed")
                  : undefined
            }
          />
          {/* Earned is deliberately not a figure. See ProjectAmount. */}
          <Figure
            label={tr("dashboard.projects.money.earned")}
            value={tr("dashboard.projects.money.earnedNotRecorded")}
          />
          <Figure
            label={tr("dashboard.projects.money.payable")}
            value={
              money.payable.known
                ? formatOrderMoney(money.payable.cents, money.currency)
                : tr("dashboard.projects.money.payableNotRecorded")
            }
          />
          <Figure
            label={tr("dashboard.projects.money.due")}
            value={formatOrderMoney(money.dueCents, money.currency)}
            note={
              money.collectedCents > 0
                ? `${tr("dashboard.projects.money.collected")} ${formatOrderMoney(money.collectedCents, money.currency)}`
                : undefined
            }
          />
        </dl>
      </Card>
      <Card title={tr("dashboard.projects.money.colOrder")}>
        {project.balances.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            {tr("dashboard.projects.money.noOrders")}
          </p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full caption-bottom border-collapse text-sm">
              <caption className="sr-only">{tr("dashboard.projects.money.tableCaption")}</caption>
              <thead className="[&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                <tr>
                  <th scope="col">{tr("dashboard.projects.money.colOrder")}</th>
                  <th scope="col">{tr("dashboard.projects.money.colStatus")}</th>
                  <th scope="col">{tr("dashboard.projects.money.colTotal")}</th>
                  <th scope="col">{tr("dashboard.projects.money.colOutstanding")}</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-b [&_td]:border-border/60 [&_td]:py-2 [&_td]:pr-4 [&_tr:last-child_td]:border-0">
                {project.balances.map((b) => (
                  <tr key={b.orderId}>
                    <th scope="row" className="py-2 pr-4 text-left font-normal">
                      <Link
                        href={`/${tenantSlug}/admin/orders?q=${shortId(b.orderId)}`}
                        className="underline underline-offset-4"
                      >
                        {shortId(b.orderId)}
                      </Link>
                    </th>
                    <td className="text-muted-foreground">{b.status}</td>
                    <td className="text-foreground">
                      {formatOrderMoney(b.totalCents, b.currency)}
                    </td>
                    <td className="text-foreground">
                      {formatOrderMoney(b.outstandingCents, b.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── W50 Close ────────────────────────────────────────────────────────

function CloseTab({ project, tr }: { project: ProjectRecord; tr: Tr }) {
  const readiness = closeReadiness(project);
  return (
    <div className="grid gap-4">
      <Card title={tr("dashboard.projects.close.title")}>
        {readiness.closable ? (
          <p className="m-0 text-sm text-foreground">{tr("dashboard.projects.close.ready")}</p>
        ) : (
          <>
            <h3 className="m-0 mb-2 text-sm font-medium text-foreground">
              {tr("dashboard.projects.close.blockers")}
            </h3>
            <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-foreground">
              {readiness.blockers.map((b, i) => (
                <li key={`${b.kind}-${i}`}>
                  {b.kind === "milestone"
                    ? interpolate(tr("dashboard.projects.close.blockerMilestone"), {
                        title: b.title,
                        status: tr(MILESTONE_STATUS_KEY[b.status]),
                      })
                    : b.kind === "money"
                      ? interpolate(tr("dashboard.projects.close.blockerMoney"), {
                          amount: formatOrderMoney(b.outstandingCents, b.currency),
                        })
                      : interpolate(tr("dashboard.projects.close.alreadyClosed"), {
                          status: tr(STATUS_KEY[b.status]),
                        })}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              {tr("dashboard.projects.close.options")}
            </p>
          </>
        )}
        <p className="mt-4 text-sm text-muted-foreground">{tr("dashboard.projects.close.note")}</p>
      </Card>
    </div>
  );
}

// ── W51 Who sees what ────────────────────────────────────────────────

function VisibilityTab({ tr }: { tr: Tr }) {
  const rows = visibilityRows();
  const yes = tr("dashboard.projects.visibility.yes");
  const no = tr("dashboard.projects.visibility.no");
  return (
    <div className="grid gap-4">
      <Card title={tr("dashboard.projects.visibility.title")}>
        <p className="m-0 mb-4 text-sm text-muted-foreground">
          {tr("dashboard.projects.visibility.intro")}
        </p>
        <div className="w-full overflow-x-auto">
          <table className="w-full caption-bottom border-collapse text-sm">
            <caption className="sr-only">
              {tr("dashboard.projects.visibility.tableCaption")}
            </caption>
            <thead className="[&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
              <tr>
                <th scope="col">{tr("dashboard.projects.visibility.title")}</th>
                <th scope="col">{tr("dashboard.projects.visibility.colMilestones")}</th>
                <th scope="col">{tr("dashboard.projects.visibility.colMargin")}</th>
                <th scope="col">{tr("dashboard.projects.visibility.colOwnFee")}</th>
                <th scope="col">{tr("dashboard.projects.visibility.colOtherPurchases")}</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:border-border/60 [&_td]:py-2 [&_td]:pr-4 [&_tr:last-child_td]:border-0">
              {rows.map((row) => (
                <tr key={row.audience}>
                  <th scope="row" className="py-2 pr-4 text-left font-normal text-foreground">
                    {tr(AUDIENCE_KEY[row.audience])}
                  </th>
                  <td className="text-muted-foreground">{row.seesMilestones ? yes : no}</td>
                  <td className="text-muted-foreground">{row.seesMargin ? yes : no}</td>
                  <td className="text-muted-foreground">{row.seesOwnFeeOnly ? yes : no}</td>
                  <td className="text-muted-foreground">
                    {row.seesClientOtherPurchases ? yes : no}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {tr("dashboard.projects.visibility.note")}
        </p>
      </Card>
      <Card title={tr("dashboard.projects.notBuilt.title")}>
        <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{tr("dashboard.projects.notBuilt.paymentLinks")}</li>
          <li>{tr("dashboard.projects.notBuilt.allocation")}</li>
        </ul>
      </Card>
    </div>
  );
}
