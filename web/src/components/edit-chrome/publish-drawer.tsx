"use client";

/**
 * Implements `docs/mockups/builder-experience.html` surface 7 (Publish drawer).
 * Last reconciled: 2026-05.
 *
 * PublishDrawer — right-side drawer for promoting the live canvas draft.
 * Same chrome shape as InspectorDock and PageSettingsDrawer:
 *   eyebrow → display title (icon · "Push homepage live") → meta
 *   ("Last published …") → tools group → paper body with white cards →
 *   footer with Save draft (left) + Cancel + Publish now (right).
 *
 * Body cards:
 *   1. Preview thumbnail + stats (sections ready / changes since publish)
 *   2. Page settings mini (title + meta description, with "Open full"
 *      link to the dedicated PageSettingsDrawer)
 *   3. Search preview (Google SERP-style triplet, derived from page
 *      metadata)
 *   4. What's going live — section list. Non-legacy slots render as the
 *      primary list; legacy slots collapse behind a disclosure.
 *
 * Things that aren't wired yet (intentional, called out in code):
 *   - Last-published author (no schema field; renders "—")
 *   - Save draft checkpoint (no `saveNamedDraftAction` yet — Phase 4)
 *
 * Each placeholder is visible in the chrome but disabled / labelled so
 * the operator sees the design contract while the data model catches up.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { publishHomepageFromEditModeAction } from "@/lib/site-admin/edit-mode/composition-actions";
import { safeAction } from "@/lib/site-admin/edit-mode/safe-action";
import {
  loadPublishedSnapshotRowsAction,
  type PublishedSnapshotRow,
} from "@/lib/site-admin/edit-mode/publish-diff-action";
import {
  diffPublishedRows,
  type PublishDiffRow,
  type SectionChangeKind,
} from "@/lib/site-admin/edit-mode/publish-diff";
import {
  Card,
  CardAction,
  CardBody,
  CardHead,
  CHROME,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
  Field,
  FieldLabel,
  Helper,
  HelperCounter,
} from "./kit";
import { useEditContext } from "./edit-context";
import { PublishPreflight } from "./PublishPreflight";
import { cleanSectionName } from "@/lib/site-admin/clean-section-name";

const TITLE_MAX = 60;
const DESC_MAX = 160;

function formatPublishedAt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}


type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "error"; message: string; code?: string }
  | { kind: "success"; publishedAt: string };

// ── icons ────────────────────────────────────────────────────────────────────

function PublishIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82M19.4 9a1.65 1.65 0 0 1 .33-1.82M4.6 9a1.65 1.65 0 0 0-.33-1.82M4.6 15a1.65 1.65 0 0 1-.33 1.82" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ChangesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function SectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="2" y="2" width="12" height="9" rx="1.2" />
      <path d="M5 6.5h6M6 8.5h4" />
    </svg>
  );
}

function ChevronDown({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{
        transform: flipped ? "rotate(180deg)" : undefined,
        transition: "transform 160ms ease",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChangeBadge({ kind }: { kind: SectionChangeKind }) {
  if (kind === "unchanged") return null;
  const palette =
    kind === "added"
      ? {
          bg: "rgba(34,197,94,0.10)",
          border: "rgba(34,197,94,0.35)",
          text: "#166534",
          label: "Added",
        }
      : {
          bg: "rgba(59,130,246,0.10)",
          border: "rgba(59,130,246,0.35)",
          text: "#1d4ed8",
          label: "Moved",
        };
  return (
    <span
      style={{
        marginLeft: 8,
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.text,
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        padding: "3px 7px",
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {palette.label}
    </span>
  );
}

// ── input styling helpers (mini page-settings card) ─────────────────────────

function miniInputStyle(): React.CSSProperties {
  return {
    width: "100%",
    background: "#faf9f6",
    border: "1px solid #e5e0d5",
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 13,
    lineHeight: 1.4,
    color: CHROME.ink,
    outline: "none",
    transition: "border-color 150ms, box-shadow 150ms",
  };
}

function miniTextareaStyle(): React.CSSProperties {
  return {
    ...miniInputStyle(),
    minHeight: 64,
    resize: "vertical",
  };
}

// ── PublishDrawer ────────────────────────────────────────────────────────────

export function PublishDrawer() {
  const {
    publishOpen,
    closePublish,
    openPageSettings,
    focusSectionForEdit,
    slots,
    slotDefs,
    pageMetadata,
    getCompositionCasVersion,
    pageId,
    pageSlug,
    dirty,
    saving,
    locale,
    refreshComposition,
    savePageMetadata,
    saveDraft,
  } = useEditContext();

  const [state, setState] = useState<PublishState>({ kind: "idle" });
  const [showLegacy, setShowLegacy] = useState(false);
  const [host, setHost] = useState("");
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightBlockingErrors, setPreflightBlockingErrors] = useState(0);
  const [publishedRows, setPublishedRows] = useState<
    ReadonlyArray<PublishedSnapshotRow> | null
  >(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [publishedRowsLoading, setPublishedRowsLoading] = useState(false);
  const [reloadCompositionBusy, setReloadCompositionBusy] = useState(false);

  // Local mini-edit working copy for the page-settings card. Resyncs from
  // upstream metadata on open; commits via savePageMetadata on blur.
  const [miniTitle, setMiniTitle] = useState<string>("");
  const [miniDesc, setMiniDesc] = useState<string>("");
  const handlePreflightStatusChange = useCallback(
    (status: { loading: boolean; blockingErrors: number }) => {
      setPreflightLoading(status.loading);
      setPreflightBlockingErrors(status.blockingErrors);
    },
    [],
  );

  useEffect(() => {
    if (typeof window !== "undefined") setHost(window.location.host);
  }, []);

  useEffect(() => {
    if (publishOpen) {
      setState({ kind: "idle" });
      setShowLegacy(false);
      setPreflightLoading(true);
      setPreflightBlockingErrors(0);
      setPublishedRows(null);
      setLastPublishedAt(null);
      setPublishedRowsLoading(false);
      setMiniTitle(pageMetadata?.title ?? "");
      setMiniDesc(pageMetadata?.metaDescription ?? "");
    }
  }, [publishOpen, pageMetadata]);

  useEffect(() => {
    let cancelled = false;
    if (!publishOpen || !pageId) return;
    setPublishedRowsLoading(true);
    void (async () => {
      const result = await loadPublishedSnapshotRowsAction({ pageId });
      if (cancelled) return;
      if (result.ok) {
        setPublishedRows(result.rows);
        setLastPublishedAt(result.publishedAt);
      } else {
        setPublishedRows(null);
        setLastPublishedAt(null);
      }
      setPublishedRowsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [publishOpen, pageId]);

  const summary = useMemo(() => {
    type Row = {
      key: string;
      label: string;
      legacy: boolean;
      required: boolean;
      count: number;
      missingRequired: boolean;
      sections: Array<{ id: string; name: string; sortOrder: number }>;
    };
    const rows: Row[] = slotDefs.map((def) => {
      const entries = slots[def.key] ?? [];
      const legacy = /\(legacy\)/i.test(def.label);
      return {
        key: def.key,
        label: def.label.replace(/\s*\(legacy\)\s*$/i, ""),
        legacy,
        required: def.required,
        count: entries.length,
        missingRequired: def.required && entries.length === 0,
        sections: entries.map((e) => ({
          id: e.sectionId,
          name: cleanSectionName(e.name),
          sortOrder: e.sortOrder,
        })),
      };
    });
    const primary = rows.filter((r) => !r.legacy);
    const legacy = rows.filter((r) => r.legacy);
    const totalSections = rows.reduce((sum, r) => sum + r.count, 0);
    const primaryCount = primary.reduce((sum, r) => sum + r.count, 0);
    const legacyCount = legacy.reduce((sum, r) => sum + r.count, 0);
    const missing = rows.filter((r) => r.missingRequired);
    return {
      rows,
      primary,
      legacy,
      totalSections,
      primaryCount,
      legacyCount,
      missing,
    };
  }, [slots, slotDefs]);

  const publishDiff = useMemo(() => {
    const draftRows: PublishDiffRow[] = summary.rows.flatMap((row) =>
      row.sections.map((section) => ({
        sectionId: section.id,
        slotKey: row.key,
        sortOrder: section.sortOrder,
      })),
    );
    if (!publishedRows) {
      return {
        loading: publishedRowsLoading,
        summary: {
          added: 0,
          removed: 0,
          moved: 0,
          total: 0,
        },
        draftSectionChanges: new Map<string, SectionChangeKind>(),
        removedSectionIds: [] as string[],
      };
    }
    const liveRows: PublishDiffRow[] = publishedRows.map((row) => ({
      sectionId: row.sectionId,
      slotKey: row.slotKey,
      sortOrder: row.sortOrder,
    }));
    return {
      loading: false,
      ...diffPublishedRows(draftRows, liveRows),
    };
  }, [summary.rows, publishedRows, publishedRowsLoading]);

  const removedLiveSections = useMemo(() => {
    if (!publishedRows || publishDiff.removedSectionIds.length === 0) return [];
    const byId = new Map(
      publishedRows.map((row) => [row.sectionId, row] as const),
    );
    return publishDiff.removedSectionIds
      .map((sectionId) => byId.get(sectionId))
      .filter((row): row is PublishedSnapshotRow => Boolean(row))
      .map((row) => ({
        sectionId: row.sectionId,
        name: cleanSectionName(row.name) || row.name,
      }));
  }, [publishDiff.removedSectionIds, publishedRows]);

  async function handlePublish() {
    const casVersion = getCompositionCasVersion();
    if (casVersion === null) return;
    setState({ kind: "publishing" });
    // safeAction wrapper: if the dev server restarts mid-publish or the
    // network drops, we get a graceful "Network error" toast instead of
    // a stuck "Publishing…" pending state and a leaked Next.js overlay.
    const res = await safeAction(
      () =>
        publishHomepageFromEditModeAction({
          locale,
          // Pass pageId only for non-homepage pages (identified by non-null
          // slug). Homepage always has a real cms_pages UUID but must route
          // through the homepage publish path — passing null signals that
          // path to the action.
          pageId: pageSlug ? pageId : null,
          expectedVersion: casVersion,
        }),
      {
        name: "publishHomepageFromEditModeAction",
        fallback: {
          ok: false as const,
          error:
            "Network error — your changes are saved as a draft. Check your connection and try again.",
          code: "network",
        },
      },
    );
    if (res.ok) {
      setState({ kind: "success", publishedAt: res.publishedAt });
      await refreshComposition();
      return;
    }
    setState({ kind: "error", message: res.error, code: res.code });
  }

  async function commitMini() {
    if (!pageMetadata) return;
    const trimmedTitle = miniTitle.trim() || pageMetadata.title;
    const next = {
      ...pageMetadata,
      title: trimmedTitle,
      metaDescription:
        miniDesc.trim() === "" ? null : miniDesc,
    };
    if (
      next.title === pageMetadata.title &&
      (next.metaDescription ?? "") === (pageMetadata.metaDescription ?? "")
    ) {
      return;
    }
    await savePageMetadata(next);
  }

  const publishDisabled =
    state.kind === "publishing" ||
    dirty ||
    saving ||
    preflightLoading ||
    preflightBlockingErrors > 0 ||
    summary.missing.length > 0 ||
    getCompositionCasVersion() === null;

  // QA 2026-05-13 — `publishDisabled` was a 7-way `||` with no tooltip
  // or banner explaining which condition was active. Operators clicked
  // a greyed-out "Publish now" with no idea whether they were missing a
  // save, hung on preflight, or had a real blocker. Now we surface the
  // first-matching reason as a `title` tooltip + `aria-describedby` so
  // screen readers also get it. Banners above the button already cover
  // the deeper reasons (blocking checks, missing sections) — the
  // tooltip is the at-a-glance hint.
  const publishDisabledReason = (() => {
    if (state.kind === "publishing") return "Publishing — please wait.";
    if (saving) return "Saving draft — try again in a moment.";
    if (dirty)
      return "Unsaved changes — autosave is catching up; try again in a moment.";
    if (preflightLoading) return "Running publish checks…";
    if (preflightBlockingErrors > 0)
      return `Fix ${preflightBlockingErrors} blocking publish check${
        preflightBlockingErrors === 1 ? "" : "s"
      } above before publishing.`;
    if (summary.missing.length > 0)
      return `${summary.missing.length} section${
        summary.missing.length === 1 ? "" : "s"
      } missing from the latest published version — reload composition to recover.`;
    if (getCompositionCasVersion() === null)
      return "Page version unavailable — reload and try again.";
    return null;
  })();
  /**
   * Hard blockers only — things that are wrong with *content or checks*, not
   * transient draft/preflight state (those have their own banners above).
   * Preflight **warnings** never appear here; only severity `error` counts.
   */
  const publishHardBlockReasons = useMemo(() => {
    const reasons: string[] = [];
    if (preflightBlockingErrors > 0) {
      reasons.push(
        `${preflightBlockingErrors} publish check${
          preflightBlockingErrors === 1 ? "" : "s"
        } marked Blocker above must be fixed. Warnings are advisory — they do not stop publish.`,
      );
    }
    if (getCompositionCasVersion() === null) {
      reasons.push("Page version is unavailable. Reload and try again.");
    }
    return reasons;
  }, [getCompositionCasVersion, preflightBlockingErrors]);

  const isSuccess = state.kind === "success";

  // Header meta line — schema for `lastPublishedAt` lands later; for now
  // surface the just-published timestamp from the in-flight success state
  // when available, otherwise the current row's `published_at` value.
  //
  // QA 2026-05-13 — during the rows loader's in-flight window
  // (publishedRowsLoading=true), `lastPublishedAt` is still null, so
  // `formatPublishedAt(null)` rendered "—" — which read as "never
  // published" even though the topbar pill said "Live · <ts>". Show a
  // neutral loading placeholder during the load instead of the
  // never-published em-dash.
  const headerMeta: React.ReactNode = isSuccess ? (
    <span>
      Just published ·{" "}
      <span style={{ color: CHROME.muted2 }}>{formatPublishedAt((state as Extract<PublishState, { kind: "success" }>).publishedAt)}</span>
    </span>
  ) : (
    <span>
      Last published{" "}
      <span style={{ color: CHROME.muted2 }}>
        {publishedRowsLoading && !lastPublishedAt
          ? "loading…"
          : formatPublishedAt(lastPublishedAt)}
      </span>
    </span>
  );

  const publishHeadTitle = isSuccess
    ? "Published"
    : pageSlug
      ? "Publish page"
      : "Publish homepage";

  return (
    <Drawer
      kind="publish"
      open={publishOpen}
      zIndex={88}
      ariaLabelledBy="publish-drawer-title"
    >
      <DrawerHead
        titleId="publish-drawer-title"
        title={publishHeadTitle}
        icon={<PublishIcon />}
        meta={headerMeta}
        onClose={state.kind === "publishing" ? undefined : closePublish}
      />

      <DrawerBody>
        {isSuccess ? (
          <SuccessBody
            publishedAt={
              (state as Extract<PublishState, { kind: "success" }>).publishedAt
            }
            onClose={closePublish}
          />
        ) : (
          <>
            {state.kind === "publishing" ? (
              <p className="sr-only" role="status" aria-live="polite">
                Publishing to the live site. Please wait.
              </p>
            ) : null}
            <div
              style={{
                marginBottom: 12,
                borderRadius: 8,
                border: `1px solid ${CHROME.line}`,
                background: CHROME.paper,
                padding: "10px 12px",
                fontSize: 12,
                lineHeight: 1.5,
                color: CHROME.text2,
              }}
            >
              <strong style={{ color: CHROME.text }}>What publishing does</strong>
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: CHROME.muted }}>
                <strong style={{ color: CHROME.text }}>Autosave</strong> keeps your in-progress
                work as a <strong style={{ color: CHROME.text }}>draft</strong>.{" "}
                <strong style={{ color: CHROME.text }}>Publishing</strong> replaces the current{" "}
                <strong style={{ color: CHROME.text }}>public</strong> version of{" "}
                {pageSlug ? "this page" : "your homepage"} with that draft — so visitors then
                see this page as you have it now. Other pages are unchanged. Use{" "}
                <strong style={{ color: CHROME.text }}>Revisions</strong> to roll back to a
                previous snapshot if needed.
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 11, color: CHROME.muted2, lineHeight: 1.45 }}>
                Saving only stores your draft — it does not mean visitors see these changes. Scroll the
                canvas, try Preview mode, and review the publish checks below before publishing.
              </p>
            </div>
            {/* Phase 10 — preflight (heading + alt-text + contrast). */}
            <div style={{ marginBottom: 12 }}>
              <PublishPreflight
                enabled={publishOpen}
                refreshKey={publishOpen ? 1 : 0}
                locale={locale}
                pageId={pageSlug ? pageId : undefined}
                onStatusChange={handlePreflightStatusChange}
                onFocusSection={focusSectionForEdit}
              />
            </div>
            {/* ── Preview thumbnail + stats ───────────────────────── */}
            <Card>
              <CardBody>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <PreviewThumb />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <StatLine
                      count={summary.totalSections}
                      label={`section${summary.totalSections === 1 ? "" : "s"} ready`}
                      tone="ink"
                    />
                    {/* QA 2026-05-13 — while `publishDiff.loading` is true,
                        the count used to render as the ellipsis character
                        "…" inside the tone="blue" colored chip, which read
                        as junk data ("blue badge with garbage in it"). Now
                        the chip stays muted with the same dash placeholder
                        we use elsewhere for not-yet-loaded data; once the
                        loader settles, the real count + tone come back. */}
                    <StatLine
                      count={publishDiff.loading ? "—" : publishDiff.summary.total}
                      label="changes since last publish"
                      tone={publishDiff.loading ? "ink" : "blue"}
                      muted={
                        publishDiff.loading ||
                        publishDiff.summary.total === 0
                      }
                    />
                    {!publishDiff.loading && publishDiff.summary.total > 0 ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 10.5,
                          color: CHROME.muted2,
                        }}
                      >
                        +{publishDiff.summary.added} added ·{" "}
                        {publishDiff.summary.moved} moved · -
                        {publishDiff.summary.removed} removed
                      </div>
                    ) : null}
                    {!publishDiff.loading && publishDiff.summary.total === 0 ? (
                      <p className="sr-only" role="status" aria-live="polite">
                        Publish diff shows zero changes versus the last published
                        snapshot. If the canvas or mobile preview still looks wrong,
                        scroll the page, try Preview mode, review publish checks in this drawer,
                        or wait for autosave before trusting Publish.
                      </p>
                    ) : null}
                    {!publishDiff.loading && publishedRows && publishDiff.summary.total === 0 ? (
                      <div style={{ marginTop: 8 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 11,
                            lineHeight: 1.45,
                            color: CHROME.muted2,
                          }}
                        >
                          Diff shows no section changes vs last publish — the canvas or device
                          preview can still lag your saved draft. Use Preview, review checks below,
                          wait for autosave, or reload composition if the tree looks stale.
                        </p>
                        <button
                          type="button"
                          disabled={reloadCompositionBusy || saving || state.kind === "publishing"}
                          onClick={() => {
                            setReloadCompositionBusy(true);
                            void (async () => {
                              try {
                                await refreshComposition();
                              } finally {
                                setReloadCompositionBusy(false);
                              }
                            })();
                          }}
                          style={{
                            marginTop: 8,
                            height: 28,
                            padding: "0 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            color: CHROME.text2,
                            background: CHROME.surface,
                            border: `1px solid ${CHROME.lineMid}`,
                            borderRadius: 7,
                            cursor:
                              reloadCompositionBusy || saving || state.kind === "publishing"
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              reloadCompositionBusy || saving || state.kind === "publishing"
                                ? 0.55
                                : 1,
                          }}
                        >
                          {reloadCompositionBusy ? "Reloading…" : "Reload composition"}
                        </button>
                      </div>
                    ) : null}
                    <div
                      style={{
                        fontSize: 11,
                        color: CHROME.muted2,
                        marginTop: 8,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {host || "—"} <span style={{ color: CHROME.muted3 }}>·</span> /
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* ── Page settings (mini) ───────────────────────────── */}
            <Card>
              <CardHead
                icon={<CogIcon />}
                title="Page settings"
                action={
                  <CardAction accent="accent" onClick={openPageSettings}>
                    Open full
                  </CardAction>
                }
              />
              <CardBody>
                <Field>
                  <FieldLabel htmlFor="pub-title" meta="Browser tab + Google">
                    Page title
                  </FieldLabel>
                  <input
                    id="pub-title"
                    type="text"
                    value={miniTitle}
                    onChange={(e) => setMiniTitle(e.target.value)}
                    onBlur={() => void commitMini()}
                    style={miniInputStyle()}
                    placeholder="Impronta · A house of curated talent"
                  />
                  <Helper>
                    <span>Used in browser tabs and search results.</span>
                    <HelperCounter
                      current={miniTitle.length}
                      max={TITLE_MAX}
                    />
                  </Helper>
                </Field>

                <Field flush>
                  <FieldLabel htmlFor="pub-desc">Meta description</FieldLabel>
                  <textarea
                    id="pub-desc"
                    value={miniDesc}
                    onChange={(e) => setMiniDesc(e.target.value)}
                    onBlur={() => void commitMini()}
                    style={miniTextareaStyle()}
                    placeholder="A boutique agency curating bilingual talent for events, brand campaigns, and editorial work."
                  />
                  <Helper>
                    <span>Shown beneath title in Google.</span>
                    <HelperCounter
                      current={miniDesc.length}
                      max={DESC_MAX}
                    />
                  </Helper>
                </Field>
              </CardBody>
            </Card>

            {/* ── Search preview ─────────────────────────────────── */}
            <Card>
              <CardHead icon={<GlobeIcon />} title="Search preview" />
              <CardBody>
                <SearchPreview
                  host={host}
                  title={miniTitle || pageMetadata?.title || ""}
                  description={miniDesc || pageMetadata?.metaDescription || ""}
                />
              </CardBody>
            </Card>

            {/* ── What's going live ──────────────────────────────── */}
            {/* T1-3 — header shows the FULL section count (primary + legacy)
                so it matches the navigator. The audit caught this surface
                showing fewer sections than the navigator listed because the
                old `primaryCount` excluded legacy. Both counts are still
                computed (used inside the card to label each group), but
                the user-facing summary number is the one they see in the
                sections panel. */}
            <Card>
              <CardHead
                icon={<ChangesIcon />}
                title="What's going live"
                sub={`${summary.totalSections} section${summary.totalSections === 1 ? "" : "s"}`}
              />
              <CardBody padding="flush">
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: "4px 0",
                  }}
                >
                  {summary.primary.flatMap((row) =>
                    row.count === 0
                      ? [
                          <li
                            key={`empty-${row.key}`}
                            style={{
                              padding: "8px 13px",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 12,
                              color: row.missingRequired
                                ? CHROME.amber
                                : CHROME.muted2,
                            }}
                          >
                            <span
                              aria-hidden
                              style={{
                                display: "inline-block",
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background: row.missingRequired
                                  ? CHROME.amber
                                  : CHROME.muted3,
                              }}
                            />
                            <span style={{ flex: 1 }}>{row.label}</span>
                            {row.missingRequired ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                  color: CHROME.amber,
                                }}
                              >
                                Required
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontStyle: "italic",
                                  color: CHROME.muted3,
                                }}
                              >
                                Empty
                              </span>
                            )}
                          </li>,
                        ]
                      : row.sections.map((s) => (
                          <li
                            key={s.id}
                            style={{
                              padding: "8px 13px",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              borderTop: `1px solid ${CHROME.line}`,
                            }}
                          >
                            <span
                              aria-hidden
                              style={{
                                color: CHROME.muted2,
                                display: "inline-flex",
                              }}
                            >
                              <SectionIcon />
                            </span>
                            <div
                              style={{
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12.5,
                                  fontWeight: 500,
                                  color: CHROME.ink,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {s.name || row.label}
                                </span>
                                {!publishDiff.loading ? (
                                  <ChangeBadge
                                    kind={
                                      publishDiff.draftSectionChanges.get(s.id) ??
                                      "unchanged"
                                    }
                                  />
                                ) : null}
                              </div>
                              <div
                                style={{
                                  fontSize: 10.5,
                                  color: CHROME.muted2,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                  marginTop: 1,
                                }}
                              >
                                {row.label}
                              </div>
                            </div>
                          </li>
                        )),
                  )}
                </ul>

                {summary.legacy.length > 0 ? (
                  <div
                    style={{
                      borderTop: `1px solid ${CHROME.line}`,
                      padding: "6px 13px 8px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowLegacy((s) => !s)}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: CHROME.muted,
                        padding: "4px 0",
                      }}
                    >
                      <ChevronDown flipped={showLegacy} />
                      {showLegacy
                        ? `Hide ${summary.legacyCount} legacy ${summary.legacyCount === 1 ? "section" : "sections"}`
                        : `Show ${summary.legacyCount} legacy ${summary.legacyCount === 1 ? "section" : "sections"}`}
                    </button>

                    {showLegacy ? (
                      <ul
                        style={{
                          listStyle: "none",
                          margin: "4px 0 0",
                          padding: 0,
                        }}
                      >
                        {summary.legacy.flatMap((row) =>
                          row.sections.map((s) => (
                            <li
                              key={s.id}
                              style={{
                                padding: "6px 0",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                opacity: 0.85,
                              }}
                            >
                              <span
                                aria-hidden
                                style={{
                                  color: CHROME.muted3,
                                  display: "inline-flex",
                                }}
                              >
                                <SectionIcon />
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: CHROME.text2,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <span
                                    style={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {s.name || row.label}
                                  </span>
                                  {!publishDiff.loading ? (
                                    <ChangeBadge
                                      kind={
                                        publishDiff.draftSectionChanges.get(s.id) ??
                                        "unchanged"
                                      }
                                    />
                                  ) : null}
                                </div>
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: CHROME.muted2,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  {row.label} · legacy
                                </div>
                              </div>
                            </li>
                          )),
                        )}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {!publishDiff.loading && removedLiveSections.length > 0 ? (
                  <div
                    style={{
                      borderTop: `1px solid ${CHROME.line}`,
                      padding: "8px 13px 10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: CHROME.muted2,
                        marginBottom: 5,
                      }}
                    >
                      Removed From Live ({removedLiveSections.length})
                    </div>
                    <ul
                      style={{
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                        display: "grid",
                        gap: 4,
                      }}
                    >
                      {removedLiveSections.slice(0, 4).map((row) => (
                        <li
                          key={row.sectionId}
                          style={{
                            fontSize: 11.5,
                            color: CHROME.text2,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span aria-hidden style={{ color: CHROME.muted3 }}>
                            −
                          </span>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {row.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {removedLiveSections.length > 4 ? (
                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 10.5,
                          color: CHROME.muted2,
                        }}
                      >
                        +{removedLiveSections.length - 4} more
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardBody>
            </Card>

            {/* ── Inline status / error banners ───────────────── */}
            {summary.missing.length > 0 ? (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                style={{
                  marginTop: 10,
                  borderRadius: 8,
                  border: `1px solid ${CHROME.amberLine}`,
                  background: CHROME.amberBg,
                  color: CHROME.amber,
                  padding: "8px 10px",
                  fontSize: 11.5,
                  lineHeight: 1.45,
                }}
              >
                Add at least one section to{" "}
                {summary.missing.map((s, i) => (
                  <span key={s.key}>
                    <strong>{s.label}</strong>
                    {i < summary.missing.length - 1 ? ", " : ""}
                  </span>
                ))}{" "}
                before publishing.
              </div>
            ) : null}

            {dirty || saving ? (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                style={{
                  marginTop: 10,
                  borderRadius: 8,
                  border: `1px solid ${CHROME.line}`,
                  background: CHROME.paper,
                  color: CHROME.text2,
                  padding: "8px 10px",
                  fontSize: 11.5,
                }}
              >
                {saving
                  ? "Saving your last edit…"
                  : "You have unsaved edits — wait for them to save first."}
              </div>
            ) : null}

            {state.kind === "error" ? (
              <div
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                style={{
                  marginTop: 10,
                  borderRadius: 8,
                  border: `1px solid ${CHROME.roseLine}`,
                  background: CHROME.roseBg,
                  color: CHROME.rose,
                  padding: "8px 10px",
                  fontSize: 11.5,
                }}
              >
                {state.message}
                {state.code === "VERSION_CONFLICT" ? (
                  <button
                    type="button"
                    onClick={() => {
                      void refreshComposition();
                      setState({ kind: "idle" });
                    }}
                    style={{
                      marginTop: 6,
                      display: "block",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      color: CHROME.rose,
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    Reload the latest version
                  </button>
                ) : null}
              </div>
            ) : null}

            {state.kind !== "publishing" &&
            publishHardBlockReasons.length > 0 ? (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                style={{
                  marginTop: 10,
                  borderRadius: 8,
                  border: `1px solid ${CHROME.roseLine}`,
                  background: CHROME.roseBg,
                  color: CHROME.rose,
                  padding: "9px 10px",
                  fontSize: 11.5,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 5,
                  }}
                >
                  Publish blocked
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 14,
                    display: "grid",
                    gap: 2,
                  }}
                >
                  {publishHardBlockReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </DrawerBody>

      {!isSuccess ? (
        <DrawerFoot
          start={
            <button
              type="button"
              title="Save a draft checkpoint without publishing"
              onClick={() => void saveDraft()}
              disabled={saving || state.kind === "publishing"}
              style={{
                height: 30,
                padding: "0 12px",
                fontSize: 12,
                fontWeight: 500,
                color:
                  saving || state.kind === "publishing"
                    ? CHROME.muted2
                    : CHROME.text2,
                background: CHROME.surface,
                border: `1px solid ${CHROME.lineMid}`,
                borderRadius: 7,
                cursor:
                  saving || state.kind === "publishing"
                    ? "not-allowed"
                    : "pointer",
                opacity: saving || state.kind === "publishing" ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          }
          end={
            <>
              <button
                type="button"
                onClick={closePublish}
                disabled={state.kind === "publishing"}
                style={{
                  height: 30,
                  padding: "0 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: CHROME.text2,
                  background: CHROME.surface,
                  border: `1px solid ${CHROME.lineMid}`,
                  borderRadius: 7,
                  cursor:
                    state.kind === "publishing" ? "not-allowed" : "pointer",
                  opacity: state.kind === "publishing" ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled={publishDisabled}
                aria-busy={state.kind === "publishing"}
                aria-label={
                  state.kind === "publishing"
                    ? "Publishing to the live site, please wait"
                    : publishDisabledReason
                      ? `Publish now — ${publishDisabledReason}`
                      : undefined
                }
                title={publishDisabled ? publishDisabledReason ?? undefined : undefined}
                style={{
                  height: 30,
                  padding: "0 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  // Sprint 3.2 — Publish CTA uses slate accent so the
                  // drawer's primary action matches the topbar's Publish
                  // split-button instead of competing with brand-black.
                  background: publishDisabled
                    ? CHROME.muted2
                    : `linear-gradient(180deg, ${CHROME.accent2} 0%, ${CHROME.accent} 100%)`,
                  border: "none",
                  borderRadius: 7,
                  cursor: publishDisabled ? "not-allowed" : "pointer",
                  boxShadow: publishDisabled
                    ? "none"
                    : "0 1px 2px rgba(15,19,32,0.20), inset 0 0 0 1px rgba(255,255,255,0.10)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {state.kind === "publishing" ? (
                  <>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: "white",
                        animation: "pulse 1.4s ease-in-out infinite",
                      }}
                    />
                    Publishing…
                  </>
                ) : (
                  "Publish now"
                )}
              </button>
            </>
          }
        />
      ) : null}
    </Drawer>
  );
}

// ── PreviewThumb (stylised dark wireframe of the storefront) ────────────────

function PreviewThumb() {
  return (
    <div
      aria-hidden
      style={{
        width: 140,
        height: 88,
        borderRadius: 8,
        background: "linear-gradient(180deg,#242942,#1a1f35)",
        overflow: "hidden",
        border: `1px solid ${CHROME.lineMid}`,
        boxShadow: "0 4px 10px -4px rgba(0,0,0,0.30)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: 14,
          background: "rgba(245,240,232,0.30)",
          margin: "10px 14px 6px",
          borderRadius: 2,
        }}
      />
      <div
        style={{
          height: 4,
          background: "rgba(245,240,232,0.18)",
          margin: "6px 8px",
          borderRadius: 2,
        }}
      />
      <div
        style={{
          height: 4,
          background: "rgba(245,240,232,0.18)",
          margin: "6px 8px",
          borderRadius: 2,
          width: "60%",
        }}
      />
      <div
        style={{
          height: 8,
          margin: "6px 14px",
          borderRadius: 4,
          background:
            "linear-gradient(90deg,rgba(245,240,232,0.12) 58%,rgba(245,240,232,0.80) 58%)",
        }}
      />
    </div>
  );
}

// ── StatLine (count badge + label) ──────────────────────────────────────────

function StatLine({
  count,
  label,
  tone,
  muted,
}: {
  count: number | string;
  label: string;
  tone: "ink" | "blue";
  muted?: boolean;
}) {
  const palette =
    tone === "blue"
      ? { bg: CHROME.blue, fg: "#fff" }
      : { bg: CHROME.accent, fg: "#fff" };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 6,
        fontSize: 13,
        color: CHROME.text2,
        opacity: muted ? 0.55 : 1,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 26,
          padding: "3px 9px",
          background: palette.bg,
          color: palette.fg,
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
      <span>{label}</span>
    </div>
  );
}

// ── SearchPreview (Google SERP-style triplet) ───────────────────────────────

function SearchPreview({
  host,
  title,
  description,
}: {
  host: string;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        padding: 12,
        background: CHROME.paper,
        border: `1px solid ${CHROME.line}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: CHROME.muted,
          lineHeight: 1.4,
        }}
      >
        {host || "—"}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 16,
          fontWeight: 500,
          color: "#1a0dab",
          lineHeight: 1.3,
          letterSpacing: "-0.005em",
        }}
      >
        {title || "Untitled page"}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          color: CHROME.text2,
          lineHeight: 1.45,
        }}
      >
        {description || (
          <span style={{ color: CHROME.muted2, fontStyle: "italic" }}>
            Add a meta description to control the snippet.
          </span>
        )}
      </div>
    </div>
  );
}

// ── SuccessBody ─────────────────────────────────────────────────────────────

function SuccessBody({
  publishedAt,
  onClose,
}: {
  publishedAt: string;
  onClose: () => void;
}) {
  const when = new Date(publishedAt);
  const relative = formatRelative(when);
  return (
    <div className="py-2 text-sm" style={{ color: CHROME.text2 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            marginTop: 2,
            display: "inline-flex",
            width: 24,
            height: 24,
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            background: CHROME.green,
            color: "white",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: CHROME.ink,
            }}
          >
            Published {relative}
          </p>
          <p
            style={{
              marginTop: 4,
              fontSize: 12,
              color: CHROME.muted,
              lineHeight: 1.5,
            }}
          >
            Visitors see the new homepage now. Keep editing — your next publish
            only replaces the live page when you click Publish again.
          </p>
        </div>
      </div>
      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 28,
            padding: "0 10px",
            fontSize: 12,
            fontWeight: 500,
            color: CHROME.text2,
            background: CHROME.surface,
            border: `1px solid ${CHROME.lineMid}`,
            borderRadius: 7,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 30) return "just now";
  if (diff < 90) return "a minute ago";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  return d.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
