"use client";

/**
 * Redirects manager — the interactive half of `admin/website/redirects`.
 *
 * Everything is optimistic with rollback: an operator flipping ten redirects
 * off shouldn't wait on ten round trips, but a failure has to put the row back
 * exactly as it was and say why (the enable path can legitimately fail on the
 * unique index).
 *
 * Editing is inline rather than a modal. A redirect is two short strings and a
 * status; a dialog would be more chrome than content, and inline keeps the
 * neighbouring rows visible — which matters, because the row you're editing is
 * usually being pointed at something you can see two rows down.
 */

import { useCallback, useMemo, useState } from "react";

import {
  auditRedirects,
  matchesRedirectQuery,
  toRedirectsCsv,
  type RedirectRecord,
} from "@/lib/site-admin/redirects";

import {
  createRedirect,
  deleteRedirect,
  setRedirectActive,
  updateRedirect,
} from "./actions";
import { ImportPanel } from "./import-panel";
import {
  DraftCard,
  EmptyState,
  HowItWorks,
  Row,
  StatStrip,
  EMPTY_DRAFT,
  type Draft,
} from "./parts";
import { C, FONT, Btn, fieldStyle } from "./ui";

type Filter = "all" | "active" | "disabled" | "issues";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  active: "Active",
  disabled: "Disabled",
  issues: "Needs attention",
};

export function RedirectsClient({
  tenantSlug,
  initialRedirects,
  siteHost,
  loadError,
}: {
  tenantSlug: string;
  initialRedirects: RedirectRecord[];
  /** Public host, e.g. `impronta.tulala.digital`. "" when none is live yet. */
  siteHost: string;
  loadError: string | null;
}) {
  const [rows, setRows] = useState<RedirectRecord[]>(initialRedirects);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [banner, setBanner] = useState<{ tone: "error" | "ok"; text: string } | null>(
    loadError ? { tone: "error", text: loadError } : null,
  );

  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Draft>(EMPTY_DRAFT);
  const [addBusy, setAddBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editBusy, setEditBusy] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const issues = useMemo(() => auditRedirects(rows), [rows]);
  const issueCount = issues.size;
  const activeCount = rows.filter((r) => r.active).length;

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (!matchesRedirectQuery(row, query)) return false;
      if (filter === "active") return row.active;
      if (filter === "disabled") return !row.active;
      if (filter === "issues") return issues.has(row.id);
      return true;
    });
  }, [rows, query, filter, issues]);

  const say = useCallback((tone: "error" | "ok", text: string) => {
    setBanner({ tone, text });
  }, []);

  // ── mutations ──────────────────────────────────────────────────────────────

  const submitAdd = useCallback(async () => {
    if (addBusy) return;
    setAddBusy(true);
    const res = await createRedirect(tenantSlug, addDraft);
    setAddBusy(false);
    if (!res.ok) {
      say("error", res.error);
      return;
    }
    setRows((prev) => [res.redirect, ...prev]);
    setAddDraft(EMPTY_DRAFT);
    setAdding(false);
    say("ok", `Redirect added. ${res.redirect.oldPath} now sends visitors to ${res.redirect.newPath}.`);
  }, [addBusy, addDraft, say, tenantSlug]);

  const submitEdit = useCallback(async () => {
    if (editBusy || !editingId) return;
    setEditBusy(true);
    const res = await updateRedirect(tenantSlug, { id: editingId, ...editDraft });
    setEditBusy(false);
    if (!res.ok) {
      say("error", res.error);
      return;
    }
    const saved = res.redirect;
    setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
    setEditingId(null);
    say("ok", "Redirect updated.");
  }, [editBusy, editDraft, editingId, say, tenantSlug]);

  const toggleActive = useCallback(
    async (row: RedirectRecord) => {
      const next = !row.active;
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: next } : r)));
      const res = await setRedirectActive(tenantSlug, { id: row.id, active: next });
      if (!res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, active: row.active } : r)),
        );
        say("error", res.error);
      }
    },
    [say, tenantSlug],
  );

  const removeRow = useCallback(
    async (row: RedirectRecord) => {
      setConfirmDeleteId(null);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      const res = await deleteRedirect(tenantSlug, { id: row.id });
      if (!res.ok) {
        setRows((prev) => [row, ...prev]);
        say("error", res.error);
        return;
      }
      say("ok", `Deleted the redirect from ${row.oldPath}.`);
    },
    [say, tenantSlug],
  );

  const onImported = useCallback(
    (created: RedirectRecord[], failures: number) => {
      if (created.length > 0) setRows((prev) => [...created, ...prev]);
      // Leave the panel open when something was rejected — it's showing which
      // lines and why, and closing it would throw that away.
      setImportOpen(failures > 0);
      say(
        failures > 0 ? "error" : "ok",
        failures > 0
          ? `Imported ${created.length}. ${failures} could not be added — see the details above.`
          : `Imported ${created.length} redirect${created.length === 1 ? "" : "s"}.`,
      );
    },
    [say],
  );

  const exportCsv = useCallback(() => {
    const blob = new Blob([toRedirectsCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tenantSlug}-redirects.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, tenantSlug]);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT }}>
      <StatStrip
        total={rows.length}
        active={activeCount}
        issues={issueCount}
        onShowIssues={() => setFilter("issues")}
      />

      {banner && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 12.5,
            background: banner.tone === "error" ? C.redSoft : C.greenSoft,
            color: banner.tone === "error" ? C.red : C.green,
            border: `1px solid ${banner.tone === "error" ? "rgba(155,28,28,0.18)" : "rgba(46,125,91,0.18)"}`,
          }}
        >
          <span style={{ flex: 1 }}>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search paths…"
          style={{ ...fieldStyle, width: 220, fontFamily: FONT }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => {
            const on = filter === key;
            const count =
              key === "all"
                ? rows.length
                : key === "active"
                  ? activeCount
                  : key === "disabled"
                    ? rows.length - activeCount
                    : issueCount;
            if (key === "issues" && count === 0) return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                style={{
                  padding: "6px 11px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: on ? 700 : 500,
                  cursor: "pointer",
                  border: `1px solid ${on ? C.ink : C.border}`,
                  background: on ? C.ink : "#fff",
                  color: on ? "#fff" : key === "issues" ? C.amber : C.inkMuted,
                  fontFamily: FONT,
                }}
              >
                {FILTER_LABELS[key]} <span style={{ opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn onClick={() => setImportOpen((v) => !v)}>Import</Btn>
          <Btn onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Btn>
          <Btn
            variant="primary"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
          >
            New redirect
          </Btn>
        </div>
      </div>

      {importOpen && (
        <ImportPanel
          tenantSlug={tenantSlug}
          onClose={() => setImportOpen(false)}
          onImported={onImported}
        />
      )}

      {/* Add form */}
      {adding && (
        <DraftCard
          title="New redirect"
          draft={addDraft}
          busy={addBusy}
          siteHost={siteHost}
          submitLabel="Add redirect"
          onChange={setAddDraft}
          onSubmit={submitAdd}
          onCancel={() => {
            setAdding(false);
            setAddDraft(EMPTY_DRAFT);
          }}
        />
      )}

      {/* Table */}
      <div
        style={{
          background: "#fff",
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {visible.length === 0 ? (
          <EmptyState
            hasAny={rows.length > 0}
            onAdd={() => setAdding(true)}
            onClear={() => {
              setQuery("");
              setFilter("all");
            }}
          />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  background: C.surface,
                  color: C.inkMuted,
                  textTransform: "uppercase",
                  fontSize: 10.5,
                  letterSpacing: 0.6,
                }}
              >
                <th style={{ textAlign: "left", padding: "10px 14px", width: "46%" }}>Redirect</th>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>Type</th>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>State</th>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>Updated</th>
                <th style={{ textAlign: "right", padding: "10px 14px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) =>
                editingId === row.id ? (
                  <tr key={row.id}>
                    <td colSpan={5} style={{ padding: 14, borderTop: `1px solid ${C.borderSoft}`, background: C.surface }}>
                      <DraftCard
                        title={`Editing ${row.oldPath}`}
                        draft={editDraft}
                        busy={editBusy}
                        siteHost={siteHost}
                        submitLabel="Save changes"
                        embedded
                        onChange={setEditDraft}
                        onSubmit={submitEdit}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <Row
                    key={row.id}
                    row={row}
                    issues={issues.get(row.id) ?? []}
                    siteHost={siteHost}
                    confirming={confirmDeleteId === row.id}
                    onEdit={() => {
                      setAdding(false);
                      setEditingId(row.id);
                      setEditDraft({
                        oldPath: row.oldPath,
                        newPath: row.newPath,
                        statusCode: row.statusCode === 302 ? 302 : 301,
                      });
                    }}
                    onToggle={() => void toggleActive(row)}
                    onAskDelete={() => setConfirmDeleteId(row.id)}
                    onCancelDelete={() => setConfirmDeleteId(null)}
                    onConfirmDelete={() => void removeRow(row)}
                  />
                ),
              )}
            </tbody>
          </table>
        )}
      </div>

      <HowItWorks siteHost={siteHost} />
    </div>
  );
}
