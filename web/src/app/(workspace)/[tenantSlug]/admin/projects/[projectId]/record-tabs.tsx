/**
 * The project record's server-rendered tabs: Overview (W42), Scope &
 * agreement (W46), Money (W49), Files & activity, Who sees what (W51).
 * Milestones (W47) and Team (W48) carry actions and live in their own
 * client modules.
 *
 * Every figure is `projectMoney`'s and every verdict `project-record`'s.
 * A control the engine has no writer for is drawn disabled with its reason
 * (D-POS-27, D-POS-36, D-POS-37), never as a button that does nothing.
 */

import Link from "next/link";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ProjectActivityLoad, ProjectActivityRow } from "@/lib/projects/projects-reader";
import {
  acceptedAgreement,
  amendmentVerdict,
  balanceOwedCents,
  liveAgreement,
  openMilestonesByDue,
  overdueDays,
  priorAgreements,
  projectMoney,
  remainingCents,
  type AgreementVersion,
  type ProjectMilestone,
  type ProjectRecord,
} from "@/lib/projects/project-record";
import {
  BTN_PRIMARY,
  BTN_ROW,
  BTN_SECONDARY,
  Card,
  KeyValue,
  ListHead,
  ListRow,
  Notice,
  Pill,
  SectionTitle,
  dayLabel,
  orderStatusLabel,
  shortId,
  type PillTone,
} from "../_shared";
import { schedulingEngineSentences } from "@/lib/scheduling/engine-refusals";
import { MILESTONE_STATUS_KEY, milestoneTone } from "./milestone-keys";
import { AmendmentActions } from "./amendment-actions";

type Tr = (key: string) => string;

// ── Overview ─────────────────────────────────────────────────────────

export function OverviewTab({
  project,
  activity,
  locale,
  nowMs,
  hrefs,
  tr,
}: {
  project: ProjectRecord;
  activity: ProjectActivityLoad;
  locale: string;
  nowMs: number;
  hrefs: { milestones: string; conversation: string | null };
  tr: Tr;
}) {
  const noDate = tr("dashboard.projects.noDate");
  const upcoming = openMilestonesByDue(project);
  const late = overdueDays(project, nowMs);
  const live = liveAgreement(project);
  const blockers: { id: string; title: string; detail: string; href: string | null }[] = [];
  if (late !== null) {
    const worst = upcoming.find((m) => m.dueAt && new Date(m.dueAt).getTime() < nowMs);
    if (worst) {
      blockers.push({
        id: `late-${worst.id}`,
        title: interpolate(tr("dashboard.projects.blockerLate"), { title: worst.title, days: late }),
        detail: tr("dashboard.projects.blockerLateDetail"),
        href: hrefs.milestones,
      });
    }
  }
  if (live && live.status !== "accepted") {
    blockers.push({
      id: `offer-${live.id}`,
      title: interpolate(tr("dashboard.projects.blockerOffer"), { n: live.version }),
      detail: tr("dashboard.projects.blockerOfferDetail"),
      href: hrefs.conversation,
    });
  }
  if (project.assignments.length === 0 && acceptedAgreement(project)) {
    blockers.push({
      id: "team",
      title: tr("dashboard.projects.blockerNoTeam"),
      detail: tr("dashboard.projects.team.noneHint"),
      href: hrefs.conversation,
    });
  }
  return (
    <>
      <SectionTitle>{tr("dashboard.projects.upcomingMilestones")}</SectionTitle>
      <Card>
        {upcoming.length === 0 ? (
          <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted">{tr("dashboard.projects.upcomingNone")}</p>
        ) : (
          upcoming.map((m) => (
            <ListRow key={m.id} cols="grid-cols-[1.3fr_1.6fr_90px_150px]">
              <b>{m.title}</b>
              <span className="text-admin-ink-muted">
                {tr(MILESTONE_STATUS_KEY[m.status])}
                {" · "}
                {m.dueAt
                  ? interpolate(tr("dashboard.projects.dueOn"), { date: dayLabel(m.dueAt, project.timeZone, locale, noDate) })
                  : tr("dashboard.projects.milestones.noDue")}
              </span>
              {/* Zero means "not set yet" on a milestone: the dash, never $0. */}
              <span
                className={`text-[15px] font-semibold tracking-[-0.02em] tabular-nums ${m.amountCents === 0 ? "text-admin-ink-dim" : "text-admin-ink"}`}
                title={m.amountCents === 0 ? tr("dashboard.projects.milestoneAmountUnknown") : undefined}
              >
                {m.amountCents === 0 ? "—" : formatOrderMoney(m.amountCents, project.currency)}
              </span>
              <span>
                <MilestonePill milestone={m} nowMs={nowMs} tr={tr} />
              </span>
            </ListRow>
          ))
        )}
      </Card>

      <SectionTitle>{tr("dashboard.projects.blockers")}</SectionTitle>
      <Card>
        {blockers.length === 0 ? (
          <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted">{tr("dashboard.projects.blockersNone")}</p>
        ) : (
          blockers.map((b) => (
            <ListRow key={b.id} cols="grid-cols-[1.6fr_1.4fr_auto]">
              <b>{b.title}</b>
              <span className="text-admin-ink-muted">{b.detail}</span>
              {b.href ? (
                <Link href={b.href} className={`${BTN_SECONDARY} ${BTN_ROW}`}>
                  {tr("dashboard.projects.blockerOpen")}
                </Link>
              ) : (
                <span />
              )}
            </ListRow>
          ))
        )}
      </Card>

      <SectionTitle>{tr("dashboard.projects.recentActivity")}</SectionTitle>
      <ActivityCard project={project} activity={activity} locale={locale} limit={5} tr={tr} />
    </>
  );
}

export function MilestonePill({ milestone, nowMs, tr }: { milestone: ProjectMilestone; nowMs: number | null; tr: Tr }) {
  const late =
    nowMs !== null &&
    milestone.dueAt !== null &&
    milestone.status !== "approved" &&
    milestone.status !== "cancelled" &&
    new Date(milestone.dueAt).getTime() < nowMs;
  if (late) return <Pill tone="red">{tr("dashboard.projects.milestones.overdue")}</Pill>;
  return <Pill tone={milestoneTone(milestone.status)}>{tr(MILESTONE_STATUS_KEY[milestone.status])}</Pill>;
}

// ── Activity ─────────────────────────────────────────────────────────

const ACTIVITY_KEY: Record<string, string> = {
  "booking.created_manual": "dashboard.projects.activity.created_manual",
  "booking.duplicated": "dashboard.projects.activity.duplicated",
  "booking.converted_from_inquiry": "dashboard.projects.activity.converted_from_inquiry",
  "booking.lineup_attached_from_inquiry": "dashboard.projects.activity.lineup_attached",
  "booking.created_from_inquiry_quick": "dashboard.projects.activity.created_from_inquiry_quick",
  "booking.client_account_changed": "dashboard.projects.activity.client_account_changed",
  "booking.client_contact_changed": "dashboard.projects.activity.client_contact_changed",
  "booking.manager_changed": "dashboard.projects.activity.manager_changed",
  "booking.status_changed": "dashboard.projects.activity.status_changed",
  "booking.payment_state_changed": "dashboard.projects.activity.payment_state_changed",
  "booking.talent_row_saved": "dashboard.projects.activity.talent_row_saved",
  "booking.talent_row_added": "dashboard.projects.activity.talent_row_added",
  "booking.talent_row_removed": "dashboard.projects.activity.talent_row_removed",
  "booking.client_portal_visibility_changed": "dashboard.projects.activity.visibility_changed",
  "booking.job_fields_updated": "dashboard.projects.activity.job_fields_updated",
};

function activitySentence(row: ProjectActivityRow, tr: Tr): string {
  const key = ACTIVITY_KEY[row.eventType];
  if (!key) return row.eventType;
  if (row.eventType === "booking.status_changed") {
    return interpolate(tr(key), {
      from: String(row.payload.from ?? "?"),
      to: String(row.payload.to ?? "?"),
    });
  }
  return tr(key);
}

function ActivityCard({
  project,
  activity,
  locale,
  limit,
  tr,
}: {
  project: ProjectRecord;
  activity: ProjectActivityLoad;
  locale: string;
  limit?: number;
  tr: Tr;
}) {
  const noDate = tr("dashboard.projects.noDate");
  if (!activity.ok) return <Notice tone="warn">{tr("dashboard.projects.activityUnavailable")}</Notice>;
  const rows = limit ? activity.rows.slice(0, limit) : activity.rows;
  return (
    <Card>
      {rows.length === 0 ? (
        <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted">{tr("dashboard.projects.activityNone")}</p>
      ) : (
        rows.map((row) => (
          <ListRow key={row.id} cols="grid-cols-[80px_1fr]">
            <span className="text-admin-ink-muted">{dayLabel(row.at, project.timeZone, locale, noDate)}</span>
            <span>{activitySentence(row, tr)}</span>
          </ListRow>
        ))
      )}
    </Card>
  );
}

export function ActivityTab({
  project,
  activity,
  locale,
  tr,
}: {
  project: ProjectRecord;
  activity: ProjectActivityLoad;
  locale: string;
  tr: Tr;
}) {
  return (
    <>
      <SectionTitle>{tr("dashboard.projects.files")}</SectionTitle>
      {/* A file is attached to the milestone it belongs to (W47); this list
          is every milestone that carries one. */}
      <Card>
        {project.milestones.filter((m) => m.filePath).length === 0 ? (
          <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted">{tr("dashboard.projects.filesNone")}</p>
        ) : (
          project.milestones
            .filter((m) => m.filePath)
            .map((m) => (
              <ListRow key={m.id} cols="grid-cols-[1.3fr_1.6fr]" className="border-t first:border-t-0">
                <b>{m.title}</b>
                <span className="truncate text-admin-ink-muted" title={m.filePath ?? undefined}>
                  {(m.filePath ?? "").slice((m.filePath ?? "").lastIndexOf("/") + 1).replace(/^[0-9a-f-]{36}-/i, "")}
                </span>
              </ListRow>
            ))
        )}
      </Card>
      <SectionTitle>{tr("dashboard.projects.activityAll")}</SectionTitle>
      <ActivityCard project={project} activity={activity} locale={locale} tr={tr} />
    </>
  );
}

// ── W46 Scope and agreement ──────────────────────────────────────────

function versionTone(a: AgreementVersion): PillTone {
  if (a.status === "accepted") return "green";
  if (a.status === "sent" || a.status === "draft") return "coral";
  return "slate";
}

function versionLabel(a: AgreementVersion, tr: Tr): string {
  const n = interpolate(tr("dashboard.projects.scope.version"), { n: a.version });
  if (a.status === "accepted") return `${n} · ${tr("dashboard.projects.scope.acceptedCurrent")}`;
  if (a.status === "sent" || a.status === "draft") return `${n} · ${tr("dashboard.projects.scope.proposedChange")}`;
  return `${n} · ${tr("dashboard.projects.scope.superseded")}`;
}

export function ScopeTab({
  project,
  locale,
  tenantSlug,
  tr,
}: {
  project: ProjectRecord;
  locale: string;
  tenantSlug: string;
  tr: Tr;
}) {
  const live = liveAgreement(project);
  const accepted = acceptedAgreement(project);
  const prior = priorAgreements(project);
  const verdict = amendmentVerdict(project);
  const proposed = live && live.status !== "accepted" ? live : null;
  // Sending an amendment supersedes the accepted row (one live version per
  // conversation), so the terms in force while a proposal is out are the
  // newest superseded version.
  const kept = accepted ?? (proposed ? prior[0] ?? null : null);
  const noDate = tr("dashboard.projects.noDate");
  const ordered = [...(accepted ? [accepted] : []), ...(proposed ? [proposed] : []), ...prior];
  const conversation = project.inquiryId ? `/${tenantSlug}/admin/messages/${project.inquiryId}` : null;

  if (!project.inquiryId) return <Notice>{tr("dashboard.projects.scope.noInquiry")}</Notice>;
  if (ordered.length === 0) return <Notice>{tr("dashboard.projects.scope.none")}</Notice>;

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="inline-flex gap-0.5 rounded-[9px] bg-admin-surface-alt p-[3px]" role="list" aria-label={tr("dashboard.projects.scope.history")}>
          {ordered.map((a, i) => (
            <span
              key={a.id}
              role="listitem"
              className={
                i === 0
                  ? "rounded-[7px] bg-admin-card px-2.5 py-[5px] text-[12px] font-semibold text-admin-ink shadow-admin-rest"
                  : "px-2.5 py-[5px] text-[12px] font-semibold text-admin-ink-muted"
              }
            >
              {versionLabel(a, tr)}
            </span>
          ))}
        </div>
        <span className="flex-1" />
        {/* The refusal is stated BEFORE the operator can act, because the
            database refuses this with a unique violation nobody can read. */}
        {verdict.ok && conversation ? (
          <Link href={conversation} className={BTN_SECONDARY}>
            {tr("dashboard.projects.scope.propose")}
          </Link>
        ) : (
          <button type="button" disabled title={amendmentRefusal(verdict, tr)} className={BTN_SECONDARY}>
            {tr("dashboard.projects.scope.propose")}
          </button>
        )}
      </div>

      {accepted ? (
        <Card>
          <div className="flex flex-col gap-2.5 p-4">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[14px] font-semibold text-admin-ink">
                {interpolate(tr("dashboard.projects.scope.acceptedTitle"), {
                  n: accepted.version,
                  date: dayLabel(accepted.acceptedAt, project.timeZone, locale, noDate),
                })}
              </span>
              <Pill tone="green">{tr("dashboard.projects.scope.binding")}</Pill>
            </div>
            <div className="grid gap-3 text-[13px] sm:grid-cols-2">
              <div>
                {project.assignments.length === 0 ? (
                  <KeyValue label={tr("dashboard.projects.team.title")} value={tr("dashboard.projects.team.none")} dim />
                ) : (
                  project.assignments.map((a) => (
                    <KeyValue
                      key={a.id}
                      label={a.roleLabel ?? a.name ?? tr("dashboard.projects.team.unnamed")}
                      value={`${a.units} ${a.pricingUnit} · ${a.name || tr("dashboard.projects.team.unnamed")}`}
                    />
                  ))
                )}
              </div>
              <div>
                <KeyValue
                  label={tr("dashboard.projects.scope.value")}
                  value={interpolate(tr("dashboard.projects.scope.valueDetail"), {
                    amount: formatOrderMoney(accepted.totalClientCents, accepted.currency),
                    count: project.milestones.length,
                  })}
                />
                <KeyValue label={tr("dashboard.projects.scope.coordinatorFee")} value={formatOrderMoney(accepted.coordinatorFeeCents, accepted.currency)} />
                <KeyValue label={tr("dashboard.projects.scope.cancellation")} value={tr("dashboard.projects.scope.notRecorded")} dim />
                <KeyValue label={tr("dashboard.projects.scope.usageRights")} value={tr("dashboard.projects.scope.notRecorded")} dim />
              </div>
            </div>
            {accepted.notes ? <p className="m-0 whitespace-pre-line text-[13px] text-admin-ink">{accepted.notes}</p> : null}
          </div>
        </Card>
      ) : null}

      {proposed ? (
        <Card>
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[14px] font-semibold text-admin-ink">
                {interpolate(tr("dashboard.projects.scope.proposedTitle"), {
                  n: proposed.version,
                  date: dayLabel(proposed.sentAt, project.timeZone, locale, tr("dashboard.projects.scope.notSent")),
                })}
              </span>
              <Pill tone="coral">
                {proposed.status === "draft" ? tr("dashboard.projects.scope.draft") : tr("dashboard.projects.scope.awaitingAcceptance")}
              </Pill>
            </div>
            <p className="m-0 text-[13px] text-admin-ink-muted">
              {interpolate(tr("dashboard.projects.scope.proposedBody"), {
                from: kept ? formatOrderMoney(kept.totalClientCents, kept.currency) : "—",
                to: formatOrderMoney(proposed.totalClientCents, proposed.currency),
                n: kept?.version ?? 0,
              })}
              {proposed.notes ? ` ${proposed.notes}` : ""}
            </p>
            {proposed.status === "draft" ? (
              <AmendmentActions
                inquiryId={project.inquiryId}
                offerId={proposed.id}
                expectedVersion={proposed.version}
                inquiryExpectedVersion={project.inquiryVersion}
                copy={{
                  send: interpolate(tr("dashboard.projects.scope.sendVersion"), { n: proposed.version }),
                  discard: tr("dashboard.projects.scope.discardProposal"),
                  noLock: tr("dashboard.projects.scope.refusalNoLock"),
                  engine: schedulingEngineSentences(tr),
                }}
              />
            ) : (
              <div className="flex items-center gap-2">
                <button type="button" disabled title={tr("dashboard.projects.bannerRequestUnavailable")} className={`${BTN_SECONDARY} ${BTN_ROW}`}>
                  {tr("dashboard.projects.scope.remind")}
                </button>
                {conversation ? (
                  <Link href={conversation} className={`${BTN_SECONDARY} ${BTN_ROW}`}>
                    {tr("dashboard.projects.scope.withdrawOnConversation")}
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {!accepted && !proposed ? (
        <Card>
          <div className="p-4">
            <span className="text-[14px] font-semibold text-admin-ink">{versionLabel(ordered[0]!, tr)}</span>
            <p className="m-0 mt-1 text-[13px] text-admin-ink-muted">{formatOrderMoney(ordered[0]!.totalClientCents, ordered[0]!.currency)}</p>
          </div>
        </Card>
      ) : null}

      {prior.length > 0 ? (
        <p className="m-0 text-[12px] text-admin-ink-muted">
          {prior
            .map((a) =>
              interpolate(tr("dashboard.projects.scope.priorKept"), {
                n: a.version,
                date: dayLabel(a.sentAt, project.timeZone, locale, noDate),
                amount: formatOrderMoney(a.totalClientCents, a.currency),
              }),
            )
            .join(" ")}
        </p>
      ) : (
        <p className="m-0 text-[12px] text-admin-ink-muted">{tr("dashboard.projects.scope.historyNone")}</p>
      )}
      {!verdict.ok ? <Notice>{amendmentRefusal(verdict, tr)}</Notice> : null}
    </>
  );
}

function amendmentRefusal(verdict: ReturnType<typeof amendmentVerdict>, tr: Tr): string {
  if (verdict.ok) return "";
  return verdict.reason === "nothing_to_amend"
    ? tr("dashboard.projects.scope.refusalNothingToAmend")
    : verdict.reason === "version_already_live"
      ? tr("dashboard.projects.scope.refusalVersionLive")
      : tr("dashboard.projects.scope.refusalClosed");
}

// ── W49 Money ────────────────────────────────────────────────────────

export function MoneyTab({
  project,
  tenantSlug,
  tr,
}: {
  project: ProjectRecord;
  tenantSlug: string;
  tr: Tr;
}) {
  const money = projectMoney(project);
  const accepted = acceptedAgreement(project);
  const remaining = remainingCents(money);
  const paidOne = project.balances.find((b) => b.collectedCents > 0) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-2.5">
        <SectionTitle>{tr("dashboard.projects.money.clientMoney")}</SectionTitle>
        <Card>
          {project.balances.length === 0 ? (
            <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted">{tr("dashboard.projects.money.noOrders")}</p>
          ) : (
            project.balances.map((b) => {
              const owed = balanceOwedCents(b);
              return (
                <ListRow key={b.orderId} cols="grid-cols-[1fr_90px_150px]" className="border-t">
                  <span>
                    <Link href={`/${tenantSlug}/admin/orders?q=${shortId(b.orderId)}`} className="text-admin-ink no-underline hover:underline">
                      {interpolate(tr("dashboard.projects.money.recordLabel"), { id: shortId(b.orderId) })}
                    </Link>
                    <span className="block text-[12px] text-admin-ink-muted">
                      {orderStatusLabel(b.status, tr)}
                      {b.collectedCents > 0 ? ` · ${tr("dashboard.projects.money.collected")} ${formatOrderMoney(b.collectedCents, b.currency)}` : ""}
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold tracking-[-0.02em] tabular-nums">{formatOrderMoney(b.totalCents, b.currency)}</span>
                  <span>
                    {owed > 0 ? (
                      <Pill tone="coral">{`${tr("dashboard.projects.money.owedPill")} ${formatOrderMoney(owed, b.currency)}`}</Pill>
                    ) : b.status === "paid" || b.status === "fulfilled" ? (
                      <Pill tone="green">{orderStatusLabel(b.status, tr)}</Pill>
                    ) : (
                      <Pill tone="slate">{orderStatusLabel(b.status, tr)}</Pill>
                    )}
                  </span>
                </ListRow>
              );
            })
          )}
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bank transfer and a sent link have no writer on an order (D-POS-27). */}
          <button type="button" disabled title={tr("dashboard.projects.money.transferUnavailable")} className={BTN_SECONDARY}>
            {tr("dashboard.projects.money.recordTransfer")}
          </button>
          <button type="button" disabled title={tr("dashboard.projects.money.linkUnavailable")} className={BTN_SECONDARY}>
            {tr("dashboard.projects.money.sendLink")}
          </button>
          {paidOne ? (
            <Link href={`/${tenantSlug}/admin/orders?q=${shortId(paidOne.orderId)}`} className={BTN_SECONDARY}>
              {tr("dashboard.projects.money.refund")}
            </Link>
          ) : (
            <button type="button" disabled title={tr("dashboard.projects.money.refundNothing")} className={BTN_SECONDARY}>
              {tr("dashboard.projects.money.refund")}
            </button>
          )}
          {money.dueCents > 0 ? (
            <Link href={`/${tenantSlug}/admin/pos?mode=projects&view=collect&project=${project.id}`} className={BTN_PRIMARY}>
              {tr("dashboard.projects.action.collect_balance")} · {formatOrderMoney(money.dueCents, money.currency)}
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <SectionTitle>{tr("dashboard.projects.money.allocation")}</SectionTitle>
        <Card>
          <div className="px-4 py-3 text-[13px]">
            <KeyValue label={tr("dashboard.projects.money.collected")} value={formatOrderMoney(money.collectedCents, money.currency)} />
            <KeyValue label={tr("dashboard.projects.money.allocated")} value={tr("dashboard.projects.money.allocatedPerRecord")} />
            <KeyValue label={tr("dashboard.projects.money.unapplied")} value={formatOrderMoney(0, money.currency)} />
            <KeyValue label={tr("dashboard.projects.money.refunded")} value={tr("dashboard.projects.money.refundedNotRead")} dim />
            <KeyValue
              label={accepted ? interpolate(tr("dashboard.projects.money.remainingUnder"), { n: accepted.version }) : tr("dashboard.projects.kpiRemaining")}
              value={remaining === null ? tr("dashboard.projects.openEnded") : formatOrderMoney(remaining, money.currency)}
              dim={remaining === null}
            />
          </div>
        </Card>
        <SectionTitle>{tr("dashboard.projects.money.talentFees")}</SectionTitle>
        <Card>
          <div className="px-4 py-3 text-[13px]">
            {project.assignments.length === 0 ? (
              <p className="m-0 text-admin-ink-muted">{tr("dashboard.projects.money.payableNotRecorded")}</p>
            ) : (
              project.assignments.map((a) => (
                <KeyValue
                  key={a.id}
                  label={interpolate(tr("dashboard.projects.money.feeRow"), { name: a.name || tr("dashboard.projects.team.unnamed") })}
                  value={`— / ${formatOrderMoney(a.talentCostCents, a.currency)} / —`}
                />
              ))
            )}
            <p className="m-0 mt-1.5 text-[11.5px] text-admin-ink-muted">{tr("dashboard.projects.money.feesNote")}</p>
          </div>
        </Card>
        <p className="m-0 text-[11.5px] text-admin-ink-muted">
          {interpolate(tr("dashboard.projects.timezoneNote"), { zone: project.timeZone })}
        </p>
      </div>
    </div>
  );
}

// ── W51 Who sees what ────────────────────────────────────────────────

/** Literal keys, one per cell, so `message-key-usage.static.test` sees each. */
const VISIBILITY_ROWS: readonly { item: string; staff: string; talent: string; client: string }[] = [
  {
    item: "dashboard.projects.visibility.rows.scope.item",
    staff: "dashboard.projects.visibility.rows.scope.staff",
    talent: "dashboard.projects.visibility.rows.scope.talent",
    client: "dashboard.projects.visibility.rows.scope.client",
  },
  {
    item: "dashboard.projects.visibility.rows.milestones.item",
    staff: "dashboard.projects.visibility.rows.milestones.staff",
    talent: "dashboard.projects.visibility.rows.milestones.talent",
    client: "dashboard.projects.visibility.rows.milestones.client",
  },
  {
    item: "dashboard.projects.visibility.rows.clientMoney.item",
    staff: "dashboard.projects.visibility.rows.clientMoney.staff",
    talent: "dashboard.projects.visibility.rows.clientMoney.talent",
    client: "dashboard.projects.visibility.rows.clientMoney.client",
  },
  {
    item: "dashboard.projects.visibility.rows.talentFees.item",
    staff: "dashboard.projects.visibility.rows.talentFees.staff",
    talent: "dashboard.projects.visibility.rows.talentFees.talent",
    client: "dashboard.projects.visibility.rows.talentFees.client",
  },
  {
    item: "dashboard.projects.visibility.rows.deliverables.item",
    staff: "dashboard.projects.visibility.rows.deliverables.staff",
    talent: "dashboard.projects.visibility.rows.deliverables.talent",
    client: "dashboard.projects.visibility.rows.deliverables.client",
  },
  {
    item: "dashboard.projects.visibility.rows.messages.item",
    staff: "dashboard.projects.visibility.rows.messages.staff",
    talent: "dashboard.projects.visibility.rows.messages.talent",
    client: "dashboard.projects.visibility.rows.messages.client",
  },
  {
    item: "dashboard.projects.visibility.rows.files.item",
    staff: "dashboard.projects.visibility.rows.files.staff",
    talent: "dashboard.projects.visibility.rows.files.talent",
    client: "dashboard.projects.visibility.rows.files.client",
  },
  {
    item: "dashboard.projects.visibility.rows.othersFees.item",
    staff: "dashboard.projects.visibility.rows.othersFees.staff",
    talent: "dashboard.projects.visibility.rows.othersFees.talent",
    client: "dashboard.projects.visibility.rows.othersFees.client",
  },
];

export function VisibilityTab({ tr }: { tr: Tr }) {
  const never = tr("dashboard.projects.visibility.never");
  const none = tr("dashboard.projects.visibility.noAccess");
  const cell = (value: string) => (
    <span className={value === none || value === never ? "text-admin-ink-dim" : "text-admin-ink-muted"}>{value}</span>
  );
  return (
    <>
      <SectionTitle>{tr("dashboard.projects.visibility.title")}</SectionTitle>
      <Card>
        <ListHead cols="grid-cols-[1.4fr_1fr_1fr_1fr]">
          <span>{tr("dashboard.projects.visibility.colItem")}</span>
          <span>{tr("dashboard.projects.visibility.audienceStaff")}</span>
          <span>{tr("dashboard.projects.visibility.audienceProfessional")}</span>
          <span>{tr("dashboard.projects.visibility.audienceClient")}</span>
        </ListHead>
        {VISIBILITY_ROWS.map((row) => (
          <ListRow key={row.item} cols="grid-cols-[1.4fr_1fr_1fr_1fr]" className="border-t">
            <span className="font-semibold">{tr(row.item)}</span>
            {cell(tr(row.staff))}
            {cell(tr(row.talent))}
            {cell(tr(row.client))}
          </ListRow>
        ))}
      </Card>
      <p className="m-0 text-[12px] text-admin-ink-muted">{tr("dashboard.projects.visibility.note")}</p>
    </>
  );
}
