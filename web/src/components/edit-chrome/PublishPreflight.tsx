"use client";

/**
 * Phase 10 — preflight panel mounted in the Publish drawer.
 *
 * Loads heading + alt-text + featured-roster + CTA checks via
 * `runPublishPreflight` and surfaces them as a checklist. Error-severity
 * issues are surfaced back to the Publish drawer so it can block publish.
 */

import { useEffect, useRef, useState } from "react";

import {
  runPublishPreflight,
  type PreflightIssue,
} from "@/lib/site-admin/edit-mode/publish-preflight-action";
import { safeAction } from "@/lib/site-admin/edit-mode/safe-action";
import { useEditContext } from "./edit-context";
import { locateCanvasNode } from "./freeform-layer-row";
import { DrawerSkeleton } from "./kit";
import { useEditorLocale } from "./use-editor-locale";

/** W1-L2 — hard ceiling for the preflight action. A hung server action used to
 *  leave the drawer as a skeleton forever AND "Publish now" disabled with
 *  "Running publish checks…" as its reason; now it resolves to a visible
 *  failure with a Retry button. */
const PREFLIGHT_TIMEOUT_MS = 30_000;

/** English labels; render sites pass these through t() so ES resolves. */
const CATEGORY_LABEL: Record<PreflightIssue["category"], string> = {
  headings: "Headings",
  alt_text: "Alt text",
  image_size: "Image size",
  aria: "Accessibility",
  cta: "CTA links",
  builder_payload: "Page structure",
  featured_talent: "Featured roster",
  data_binding: "Live content",
  link_integrity: "Link checks",
  seo: "SEO",
  layout: "Layout",
  mobile_overflow: "Mobile overflow",
  performance: "Performance",
};

/** One rendered row: a finding plus every place it occurs. */
interface GroupedIssue {
  key: string;
  issue: PreflightIssue;
  count: number;
  nodeIds: string[];
  sectionIds: string[];
}

interface Props {
  /** Only run checks while the publish drawer is visible. */
  enabled?: boolean;
  /** Bumps when the publish drawer opens — re-fetches issues each time. */
  refreshKey: number;
  locale?: string;
  /** Non-homepage CMS page being edited — scopes builder preflight to `published_page_snapshot`. */
  pageId?: string | null;
  surfaceKind?: string | null;
  builderTree?: unknown;
  onStatusChange?: (status: {
    loading: boolean;
    blockingErrors: number;
    /**
     * W3-M1 — the subset of `blockingErrors` that are mobile horizontal
     * overflow, so the drawer can give the exact "Fix N mobile overflow
     * issue(s) to publish" disabled reason rather than a generic count.
     */
    mobileOverflowErrors: number;
  }) => void;
  onFocusSection?: (sectionId: string) => void;
}

export function PublishPreflight({
  enabled = true,
  refreshKey,
  locale,
  pageId,
  surfaceKind,
  builderTree,
  onStatusChange,
  onFocusSection,
}: Props) {
  const { t } = useEditorLocale();
  const { reportMutationError } = useEditContext();
  // Held in a ref and kept OUT of the checks effect's dep list. When it was a
  // dep, any change to its identity re-ran the effect; the previous run's
  // `cancelled` guard then returned WITHOUT emitting `loading:false`, so the
  // parent's optimistic `preflightLoading = true` never cleared and Publish sat
  // on "Running publish checks…" forever. See the watchdog in publish-drawer.
  const reportMutationErrorRef = useRef(reportMutationError);
  useEffect(() => {
    reportMutationErrorRef.current = reportMutationError;
  }, [reportMutationError]);
  const [issues, setIssues] = useState<ReadonlyArray<PreflightIssue> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // W1-L2 — Retry re-runs the checks after a failure/timeout without closing
  // and reopening the drawer.
  const [retryNonce, setRetryNonce] = useState(0);
  // W1-L2 — visible elapsed-seconds ticker while the checks run, so a slow
  // action reads as "still working on it", never as a dead skeleton.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setLoading(false);
      setError(null);
      onStatusChange?.({ loading: false, blockingErrors: 0, mobileOverflowErrors: 0 });
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    onStatusChange?.({ loading: true, blockingErrors: 0, mobileOverflowErrors: 0 });
    void (async () => {
      // W1-L2 — safeAction adds the hard timeout; a hung/dead action resolves
      // to the fallback instead of leaving the skeleton (and the disabled
      // Publish button) stuck forever.
      const result = await safeAction(
        () =>
          runPublishPreflight({
            locale,
            pageId,
            surfaceKind,
            builderTree,
          }),
        {
        name: "runPublishPreflight",
        timeoutMs: PREFLIGHT_TIMEOUT_MS,
        fallback: {
          ok: false as const,
          error: t("Publish checks timed out. The draft is safe; retry the checks."),
        },
      });
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setIssues(result.issues);
        const blockingErrors = result.issues.filter(
          (issue) => issue.severity === "error",
        ).length;
        const mobileOverflowErrors = result.issues.filter(
          (issue) =>
            issue.severity === "error" && issue.category === "mobile_overflow",
        ).length;
        onStatusChange?.({ loading: false, blockingErrors, mobileOverflowErrors });
      } else {
        setError(result.error ?? t("Publish checks could not load."));
        reportMutationErrorRef.current(
          result.error ?? t("Publish checks could not load. Try again."),
        );
        onStatusChange?.({ loading: false, blockingErrors: 0, mobileOverflowErrors: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    refreshKey,
    retryNonce,
    locale,
    pageId,
    surfaceKind,
    builderTree,
    onStatusChange,
    t,
  ]);

  // Tick the elapsed counter once a second while loading.
  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [loading]);

  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-label={t("Running publish checks")}>
        <DrawerSkeleton rows={3} />
        <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"
          />
          {t("Running publish checks…")}
          {elapsedSeconds >= 3 ? ` ${elapsedSeconds}s` : null}
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-300"
      >
        <p className="m-0">
          {t("Publish checks could not load: {error}").replace("{error}", error)}
        </p>
        <button
          type="button"
          onClick={() => setRetryNonce((n) => n + 1)}
          className="mt-1.5 inline-flex cursor-pointer items-center rounded border border-blue-500/60 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-blue-800 hover:bg-white dark:bg-transparent dark:text-blue-200"
        >
          {t("Retry checks")}
        </button>
      </div>
    );
  }
  if (!issues || issues.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300"
      >
        {t("✓ All publish checks passed.")}
      </div>
    );
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;
  const ordered = [...issues].sort((a, b) => {
    if (a.severity === b.severity) {
      return a.category.localeCompare(b.category);
    }
    return a.severity === "error" ? -1 : 1;
  });
  /**
   * Collapse findings that say the SAME thing into one row.
   *
   * The layout linter runs per node, so a page with four un-stacked rows
   * produced four identical sentences, and the drawer read as "9 warnings"
   * when it was really three problems. Grouping keys on the rendered text
   * (category + severity + message), and every grouped node keeps its own
   * locate target so "show me the 4th one" is still one click.
   */
  const groupIssues = (list: PreflightIssue[]): GroupedIssue[] => {
    const groups: GroupedIssue[] = [];
    for (const issue of list) {
      const key = `${issue.category}::${issue.severity}::${issue.message}`;
      const existing = groups.find((g) => g.key === key);
      if (existing) {
        existing.count += 1;
        if (issue.nodeId) existing.nodeIds.push(issue.nodeId);
        else if (issue.sectionId) existing.sectionIds.push(issue.sectionId);
        continue;
      }
      groups.push({
        key,
        issue,
        count: 1,
        nodeIds: issue.nodeId ? [issue.nodeId] : [],
        sectionIds: issue.nodeId ? [] : issue.sectionId ? [issue.sectionId] : [],
      });
    }
    return groups;
  };

  const blockingIssues = ordered.filter((i) => i.severity === "error");
  const warningIssues = ordered.filter((i) => i.severity === "warn");
  const blockingGroups = groupIssues(blockingIssues);
  const warningGroups = groupIssues(warningIssues);
  const blockingCategorySummary = blockingIssues.reduce<
    Array<{ category: PreflightIssue["category"]; count: number }>
  >((acc, issue) => {
    const existing = acc.find((entry) => entry.category === issue.category);
    if (existing) {
      existing.count += 1;
      return acc;
    }
    acc.push({ category: issue.category, count: 1 });
    return acc;
  }, []);
  const firstFocusableBlockingSectionId =
    onFocusSection
      ? blockingIssues.find((issue) => typeof issue.sectionId === "string")
          ?.sectionId ?? null
      : null;

  const renderIssue = (group: GroupedIssue, index: number) => {
    const { issue, count, nodeIds, sectionIds } = group;
    return (
    <li
      key={`${group.key}:${index}`}
      className="flex items-start gap-2"
    >
      <span
        aria-hidden
        className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
          issue.severity === "error" ? "bg-rose-500" : "bg-blue-500"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>{t(CATEGORY_LABEL[issue.category])}</span>
          {issue.severity === "error" ? (
            <span className="rounded border border-rose-300/80 bg-rose-100/60 px-1 py-0 text-[9px] font-semibold leading-[1.2] text-rose-700">
              {t("Blocker")}
            </span>
          ) : (
            <span className="rounded border border-blue-300/80 bg-blue-100/50 px-1 py-0 text-[9px] font-semibold leading-[1.2] text-blue-800 dark:text-blue-200">
              {t("Advisory")}
            </span>
          )}
          {count > 1 ? (
            <span className="rounded border border-border/80 bg-background px-1 py-0 text-[9px] font-semibold leading-[1.2] text-foreground">
              {t("{count} blocks").replace("{count}", String(count))}
            </span>
          ) : null}
        </div>
        <p className="leading-snug">{issue.message}</p>
        {nodeIds.length > 0 ? (
          // W3-M1 — node-level locate: points at the exact offending block
          // (scroll + flash) via the W1-L4 plumbing. When a group covers
          // several blocks each gets its own numbered chip, so a grouped row
          // never costs the operator the ability to reach any single one.
          <div className="mt-1 flex flex-wrap gap-1">
            {nodeIds.map((nodeId, i) => (
              <button
                key={nodeId}
                type="button"
                onClick={() => locateCanvasNode(nodeId)}
                className="inline-flex cursor-pointer items-center rounded border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground hover:bg-muted"
              >
                {nodeIds.length > 1
                  ? `${t("Show on canvas")} ${i + 1}`
                  : t("Show on canvas")}
              </button>
            ))}
          </div>
        ) : sectionIds.length > 0 && onFocusSection ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {sectionIds.map((sectionId, i) => (
              <button
                key={sectionId}
                type="button"
                onClick={() => onFocusSection(sectionId)}
                className="inline-flex cursor-pointer items-center rounded border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground hover:bg-muted"
              >
                {sectionIds.length > 1
                  ? `${t("Show on canvas")} ${i + 1}`
                  : t("Show on canvas")}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </li>
    );
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {errors > 0
          ? (errors === 1
              ? t("Publish checks: {errors} blocking issue, {warns} advisory warnings.")
              : t("Publish checks: {errors} blocking issues, {warns} advisory warnings.")
            )
              .replace("{errors}", String(errors))
              .replace("{warns}", String(warns))
          : warns > 0
            ? (warns === 1
                ? t("Publish checks: no blockers, {warns} advisory warning.")
                : t("Publish checks: no blockers, {warns} advisory warnings.")
              ).replace("{warns}", String(warns))
            : t("Publish checks: no issues found.")}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Publish checks")}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {errors > 0
            ? (errors === 1 ? t("{count} blocker · ") : t("{count} blockers · ")).replace(
                "{count}",
                String(errors),
              )
            : ""}
          {(warns === 1 ? t("{count} advisory") : t("{count} advisories")).replace(
            "{count}",
            String(warns),
          )}
        </span>
      </div>
      <p className="m-0 text-[11px] leading-snug text-muted-foreground">
        <strong className="font-semibold text-foreground">{t("Blockers")}</strong>{" "}
        {t("disable")}{" "}
        <span className="font-medium text-foreground">{t("Publish now")}</span>{" "}
        {t("until fixed.")}{" "}
        <strong className="font-semibold text-foreground">{t("Advisory items")}</strong>{" "}
        {t("are non-blocking, review them, then publish if you accept the risk.")}
      </p>
      {blockingIssues.length > 0 ? (
        <div className="rounded-md border border-rose-300/70 bg-rose-50/50 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
              {t("Publish blockers ({count})").replace(
                "{count}",
                String(blockingIssues.length),
              )}
            </span>
            {firstFocusableBlockingSectionId ? (
              <button
                type="button"
                onClick={() => onFocusSection?.(firstFocusableBlockingSectionId)}
                className="inline-flex cursor-pointer items-center rounded border border-rose-300/80 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50"
              >
                {t("Go to first blocker")}
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-1.5 text-rose-950">
            {blockingGroups.map((group, index) => renderIssue(group, index))}
          </ul>
          {blockingCategorySummary.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {blockingCategorySummary.map((entry) => (
                <span
                  key={entry.category}
                  className="inline-flex items-center rounded border border-rose-300/70 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                  title={(entry.count === 1
                    ? t("{count} blocker in {category}")
                    : t("{count} blockers in {category}")
                  )
                    .replace("{count}", String(entry.count))
                    .replace("{category}", t(CATEGORY_LABEL[entry.category]))}
                >
                  {t(CATEGORY_LABEL[entry.category])} · {entry.count}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {warningIssues.length > 0 ? (
        <div className="rounded-md border border-blue-300/70 bg-blue-50/40 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
            {t("Advisory, non-blocking ({count})").replace(
              "{count}",
              String(warningIssues.length),
            )}
          </div>
          <ul className="flex flex-col gap-1.5 text-stone-800">
            {warningGroups.map((group, index) =>
              renderIssue(group, blockingGroups.length + index),
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
