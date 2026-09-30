"use client";

/**
 * Talent site history in the Revisions drawer (theme releases Phase 2).
 *
 * The talent adapters' `loadRevisions` returns the SITE timeline (rows carry
 * `history`). This list renders it: "Published only" filter, and per entry
 * Preview (a read-only render of the snapshot over the canvas), Restore (to
 * the draft, a new entry; nothing is deleted) and, on theme updates, Undo this
 * update (reverse merge; later edits stay). EN + ES.
 */
import { useState } from "react";
import type { ReactElement } from "react";

import { CHROME, CHROME_RADII, CHROME_SHADOWS, PortaledOverlay } from "./kit";
import { useEditContext } from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";
import { getPageVersionSnapshot } from "./save-cycle-bridge";
import type { RevisionListRow } from "@/lib/site-admin/edit-mode/revisions-actions";
import { CHROME_COPY, pick } from "@/lib/talent-site/history/copy";
import { resolveExpectedDraftRev } from "@/lib/talent-site/history/draft-rev";
import { filterPublishedOnly } from "@/lib/talent-site/history/timeline";
import { undoTalentThemeUpdateAction } from "@/lib/talent-site/history/history-actions";

export function isTimelineRows(rows: ReadonlyArray<RevisionListRow> | null): boolean {
  return Boolean(rows && rows.length > 0 && rows.some((r) => r.history));
}

type Confirm = { id: string; action: "restore" | "undo" } | null;

function relative(iso: string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale === "es" ? "es" : "en", { numeric: "auto" });
  const min = Math.round(diff / 60_000);
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

const btn = (tone: "ghost" | "primary" | "danger", disabled = false) => ({
  height: 24,
  padding: "0 9px",
  fontSize: 10.5,
  fontWeight: 600,
  borderRadius: 6,
  cursor: disabled ? "not-allowed" : "pointer",
  color: tone === "primary" ? CHROME.surface : tone === "danger" ? CHROME.rose : CHROME.text,
  background: tone === "primary" ? CHROME.accent : tone === "danger" ? CHROME.roseBg : CHROME.paper,
  border: `1px solid ${tone === "primary" ? CHROME.accent : tone === "danger" ? CHROME.roseLine : CHROME.lineMid}`,
  opacity: disabled ? 0.6 : 1,
});

export function TalentHistoryList({
  rows,
  pendingId,
  onRestore,
  onDone,
}: {
  rows: RevisionListRow[];
  pendingId: string | null;
  onRestore: (row: RevisionListRow) => Promise<void>;
  onDone: () => void;
}): ReactElement {
  const { locale } = useEditorLocale();
  const { refreshComposition, reportMutationError } = useEditContext();
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copyOf = (k: keyof typeof CHROME_COPY) => pick(CHROME_COPY[k], locale);

  const shown = publishedOnly ? filterPublishedOnly(rows) : rows;
  const latestPublishId = rows.find((r) => r.history?.kind === "publish")?.id ?? null;

  async function undo(row: RevisionListRow): Promise<void> {
    if (busy) return;
    setBusy(row.id);
    setError(null);
    const res = await undoTalentThemeUpdateAction({
      entryId: row.id,
      expectedDraftRev: resolveExpectedDraftRev(getPageVersionSnapshot()),
    });
    setBusy(null);
    setConfirm(null);
    if (!res.ok) {
      setError(res.error);
      reportMutationError(res.error);
      return;
    }
    await refreshComposition();
    onDone();
  }

  return (
    <>
      <label
        className="mb-3 flex items-center gap-2"
        style={{ fontSize: 12, color: CHROME.text, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={publishedOnly}
          onChange={(e) => setPublishedOnly(e.target.checked)}
          data-history-published-only
        />
        {copyOf("publishedOnly")}
      </label>

      {error ? (
        <div
          role="alert"
          className="mb-3 rounded-md px-3 py-2"
          style={{ fontSize: 11.5, background: CHROME.roseBg, border: `1px solid ${CHROME.roseLine}`, color: CHROME.rose }}
        >
          {error}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-md px-3 py-6 text-center" style={{ fontSize: 12, color: CHROME.muted }}>
          {copyOf("empty")}
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" data-talent-history-list>
          {shown.map((row) => {
            const h = row.history!;
            const summary = locale === "es" ? h.summaryEs || h.summaryEn : h.summaryEn;
            const actor = h.actor === "tulala" ? copyOf("byTulala") : h.actor === "system" ? copyOf("bySystem") : copyOf("byTalent");
            const pending = pendingId === row.id || busy === row.id;
            const confirming = confirm?.id === row.id ? confirm.action : null;
            return (
              <li key={row.id}>
                <article
                  data-history-entry={h.kind}
                  className="flex flex-col gap-2"
                  style={{
                    background: CHROME.surface,
                    border: `1px solid ${CHROME.line}`,
                    borderRadius: CHROME_RADII.md,
                    boxShadow: CHROME_SHADOWS.card,
                    padding: "10px 12px",
                  }}
                >
                  <header className="flex items-center gap-2" style={{ fontSize: 10.5, color: CHROME.muted2 }}>
                    <span style={{ fontWeight: 700, color: h.kind === "publish" ? CHROME.green : CHROME.muted }}>
                      {actor}
                    </span>
                    {row.id === latestPublishId ? (
                      <span
                        className="rounded-full px-2 py-[1px]"
                        style={{ fontWeight: 700, color: CHROME.green, background: CHROME.greenBg, border: `1px solid ${CHROME.greenLine}` }}
                      >
                        {copyOf("live")}
                      </span>
                    ) : null}
                    <span className="ml-auto" title={new Date(row.createdAt).toLocaleString()}>
                      {relative(row.createdAt, locale)}
                    </span>
                  </header>
                  <div style={{ fontSize: 13, fontWeight: 600, color: CHROME.ink }}>
                    {summary}
                    {h.editCount > 1 ? (
                      <span style={{ fontSize: 11, fontWeight: 500, color: CHROME.muted2 }}> · {h.editCount}</span>
                    ) : null}
                  </div>

                  {confirming ? (
                    <div className="flex flex-col gap-2" style={{ fontSize: 11.5, color: CHROME.text }}>
                      <span>{copyOf(confirming === "undo" ? "undoConfirm" : "restoreConfirm")}</span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          disabled={pending}
                          style={btn("primary", pending)}
                          onClick={() => void (confirming === "undo" ? undo(row) : onRestore(row).then(() => setConfirm(null)))}
                        >
                          {copyOf(confirming === "undo" ? "undoUpdate" : "restore")}
                        </button>
                        <button type="button" disabled={pending} style={btn("ghost", pending)} onClick={() => setConfirm(null)}>
                          {copyOf("cancel")}
                        </button>
                      </span>
                    </div>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1">
                      {h.previewUrl ? (
                        <button type="button" style={btn("ghost")} onClick={() => setPreviewUrl(h.previewUrl)}>
                          {copyOf("preview")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={pending}
                        style={btn("ghost", pending)}
                        onClick={() => setConfirm({ id: row.id, action: "restore" })}
                      >
                        {copyOf("restore")}
                      </button>
                      {h.undoable ? (
                        <button
                          type="button"
                          disabled={pending}
                          style={btn("danger", pending)}
                          onClick={() => setConfirm({ id: row.id, action: "undo" })}
                          data-history-undo-update
                        >
                          {copyOf("undoUpdate")}
                        </button>
                      ) : null}
                    </span>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {previewUrl ? (
        <PortaledOverlay>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={copyOf("previewing")}
            data-history-preview
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 210,
              display: "flex",
              flexDirection: "column",
              background: CHROME.paper,
            }}
          >
            <div
              className="flex items-center gap-3"
              style={{ padding: "10px 16px", borderBottom: `1px solid ${CHROME.line}`, fontSize: 12.5, color: CHROME.text }}
            >
              <strong>{copyOf("previewing")}</strong>
              <span className="ml-auto" />
              <button type="button" style={btn("ghost")} onClick={() => setPreviewUrl(null)}>
                {copyOf("close")}
              </button>
            </div>
            {/* Read-only: the snapshot renders through the owner-gated public
                renderer; nothing in the frame can write the draft. */}
            <iframe title={copyOf("previewing")} src={previewUrl} style={{ flex: 1, border: 0, width: "100%" }} />
          </div>
        </PortaledOverlay>
      ) : null}
    </>
  );
}
