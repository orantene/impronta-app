"use client";

/**
 * Talent builder top bar: "Draft · N unpublished changes" chip + the "What will
 * go live" sheet, or "Live · just now · View site" once everything is out
 * (theme releases Phase 2). Self-gating: renders only inside the talent
 * builder (`/talent/page-builder`), so the shared TopBar mounts it blind.
 *
 * `useTalentPublishGate` blocks Publish while a design / look apply runs.
 */
import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";

import { CHROME, PortaledOverlay } from "./kit";
import { usePageVersion } from "./save-cycle-bridge";
import { useEditorLocale } from "./use-editor-locale";
import {
  CHROME_COPY,
  FIRST_PUBLISH_COPY,
  firstPublishSummary,
  pick,
  unpublishedChangesLabel,
} from "@/lib/talent-site/history/copy";
import type { SectionChange } from "@/lib/talent-site/history/draft-diff";
import { useThemeApplyBusy } from "@/lib/talent-site/history/apply-busy";
import { loadTalentGoLiveAction } from "@/lib/talent-site/history/history-actions";
import type { GoLiveSummary } from "@/lib/talent-site/history/history.server";

const TALENT_BUILDER_PATH = "/talent/page-builder";
const REFRESH_DEBOUNCE_MS = 1_200;

function inTalentBuilder(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith(TALENT_BUILDER_PATH);
}

/** Publish handler that does nothing while an apply runs (and says so). */
export function useTalentPublishGate<F extends () => void>(onPublish: F): F {
  const busy = useThemeApplyBusy();
  return busy ? ((() => {}) as F) : onPublish;
}

function liveLabel(iso: string | null, locale: string): string {
  const base = pick(CHROME_COPY.liveJustNow, locale);
  if (!iso) return base;
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 90) return base;
  const rtf = new Intl.RelativeTimeFormat(locale === "es" ? "es" : "en", { numeric: "auto" });
  const mins = Math.round(secs / 60);
  const when = mins < 60 ? rtf.format(-mins, "minute") : rtf.format(-Math.round(mins / 60), "hour");
  return `${pick(CHROME_COPY.live, locale)} · ${when}`;
}

export function TalentDraftChip(): ReactElement | null {
  const { locale } = useEditorLocale();
  const pageVersion = usePageVersion();
  const applyBusy = useThemeApplyBusy();
  const [enabled] = useState(inTalentBuilder);
  const [summary, setSummary] = useState<GoLiveSummary | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await loadTalentGoLiveAction().catch(() => null);
    if (res && res.ok) setSummary(res.summary);
  }, []);

  // Refresh after saves land (pageVersion = the site's draft_rev).
  useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => void load(), REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [enabled, load, pageVersion]);

  if (!enabled || !summary) return null;
  const copyOf = (k: keyof typeof CHROME_COPY) => pick(CHROME_COPY[k], locale);

  const chipStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 26,
    padding: "0 10px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
  };

  if (summary.unpublishedCount === 0 && !summary.firstPublish) {
    return (
      <span
        data-talent-live-chip
        style={{ ...chipStyle, color: CHROME.green, background: CHROME.greenBg, border: `1px solid ${CHROME.greenLine}` }}
      >
        {liveLabel(summary.lastPublishAt ?? summary.sitePublishedAt, locale)}
        {summary.siteUrl ? (
          <a href={summary.siteUrl} target="_blank" rel="noreferrer" style={{ color: CHROME.green, textDecoration: "underline" }}>
            {copyOf("viewSite")}
          </a>
        ) : null}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        data-talent-draft-chip
        onClick={() => setOpen(true)}
        title={applyBusy ? copyOf("applying") : copyOf("whatWillGoLive")}
        style={{ ...chipStyle, cursor: "pointer", color: CHROME.text, background: CHROME.surface2, border: `1px solid ${CHROME.lineMid}` }}
      >
        {summary.firstPublish
          ? pick(FIRST_PUBLISH_COPY.chip, locale)
          : pick(unpublishedChangesLabel(summary.unpublishedCount), locale)}
      </button>
      {open ? (
        <PortaledOverlay>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 205, background: "rgba(0,0,0,0.3)", display: "flex", justifyContent: "flex-end" }}
          >
            <aside
              role="dialog"
              aria-modal="true"
              aria-label={copyOf("whatWillGoLive")}
              data-what-will-go-live
              onClick={(e) => e.stopPropagation()}
              style={{ width: "min(420px, 100vw)", height: "100%", overflowY: "auto", background: CHROME.surface, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
            >
              <header className="flex items-center gap-2">
                <strong style={{ fontSize: 14, color: CHROME.ink }}>{copyOf("whatWillGoLive")}</strong>
                <span className="ml-auto" />
                <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 12, color: CHROME.text, background: "none", border: "none", cursor: "pointer" }}>
                  {copyOf("close")}
                </button>
              </header>
              {applyBusy ? <p style={{ fontSize: 12, color: CHROME.muted, margin: 0 }}>{copyOf("applying")}</p> : null}
              {summary.firstPublish ? (
                <div data-go-live-first-publish style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <strong style={{ fontSize: 13, color: CHROME.ink }}>{pick(FIRST_PUBLISH_COPY.title, locale)}</strong>
                  <span style={{ fontSize: 12, color: CHROME.muted }}>
                    {pick(firstPublishSummary(summary.firstPublish.pages, summary.firstPublish.sections), locale)}
                  </span>
                </div>
              ) : summary.changes.length === 0 ? (
                <p style={{ fontSize: 12, color: CHROME.muted, margin: 0 }}>{copyOf("noChanges")}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {summary.changes.map((c) => (
                    <ChangeRow key={`${c.scope}:${c.key}`} change={c} locale={locale} />
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </PortaledOverlay>
      ) : null}
    </>
  );
}

function ChangeRow({ change, locale }: { change: SectionChange; locale: string }): ReactElement {
  const tone =
    change.change === "added"
      ? { fg: CHROME.green, bg: CHROME.greenBg }
      : change.change === "removed"
        ? { fg: CHROME.rose, bg: CHROME.roseBg }
        : { fg: CHROME.blue, bg: CHROME.blueBg };
  return (
    <li
      data-go-live-change={change.change}
      style={{ border: `1px solid ${CHROME.line}`, borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}
    >
      <span className="flex items-center gap-2" style={{ fontSize: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, color: tone.fg, background: tone.bg }}>
          {pick(CHROME_COPY[change.change], locale)}
        </span>
        <strong style={{ color: CHROME.ink }}>{change.label}</strong>
        <span className="ml-auto" style={{ fontSize: 10.5, color: CHROME.muted2 }}>{change.scopeLabel}</span>
      </span>
      {change.before !== null || change.beforeSwatch ? (
        <span className="flex items-center gap-1" style={{ fontSize: 11.5, color: CHROME.muted }}>
          {pick(CHROME_COPY.before, locale)}: <Swatch value={change.beforeSwatch} /> {change.before ?? ""}
        </span>
      ) : null}
      {change.after !== null || change.afterSwatch ? (
        <span className="flex items-center gap-1" style={{ fontSize: 11.5, color: CHROME.text }}>
          {pick(CHROME_COPY.after, locale)}: <Swatch value={change.afterSwatch} /> {change.after ?? ""}
        </span>
      ) : null}
    </li>
  );
}

/** A colour token rendered as a chip (the value itself is never shown as text). */
function Swatch({ value }: { value?: string | null }): ReactElement | null {
  if (!value) return null;
  return (
    <span
      aria-hidden
      data-go-live-swatch
      style={{ display: "inline-block", width: 14, height: 14, borderRadius: 4, border: `1px solid ${CHROME.lineMid}`, background: value }}
    />
  );
}
