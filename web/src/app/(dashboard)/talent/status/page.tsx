import Link from "next/link";
import {
  RevisionForm,
  TalentSubmitForReviewForm,
} from "@/app/(dashboard)/talent/talent-forms";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { TalentDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import {
  TalentDashboardPage,
  TalentFlashBanner,
  TalentInlineProgress,
  TalentPageHeader,
  TalentSectionLabel,
} from "@/components/talent/talent-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { loadTalentDashboardData } from "@/lib/talent-dashboard-data";
import {
  TALENT_SUBMISSION_THRESHOLD,
  workflowGuidance,
} from "@/lib/talent-dashboard";
import { formatSubmissionKind } from "@/lib/talent-submission-service";
import { Activity, History, ListChecks, MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const sectionCardTalent =
  "border-border/40 bg-card/80 hover:border-[var(--impronta-gold)]/45 hover:shadow-md";

const titleTalent = "text-[15px] font-semibold tracking-tight";

const insetCallout =
  "rounded-2xl border border-border/40 bg-muted/20 px-3.5 py-3 text-sm lg:px-4";

const emptyState =
  "rounded-2xl border border-dashed border-border/50 bg-muted/10 px-3.5 py-6 text-center text-sm leading-relaxed text-muted-foreground";

export default async function TalentStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ revision?: string }>;
}) {
  const { revision } = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const ts = (key: string) => t(`dashboard.talentStatus.${key}`);

  const result = await loadTalentDashboardData();
  if (!result.ok) return <TalentDashboardLoadFallback reason={result.reason} />;

  const { data } = result;
  const {
    profile,
    canSubmit,
    revisions,
    completionScore,
    missingItems,
    submissionSnapshots,
    submissionHistory,
    workflowEvents,
    latestSubmission,
    latestTermsConsent,
    latestWorkflowEvent,
    talentTermsVersion,
  } = data;
  const statusAllowsSubmit = profile.workflow_status === "draft" || profile.workflow_status === "hidden";

  return (
    <TalentDashboardPage>
      <section className="space-y-4 lg:space-y-5">
        <div
          className={cn(
            "overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.07] via-card to-card",
            "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.5)]",
            "sm:rounded-2xl lg:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.28)]",
          )}
        >
          <div className="space-y-5 p-4 sm:p-5 lg:p-8">
            <TalentPageHeader
              icon={Activity}
              title={ts("pageTitle")}
              description={ts("pageDescription")}
              right={
                <Button
                  variant="outline"
                  asChild
                  className="h-11 w-full gap-2 rounded-2xl border-border/70 bg-background/70 px-4 text-[15px] font-medium backdrop-blur-sm sm:w-auto lg:h-12"
                >
                  <Link href="/talent/my-profile">{ts("profileChecklistCta")}</Link>
                </Button>
              }
            />
            <div className="border-t border-border/40 pt-5">
              <TalentInlineProgress
                label={ts("completionLabel")}
                value={completionScore}
                className="border-border/40 bg-background/55 shadow-none backdrop-blur-sm"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 space-y-5 lg:mt-6 lg:space-y-6">
        {revision === "sent" ? (
          <TalentFlashBanner variant="success">
            Revision note sent — the agency will follow up.
          </TalentFlashBanner>
        ) : null}

        <div className="space-y-2 lg:space-y-3">
          <TalentSectionLabel icon={Send}>Snapshot &amp; submit</TalentSectionLabel>
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Workflow snapshot"
              description="Current state and what we recommend next."
            >
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </p>
                  <p className="mt-1 text-lg font-semibold capitalize tracking-tight text-foreground">
                    {profile.workflow_status.replace(/_/g, " ")}
                  </p>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {workflowGuidance(profile.workflow_status, {
                      completionScore,
                      missingCount: missingItems.length,
                      threshold: TALENT_SUBMISSION_THRESHOLD,
                    })}
                  </p>
                </div>
                <div className={insetCallout}>
                  <p className="font-semibold text-foreground">Submission rules</p>
                  <ul className="mt-2 list-inside list-disc space-y-1.5 text-muted-foreground">
                    <li>
                      Reach {TALENT_SUBMISSION_THRESHOLD}% completion (see My Profile).
                    </li>
                    <li>Only draft or hidden profiles can be submitted for review.</li>
                    <li>Confirm readiness and accept the current terms version before submitting.</li>
                  </ul>
                </div>
                <div className={cn(insetCallout, "text-xs leading-relaxed text-muted-foreground")}>
                  <p>
                    Latest submission:{" "}
                    <span className="font-medium text-foreground">
                      {latestSubmission
                        ? new Date(latestSubmission.submitted_at).toLocaleString()
                        : "None yet"}
                    </span>
                  </p>
                  <p className="mt-2">
                    Latest accepted terms:{" "}
                    <span className="font-medium text-foreground">
                      {latestTermsConsent?.terms_version ?? "Not accepted yet"}
                    </span>
                  </p>
                  <p className="mt-2">
                    Current terms version:{" "}
                    <span className="font-medium text-foreground">{talentTermsVersion}</span>
                  </p>
                </div>
              </div>
            </DashboardSectionCard>

            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Submit for agency review"
              description='One-way handoff: after you confirm, status moves toward "Under review". You can still send revision notes later.'
            >
              {!statusAllowsSubmit ? (
                <p className="mb-4 rounded-2xl border border-border/40 bg-muted/25 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
                  Submission is unavailable while status is{" "}
                  <span className="font-semibold text-foreground">
                    {profile.workflow_status.replace(/_/g, " ")}
                  </span>
                  . The agency controls the workflow once submitted.
                </p>
              ) : null}
              <TalentSubmitForReviewForm
                canSubmit={canSubmit}
                threshold={TALENT_SUBMISSION_THRESHOLD}
                completionScore={completionScore}
                termsVersion={talentTermsVersion}
                latestAcceptedTermsVersion={latestTermsConsent?.terms_version ?? null}
                statusAllowsSubmit={statusAllowsSubmit}
              />
            </DashboardSectionCard>
          </div>
        </div>

        <div className="space-y-2 lg:space-y-3">
          <TalentSectionLabel icon={ListChecks}>At a glance</TalentSectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Latest submission"
              description="Most recent handoff to the agency."
            >
              <p className="text-sm font-medium text-foreground">
                {latestSubmission
                  ? new Date(latestSubmission.submitted_at).toLocaleString()
                  : "No submission yet"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {latestSubmission
                  ? `${formatSubmissionKind(latestSubmission.submission_kind)} · ${latestSubmission.workflow_state_before ?? "—"} to ${latestSubmission.workflow_state_after ?? "—"}`
                  : "Submit when your checklist and terms acceptance are complete."}
              </p>
            </DashboardSectionCard>
            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Terms acceptance"
              description="Stored with your latest submission."
            >
              <p className="text-sm font-medium text-foreground">
                {latestTermsConsent?.terms_version ?? "Not accepted yet"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {latestTermsConsent
                  ? `Accepted ${new Date(latestTermsConsent.accepted_at).toLocaleString()}`
                  : "Acceptance will be recorded when you submit for review."}
              </p>
            </DashboardSectionCard>
            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Latest agency update"
              description="Most recent workflow-side change."
            >
              <p className="text-sm font-medium text-foreground">
                {latestWorkflowEvent
                  ? new Date(latestWorkflowEvent.created_at).toLocaleString()
                  : "No agency update yet"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {latestWorkflowEvent
                  ? latestWorkflowEvent.event_type.replace(/_/g, " ")
                  : "Workflow changes will appear here once staff acts."}
              </p>
            </DashboardSectionCard>
          </div>
        </div>

        <div className="space-y-2 lg:space-y-3">
          <TalentSectionLabel icon={MessageSquare}>Agency coordination</TalentSectionLabel>
          <DashboardSectionCard
            className={sectionCardTalent}
            titleClassName={titleTalent}
            title="Notes & requests"
            description="Send a structured note when you need review, changes, or publication help."
          >
            <div className="space-y-6">
              <RevisionForm />
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                  Recent revisions
                </h3>
                {revisions.length === 0 ? (
                  <p className={cn(emptyState, "mt-3")}>None yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {revisions.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-2xl border border-border/40 bg-muted/15 px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                            {r.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </span>
                        </div>
                        {r.payload && typeof r.payload.note === "string" ? (
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {(r.payload.note as string).slice(0, 200)}
                            {(r.payload.note as string).length > 200 ? "…" : ""}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </DashboardSectionCard>
        </div>

        <div className="space-y-2 lg:space-y-3">
          <TalentSectionLabel icon={History}>Timeline</TalentSectionLabel>
          <div className="space-y-4 lg:space-y-5">
            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Submission history"
              description="Concise submission traceability for you and the agency."
            >
              {submissionHistory.length === 0 ? (
                <p className={emptyState}>No submissions recorded yet.</p>
              ) : (
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {submissionHistory.map((s) => {
                    const linkedSnapshot = submissionSnapshots.find(
                      (snapshot) => snapshot.id === s.submission_snapshot_id,
                    );
                    const snap = linkedSnapshot?.snapshot ?? {};
                    const taxonomy =
                      (snap.taxonomy as Record<string, unknown> | undefined) ?? undefined;
                    const termIds = Array.isArray(taxonomy?.term_ids)
                      ? (taxonomy?.term_ids as unknown[])
                      : [];
                    return (
                      <li
                        key={s.id}
                        className="rounded-2xl border border-border/40 bg-muted/15 px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                            {formatSubmissionKind(s.submission_kind)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(s.submitted_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs leading-relaxed">
                          <div>
                            <span className="text-muted-foreground">Workflow:</span>{" "}
                            <span className="text-foreground">
                              {s.workflow_state_before ?? "—"} to {s.workflow_state_after ?? "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Terms version:</span>{" "}
                            <span className="text-foreground">{s.accepted_terms_version ?? "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Snapshot terms count:</span>{" "}
                            <span className="text-foreground">{termIds.length}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DashboardSectionCard>

            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Agency decisions"
              description="An explicit timeline of workflow/visibility decisions made by the agency."
            >
              {workflowEvents.length === 0 ? (
                <p className={emptyState}>No agency decisions recorded yet.</p>
              ) : (
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {workflowEvents.map((e) => {
                    const from =
                      typeof e.payload.from === "string" ? (e.payload.from as string) : null;
                    const to = typeof e.payload.to === "string" ? (e.payload.to as string) : null;
                    const note =
                      typeof e.payload.note === "string" && e.payload.note.trim().length > 0
                        ? (e.payload.note as string).trim()
                        : null;
                    const label =
                      e.event_type === "workflow_status_changed"
                        ? "Workflow status"
                        : e.event_type === "visibility_changed"
                          ? "Visibility"
                          : e.event_type;
                    return (
                      <li
                        key={e.id}
                        className="rounded-2xl border border-border/40 bg-muted/15 px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                            {label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed">
                          <span className="text-muted-foreground">From:</span>{" "}
                          <span className="text-foreground">{from ?? "—"}</span>{" "}
                          <span className="text-muted-foreground">to</span>{" "}
                          <span className="text-foreground">{to ?? "—"}</span>
                        </p>
                        {note ? (
                          <p className="mt-2 text-xs leading-relaxed">
                            <span className="text-muted-foreground">Note:</span>{" "}
                            <span className="text-foreground">{note}</span>
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </DashboardSectionCard>
          </div>
        </div>
      </div>
    </TalentDashboardPage>
  );
}
