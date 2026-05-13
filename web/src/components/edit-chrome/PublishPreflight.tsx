"use client";

/**
 * Phase 10 — preflight panel mounted in the Publish drawer.
 *
 * Loads heading + alt-text + featured-roster + CTA checks via
 * `runPublishPreflight` and surfaces them as a checklist. Error-severity
 * issues are surfaced back to the Publish drawer so it can block publish.
 */

import { useEffect, useState } from "react";

import {
  runPublishPreflight,
  type PreflightIssue,
} from "@/lib/site-admin/edit-mode/publish-preflight-action";

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
  performance: "Performance",
};

interface Props {
  /** Only run checks while the publish drawer is visible. */
  enabled?: boolean;
  /** Bumps when the publish drawer opens — re-fetches issues each time. */
  refreshKey: number;
  locale?: string;
  /** Non-homepage CMS page being edited — scopes builder preflight to `published_page_snapshot`. */
  pageId?: string | null;
  onStatusChange?: (status: {
    loading: boolean;
    blockingErrors: number;
  }) => void;
  onFocusSection?: (sectionId: string) => void;
}

export function PublishPreflight({
  enabled = true,
  refreshKey,
  locale,
  pageId,
  onStatusChange,
  onFocusSection,
}: Props) {
  const [issues, setIssues] = useState<ReadonlyArray<PreflightIssue> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setLoading(false);
      setError(null);
      onStatusChange?.({ loading: false, blockingErrors: 0 });
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    onStatusChange?.({ loading: true, blockingErrors: 0 });
    void (async () => {
      const result = await runPublishPreflight({ locale });
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setIssues(result.issues);
        const blockingErrors = result.issues.filter(
          (issue) => issue.severity === "error",
        ).length;
        onStatusChange?.({ loading: false, blockingErrors });
      } else {
        setError(result.error);
        onStatusChange?.({ loading: false, blockingErrors: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey, locale, pageId, onStatusChange]);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground"
      >
        Running preflight…
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
      >
        Preflight: {error}
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
        ✓ Preflight clean — publish checks passed.
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
  const blockingIssues = ordered.filter((i) => i.severity === "error");
  const warningIssues = ordered.filter((i) => i.severity === "warn");
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

  const renderIssue = (issue: PreflightIssue, index: number) => (
    <li
      key={`${issue.category}:${issue.sectionId ?? "global"}:${issue.message}:${issue.severity}:${index}`}
      className="flex items-start gap-2"
    >
      <span
        aria-hidden
        className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
          issue.severity === "error" ? "bg-rose-500" : "bg-amber-500"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>{CATEGORY_LABEL[issue.category]}</span>
          {issue.severity === "error" ? (
            <span className="rounded border border-rose-300/80 bg-rose-100/60 px-1 py-0 text-[9px] font-semibold leading-[1.2] text-rose-700">
              Blocker
            </span>
          ) : (
            <span className="rounded border border-amber-300/80 bg-amber-100/50 px-1 py-0 text-[9px] font-semibold leading-[1.2] text-amber-800 dark:text-amber-200">
              Advisory
            </span>
          )}
        </div>
        <p className="leading-snug">{issue.message}</p>
        {issue.sectionId && onFocusSection ? (
          <button
            type="button"
            onClick={() => {
              if (!issue.sectionId) return;
              onFocusSection(issue.sectionId);
            }}
            className="mt-1 inline-flex cursor-pointer items-center rounded border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground hover:bg-muted"
          >
            Focus section
          </button>
        ) : null}
      </div>
    </li>
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {errors > 0
          ? `Preflight results: ${errors} blocking issue${errors === 1 ? "" : "s"}, ${warns} advisory warning${warns === 1 ? "" : "s"}.`
          : warns > 0
            ? `Preflight results: no blockers, ${warns} advisory warning${warns === 1 ? "" : "s"}.`
            : "Preflight results: no issues found."}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Preflight
        </span>
        <span className="text-[10px] text-muted-foreground">
          {errors > 0 ? `${errors} blocker${errors === 1 ? "" : "s"} · ` : ""}
          {warns} advisory{warns === 1 ? "" : "s"}
        </span>
      </div>
      <p className="m-0 text-[11px] leading-snug text-muted-foreground">
        <strong className="font-semibold text-foreground">Blockers</strong> disable{" "}
        <span className="font-medium text-foreground">Publish now</span> until fixed.{" "}
        <strong className="font-semibold text-foreground">Advisory</strong> items are
        non-blocking — review them, then publish if you accept the risk.
      </p>
      {blockingIssues.length > 0 ? (
        <div className="rounded-md border border-rose-300/70 bg-rose-50/50 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
              Publish blockers ({blockingIssues.length})
            </span>
            {firstFocusableBlockingSectionId ? (
              <button
                type="button"
                onClick={() => onFocusSection?.(firstFocusableBlockingSectionId)}
                className="inline-flex cursor-pointer items-center rounded border border-rose-300/80 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50"
              >
                Focus first blocker
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-1.5 text-rose-950">
            {blockingIssues.map((issue, index) => renderIssue(issue, index))}
          </ul>
          {blockingCategorySummary.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {blockingCategorySummary.map((entry) => (
                <span
                  key={entry.category}
                  className="inline-flex items-center rounded border border-rose-300/70 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                  title={`${entry.count} blocker${entry.count === 1 ? "" : "s"} in ${CATEGORY_LABEL[entry.category]}`}
                >
                  {CATEGORY_LABEL[entry.category]} · {entry.count}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {warningIssues.length > 0 ? (
        <div className="rounded-md border border-amber-300/70 bg-amber-50/40 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Advisory — non-blocking ({warningIssues.length})
          </div>
          <ul className="flex flex-col gap-1.5 text-zinc-800">
            {warningIssues.map((issue, index) =>
              renderIssue(issue, blockingIssues.length + index),
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
