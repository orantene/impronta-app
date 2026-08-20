"use client";

/**
 * Translation status for FREEFORM surfaces — the one-row-per-locale analogue
 * of the legacy LocaleFieldTabs dots.
 *
 * Legacy slot pages kept EN/ES inside one node (`node.i18n`), so the Content
 * panel could show a per-language dot on every field. Freeform pages store a
 * separate `cms_pages` row per locale, which hides those tabs by design (the
 * adapter reports one locale per row) — and an overlay authored here would
 * never render on the sibling URL anyway. This panel restores the audit
 * power the tabs provided, freeform-natively: it loads the sibling locale's
 * row read-only, walks both trees (`buildTranslationReport`), and reports
 * per text component whether the other language has a real value.
 *
 * The language SET comes from `tenantLocales` (server-mount truth), never
 * the adapter's per-row `availableLocales`. The LocaleFieldTabs path for
 * multi-locale adapters is untouched.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CHROME } from "./kit/tokens";
import { PortaledOverlay } from "./kit/portaled-overlay";
import { useEditorLocale } from "./use-editor-locale";
import { useBuilderTree } from "./builder-tree-bridge";
import { useSelectedBuilderNodeId } from "./selection-bridge";
import { locateCanvasNode } from "./freeform-layer-row";
import {
  buildTranslationReport,
  type TranslationReport,
  type TranslationRow,
  type TranslationTextStatus,
} from "@/lib/site-admin/builder-node/translation-status";
import {
  loadSiblingLocalePageAction,
  type SiblingLocalePageResult,
} from "@/lib/site-admin/edit-mode/sibling-locale-page-action";
import { safeAction } from "@/lib/site-admin/edit-mode/safe-action";

const STATUS_META: Record<
  TranslationTextStatus,
  { dot: string; hollow?: boolean; label: string }
> = {
  translated: { dot: "#059669", label: "Translated" },
  identical: { dot: CHROME.amber, label: "Same text in both languages" },
  sibling_empty: { dot: CHROME.amber, hollow: true, label: "Empty in the other language" },
  no_counterpart: { dot: "#e11d48", hollow: true, label: "No counterpart block" },
};

function StatusDot({ status }: { status: TranslationTextStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        flex: "none",
        borderRadius: 999,
        background: meta.hollow ? "transparent" : meta.dot,
        border: `2px solid ${meta.dot}`,
      }}
    />
  );
}

type PanelState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no_sibling" }
  | { kind: "ready"; report: TranslationReport; siblingStatus: string; duplicateRows: boolean };

/**
 * Trigger + panel. Rendered by the topbar beside NavLocaleToggle, only on
 * freeform surfaces with a slug and 2+ tenant locales (the topbar gates).
 */
export function TranslationStatusButton({
  activeLocale,
  tenantLocales,
  pageSlug,
}: {
  activeLocale: string;
  tenantLocales: ReadonlyArray<string>;
  pageSlug: string;
}) {
  const { t } = useEditorLocale();
  const [open, setOpen] = useState(false);
  const otherLocales = useMemo(
    () => tenantLocales.filter((code) => code !== activeLocale),
    [tenantLocales, activeLocale],
  );
  // v1 compares against ONE sibling (the first other locale). Every current
  // tenant is bilingual at most; a third locale extends this to a picker.
  const siblingLocale = otherLocales[0] ?? null;
  if (!siblingLocale) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("Compare this page against the {locale} version").replace(
          "{locale}",
          siblingLocale.toUpperCase(),
        )}
        className="inline-flex shrink-0 cursor-pointer items-center gap-[5px] rounded-full border-none px-[10px] py-[7px] text-[12px] font-semibold transition-all"
        style={{ background: "rgba(0,0,0,0.05)", color: CHROME.muted }}
      >
        {/* two overlapping language dots — reads as "compare languages" */}
        <span aria-hidden style={{ display: "inline-flex" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#059669",
              display: "inline-block",
            }}
          />
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              border: `2px solid ${CHROME.amber}`,
              background: "transparent",
              display: "inline-block",
              marginLeft: -3,
            }}
          />
        </span>
        {t("Translations")}
      </button>
      {open ? (
        <TranslationStatusPanel
          activeLocale={activeLocale}
          siblingLocale={siblingLocale}
          pageSlug={pageSlug}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function TranslationStatusPanel({
  activeLocale,
  siblingLocale,
  pageSlug,
  onClose,
}: {
  activeLocale: string;
  siblingLocale: string;
  pageSlug: string;
  onClose: () => void;
}) {
  const { t } = useEditorLocale();
  const builderTree = useBuilderTree();
  // Latest-tree ref: the compare effect reads the tree at open/refresh time
  // only. Recomputing on every keystroke would refetch nothing but re-rank
  // rows under the operator's pointer; the Refresh button re-runs with the
  // live tree. A ref (updated every render) keeps the effect's dep array honest.
  const builderTreeRef = useRef(builderTree);
  useEffect(() => {
    builderTreeRef.current = builderTree;
  }, [builderTree]);
  const selectedNodeId = useSelectedBuilderNodeId();
  const [state, setState] = useState<PanelState>({ kind: "loading" });
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      const result: SiblingLocalePageResult = await safeAction(
        () => loadSiblingLocalePageAction({ slug: pageSlug, locale: siblingLocale }),
        {
          name: "loadSiblingLocalePage",
          fallback: { ok: false as const, error: "Couldn't load the sibling page. Try again." },
        },
      );
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: "error", message: result.error });
        return;
      }
      if (!result.exists) {
        setState({ kind: "no_sibling" });
        return;
      }
      setState({
        kind: "ready",
        report: buildTranslationReport(builderTreeRef.current, result.blocks),
        siblingStatus: result.status,
        duplicateRows: result.duplicateRows,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pageSlug, siblingLocale, reloadNonce]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const selectedRows = useMemo<ReadonlyArray<TranslationRow>>(
    () =>
      state.kind === "ready" && selectedNodeId
        ? state.report.rows.filter((row) => row.nodeId === selectedNodeId)
        : [],
    [state, selectedNodeId],
  );

  const onRowClick = useCallback((row: TranslationRow) => {
    locateCanvasNode(row.nodeId);
  }, []);

  const upper = (code: string) => code.toUpperCase();

  return (
    <PortaledOverlay>
      {/* NO click-away backdrop, deliberately: the audit workflow is
          "panel open, click nodes on the canvas, watch the pin update".
          A backdrop would swallow the very canvas clicks the panel exists
          for (live QA caught exactly that). Escape and the × close it. */}
      <aside
        role="dialog"
        aria-label={t("Translation status")}
        style={{
          position: "fixed",
          top: 64,
          right: 12,
          bottom: 12,
          width: 380,
          zIndex: 149,
          display: "flex",
          flexDirection: "column",
          background: CHROME.paper,
          border: `1px solid ${CHROME.line}`,
          borderRadius: 14,
          boxShadow: "0 18px 48px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 14px",
            borderBottom: `1px solid ${CHROME.line}`,
            background: CHROME.surface,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: CHROME.text }}>
              {t("Translation status")}
            </div>
            <div style={{ fontSize: 11, color: CHROME.muted2 }}>
              {t("{current} page compared with {sibling}")
                .replace("{current}", upper(activeLocale))
                .replace("{sibling}", upper(siblingLocale))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            title={t("Refresh")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: CHROME.muted,
              padding: "4px 6px",
            }}
          >
            {t("Refresh")}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              color: CHROME.muted,
              padding: "4px 6px",
            }}
          >
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {state.kind === "loading" ? (
            <p style={{ fontSize: 12, color: CHROME.muted, padding: "6px 2px" }} aria-busy="true">
              {t("Comparing both language versions…")}
            </p>
          ) : null}

          {state.kind === "error" ? (
            <p style={{ fontSize: 12, color: CHROME.amber, padding: "6px 2px" }} role="alert">
              {state.message}
            </p>
          ) : null}

          {state.kind === "no_sibling" ? (
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: CHROME.muted,
                background: CHROME.surface,
                border: `1px solid ${CHROME.line}`,
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              {t("The {locale} version of this page doesn't exist yet, so every block below is untranslated.")
                .replace("{locale}", upper(siblingLocale))}
            </div>
          ) : null}

          {state.kind === "ready" ? (
            <>
              {state.duplicateRows ? (
                <p style={{ fontSize: 11, color: CHROME.amber, margin: "0 0 8px" }} role="alert">
                  {t("More than one {locale} row exists for this slug; showing the first. Worth cleaning up.")
                    .replace("{locale}", upper(siblingLocale))}
                </p>
              ) : null}

              {/* summary chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {(Object.keys(STATUS_META) as TranslationTextStatus[]).map((status) => (
                  <span
                    key={status}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      color: CHROME.muted,
                      background: CHROME.surface,
                      border: `1px solid ${CHROME.line}`,
                      borderRadius: 999,
                      padding: "3px 9px",
                    }}
                  >
                    <StatusDot status={status} />
                    {state.report.counts[status]} {t(STATUS_META[status].label)}
                  </span>
                ))}
              </div>

              {state.report.siblingOnlyCount > 0 ? (
                <p style={{ fontSize: 11, color: CHROME.muted2, margin: "0 0 10px" }}>
                  {t("{count} text block(s) exist only on the {locale} page.")
                    .replace("{count}", String(state.report.siblingOnlyCount))
                    .replace("{locale}", upper(siblingLocale))}
                </p>
              ) : null}

              {/* selected node pin */}
              {selectedRows.length > 0 ? (
                <div
                  style={{
                    border: `1px solid ${CHROME.lineStrong}`,
                    background: CHROME.surface,
                    borderRadius: 10,
                    padding: "8px 10px",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: CHROME.muted2,
                      marginBottom: 4,
                    }}
                  >
                    {t("Selected block")}
                  </div>
                  {selectedRows.map((row) => (
                    <RowLine key={`${row.nodeId}:${row.prop}`} row={row} onClick={onRowClick} />
                  ))}
                </div>
              ) : null}

              {state.report.total === 0 ? (
                <p style={{ fontSize: 12, color: CHROME.muted, padding: "6px 2px" }}>
                  {t("No text blocks on this page yet.")}
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  {state.report.rows.map((row) => (
                    <li key={`${row.nodeId}:${row.prop}`}>
                      <RowLine
                        row={row}
                        onClick={onRowClick}
                        highlighted={row.nodeId === selectedNodeId}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </aside>
    </PortaledOverlay>
  );
}

function RowLine({
  row,
  onClick,
  highlighted = false,
}: {
  row: TranslationRow;
  onClick: (row: TranslationRow) => void;
  highlighted?: boolean;
}) {
  const { t } = useEditorLocale();
  return (
    <button
      type="button"
      onClick={() => onClick(row)}
      title={t(STATUS_META[row.status].label)}
      className="w-full cursor-pointer text-left"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "none",
        borderRadius: 8,
        background: highlighted ? "rgba(124,58,237,0.08)" : "transparent",
        padding: "6px 8px",
      }}
    >
      <StatusDot status={row.status} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 12,
          color: CHROME.text,
        }}
      >
        {row.label}
      </span>
      <span
        style={{
          flex: "none",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: CHROME.muted3,
        }}
      >
        {row.kind}
        {row.prop !== "text" ? ` · ${row.prop}` : ""}
      </span>
    </button>
  );
}
