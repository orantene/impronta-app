"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StateBadges } from "@/app/(dashboard)/talent/talent-state-badges";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { WorkspaceStickyShell } from "@/components/dashboard/workspace-sticky-shell";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TALENT_WORKFLOW_STEP_LABELS } from "@/lib/talent-workflow-steps";
import {
  TALENT_MEDIA_SAVED,
  TALENT_PROFILE_SAVED,
  TALENT_WORKSPACE_STATE,
  TALENT_WORKSPACE_TOAST,
  type TalentWorkspaceStateDetail,
  type TalentWorkspaceToastDetail,
} from "@/lib/talent-workspace-events";
import { cn } from "@/lib/utils";

function CompletionRing({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div
      className="relative flex size-[3.25rem] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[var(--impronta-gold)]/[0.06] to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] ring-1 ring-[var(--impronta-gold)]/15 dark:shadow-none dark:ring-[var(--impronta-gold)]/20"
      role="img"
      aria-label={`Profile completion ${pct} percent`}
    >
      <svg className="size-[2.875rem] -rotate-90" viewBox="0 0 52 52" aria-hidden>
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-muted/20"
        />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-[var(--impronta-gold)] transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute font-display text-[11px] font-semibold tabular-nums tracking-tight text-foreground">
        {pct}
      </span>
    </div>
  );
}

/** Compact pipeline — full labels live in tooltips + optional popover. */
function WorkflowPipeline({
  workflowStatus,
  stepIndex,
}: {
  workflowStatus: string;
  stepIndex: number;
}) {
  if (workflowStatus === "archived") {
    return (
      <p className="text-xs text-muted-foreground">
        Profile archived — contact the agency to restore.
      </p>
    );
  }

  const currentLabel = TALENT_WORKFLOW_STEP_LABELS[stepIndex] ?? "Draft";

  return (
    <TooltipProvider delayDuration={180}>
      <div
        className="flex flex-wrap items-center gap-2.5"
        role="status"
        aria-label={`Review pipeline: ${currentLabel}, stage ${stepIndex + 1} of ${TALENT_WORKFLOW_STEP_LABELS.length}`}
      >
        <div className="flex items-center gap-1">
          {TALENT_WORKFLOW_STEP_LABELS.map((label, i) => {
            const done = stepIndex > i;
            const current = stepIndex === i;
            return (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "size-2 rounded-full transition-colors",
                      done && "bg-emerald-600/80 dark:bg-emerald-400/80",
                      current &&
                        "ring-2 ring-[var(--impronta-gold)]/60 ring-offset-1 ring-offset-background bg-[var(--impronta-gold)]/50",
                      !done && !current && "bg-muted-foreground/25",
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px]">
                  <span className="font-medium">{label}</span>
                  {current ? <span className="block text-muted-foreground">Current stage</span> : null}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <span className="text-[11px] text-muted-foreground">
          <span className="sr-only">Current stage: </span>
          {currentLabel}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Info className="size-3.5" aria-hidden />
              Stages
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[280px] space-y-2">
            <p className="text-sm font-medium text-foreground">Agency review stages</p>
            <ol className="space-y-1.5 text-sm text-muted-foreground">
              {TALENT_WORKFLOW_STEP_LABELS.map((label, i) => (
                <li key={label} className="flex gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground/70">{i + 1}.</span>
                  <span className={cn(i === stepIndex && "font-medium text-foreground")}>{label}</span>
                </li>
              ))}
            </ol>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}

export type TalentWorkspaceSummary = {
  profileCode: string;
  completionScore: number;
  workflowStatus: string;
  workflowStepIndex: number;
  submissionThreshold: number;
  visibility: string;
  livePageAvailable: boolean;
  previewHref: string;
  canSubmit: boolean;
  missingCount: number;
};

export function TalentWorkspaceShell({
  summary,
  children,
}: {
  summary: TalentWorkspaceSummary;
  children: React.ReactNode;
}) {
  const [saveState, setSaveState] = useState({
    profileDirty: false,
    profileSaving: false,
    mediaSaving: false,
    workflowSaving: false,
  });
  const [flashSaved, setFlashSaved] = useState(false);
  const [toast, setToast] = useState<TalentWorkspaceToastDetail | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<TalentWorkspaceStateDetail>).detail;
      if (!d) return;
      setSaveState((prev) => ({
        profileDirty:
          d.profileDirty !== undefined ? d.profileDirty : prev.profileDirty,
        profileSaving:
          d.profileSaving !== undefined ? d.profileSaving : prev.profileSaving,
        mediaSaving: d.mediaSaving !== undefined ? d.mediaSaving : prev.mediaSaving,
        workflowSaving:
          d.workflowSaving !== undefined ? d.workflowSaving : prev.workflowSaving,
      }));
    };

    const flashSavedHandler = () => {
      setFlashSaved(true);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashSaved(false), 3200);
    };

    const onProfileSaved = () => {
      setSaveState((s) => ({ ...s, profileDirty: false, profileSaving: false }));
      flashSavedHandler();
    };

    const onToast = (e: Event) => {
      const d = (e as CustomEvent<TalentWorkspaceToastDetail>).detail;
      if (!d?.message) return;
      setToast(d);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 4200);
    };

    document.addEventListener(TALENT_WORKSPACE_STATE, onState);
    document.addEventListener(TALENT_PROFILE_SAVED, onProfileSaved);
    document.addEventListener(TALENT_MEDIA_SAVED, flashSavedHandler);
    document.addEventListener(TALENT_WORKSPACE_TOAST, onToast);
    return () => {
      document.removeEventListener(TALENT_WORKSPACE_STATE, onState);
      document.removeEventListener(TALENT_PROFILE_SAVED, onProfileSaved);
      document.removeEventListener(TALENT_MEDIA_SAVED, flashSavedHandler);
      document.removeEventListener(TALENT_WORKSPACE_TOAST, onToast);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const savingAny =
    saveState.profileSaving || saveState.mediaSaving || saveState.workflowSaving;

  let saveLabel: string | null = null;
  let saveLabelClass = "text-muted-foreground";
  if (savingAny) {
    saveLabel = "Saving…";
    saveLabelClass = "text-[var(--impronta-gold)]";
  } else if (flashSaved) {
    saveLabel = "Saved";
    saveLabelClass = "text-emerald-600 dark:text-emerald-400";
  } else if (saveState.profileDirty) {
    saveLabel = "Unsaved changes";
    saveLabelClass = "text-amber-700 dark:text-amber-300";
  }

  const primaryHref = summary.canSubmit ? "/talent/status" : "/talent/my-profile";
  const primaryLabel = summary.canSubmit ? "Submit for review" : "Continue editing";

  const needsAttention =
    summary.missingCount > 0 || summary.completionScore < summary.submissionThreshold;

  return (
    <div className="space-y-6">
      <WorkspaceStickyShell>
        <div
          className={cn(
            "rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-[var(--impronta-gold)]/[0.04] px-4 py-4 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.18)] sm:px-6 sm:py-5",
            "dark:shadow-[0_24px_56px_-28px_rgba(0,0,0,0.55)] dark:to-[var(--impronta-gold)]/[0.06]",
            "ring-1 ring-[var(--impronta-gold)]/[0.07]",
          )}
        >
          <DashboardPageHeader
            eyebrow="Talent"
            title={
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                <CompletionRing value={summary.completionScore} />
                <span>Talent workspace</span>
                <span className="font-mono text-[10px] font-normal text-muted-foreground sm:text-xs">
                  {summary.profileCode}
                </span>
                {saveLabel ? (
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums transition-colors duration-200",
                      saveLabelClass,
                    )}
                    aria-live="polite"
                  >
                    {saveLabel}
                  </span>
                ) : null}
              </span>
            }
            description={
              needsAttention ? (
                <span className="text-sm text-muted-foreground">
                  {summary.missingCount > 0 ? (
                    <>
                      <span className="font-medium text-foreground">{summary.missingCount}</span>{" "}
                      checklist item{summary.missingCount === 1 ? "" : "s"} left
                    </>
                  ) : null}
                  {summary.missingCount > 0 && summary.completionScore < summary.submissionThreshold ? (
                    <span className="text-muted-foreground/70"> · </span>
                  ) : null}
                  {summary.completionScore < summary.submissionThreshold ? (
                    <>Submit unlocks at {summary.submissionThreshold}%</>
                  ) : null}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Profile checklist complete.</span>
              )
            }
            below={
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <StateBadges
                    workflow_status={summary.workflowStatus}
                    visibility={summary.visibility}
                    showWorkflow={false}
                  />
                  <span className="hidden h-4 w-px bg-border/70 sm:block" aria-hidden />
                  <WorkflowPipeline
                    workflowStatus={summary.workflowStatus}
                    stepIndex={summary.workflowStepIndex}
                  />
                </div>
              </div>
            }
            right={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9 rounded-xl border-border/55 bg-background/80 shadow-sm backdrop-blur-sm hover:border-[var(--impronta-gold)]/35"
                    asChild
                  >
                    <Link
                      href={summary.previewHref}
                      target="_blank"
                      rel="noreferrer"
                      scroll={false}
                    >
                      {summary.livePageAvailable ? "Live page" : "Preview"}
                    </Link>
                  </Button>
                  <Button size="sm" className="min-h-9 rounded-xl shadow-md" asChild>
                    <Link href={primaryHref} scroll={false}>
                      {primaryLabel}
                    </Link>
                  </Button>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 self-end px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Info className="size-3.5" aria-hidden />
                      About preview
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[min(320px,calc(100vw-2rem))] text-sm text-muted-foreground">
                    {summary.livePageAvailable
                      ? "Live uses the same URL visitors see in the directory."
                      : "Preview shows your public profile draft. The URL includes ?preview=1 so only you can open it while unpublished."}
                  </PopoverContent>
                </Popover>
              </div>
            }
          />
        </div>

        {toast ? (
          <div
            className={cn(
              "mt-3 rounded-lg border px-3 py-2 text-sm",
              toast.variant === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                : toast.variant === "neutral"
                  ? "border-border/60 bg-muted/40 text-muted-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive-foreground",
            )}
            role="status"
          >
            {toast.message}
          </div>
        ) : null}
      </WorkspaceStickyShell>

      <div className="min-h-[12rem]">{children}</div>
    </div>
  );
}
