"use client";

/**
 * ONB-4 — Inline page CRUD forms for TalentMaxSiteManager's PagesPanel.
 *
 * Extracted to keep TalentMaxSiteManager.tsx under the 800-line ESLint cap.
 * These components replace window.prompt / window.confirm with styled inline
 * forms that show a live slug preview as the operator types.
 */

import { useEffect, useRef, useState } from "react";

import { COLORS } from "@/components/admin/shell/internal/state";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";

// ── Shared style atoms ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  flex: "1 1 160px",
  minWidth: 140,
  padding: "7px 10px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  fontSize: 13,
  color: COLORS.ink,
};

const miniBtn: React.CSSProperties = {
  padding: "5px 9px",
  borderRadius: 7,
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.ink,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

// ── Slug derivation (mirrors slugifyPageName on the server) ───────────────────

/**
 * Pure client-side slug preview. Mirrors `slugifyPageName` in
 * site-page-management-core.ts so the preview is accurate as the operator
 * types, without a network round-trip.
 */
export function slugifyPageTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// ── PageRenameForm ────────────────────────────────────────────────────────────

/** Inline rename with live /t/site/<siteSlug>/<pageSlug> preview. */
export function PageRenameForm({
  page,
  siteSlug,
  onSave,
  onCancel,
}: {
  page: MaxSiteManagerPage;
  siteSlug: string | null;
  onSave: (title: string, navLabel: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); titleRef.current?.select(); }, []);

  const previewSlug = page.isHome ? "" : slugifyPageTitle(title);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { onSave(title.trim(), title.trim()); }
    if (e.key === "Escape") { onCancel(); }
  }

  return (
    <div style={{ padding: "10px 12px", border: `1.5px solid ${COLORS.accent}`, borderRadius: 10, background: "#fff" }}>
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Page title"
        style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
      />
      {!page.isHome ? (
        <p style={{ margin: "0 0 8px", fontSize: 10.5, color: COLORS.inkMuted }}>
          Path preview: /t/site/{siteSlug ?? "…"}/{previewSlug || "…"}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => onSave(title.trim(), title.trim())}
          disabled={!title.trim()}
          style={{ ...miniBtn, background: COLORS.accent, color: "#fff", border: "none" }}
        >
          Save
        </button>
        <button type="button" onClick={onCancel} style={miniBtn}>Cancel</button>
      </div>
    </div>
  );
}

// ── PageDeleteConfirm ─────────────────────────────────────────────────────────

/** Styled inline delete confirm — no window.confirm. */
export function PageDeleteConfirm({
  page,
  onConfirm,
  onCancel,
}: {
  page: MaxSiteManagerPage;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ padding: "10px 12px", border: `1.5px solid ${COLORS.criticalDeep}`, borderRadius: 10, background: "rgba(176,48,58,0.04)" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: COLORS.ink }}>
        Delete <strong>{page.title}</strong>? This can&rsquo;t be undone.
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={onConfirm}
          style={{ ...miniBtn, background: COLORS.criticalDeep, color: "#fff", border: "none" }}
        >
          Delete page
        </button>
        <button type="button" onClick={onCancel} style={miniBtn}>Cancel</button>
      </div>
    </div>
  );
}

// ── PageAddForm ───────────────────────────────────────────────────────────────

/** Inline add-page form with live slug preview. Replaces window.prompt. */
export function PageAddForm({
  siteSlug,
  onSave,
  onCancel,
}: {
  siteSlug: string | null;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  const previewSlug = slugifyPageTitle(title);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { if (title.trim()) onSave(title.trim()); }
    if (e.key === "Escape") { onCancel(); }
  }

  return (
    <div style={{ padding: "10px 12px", border: `1.5px solid ${COLORS.accent}`, borderRadius: 10, background: "#fff", marginBottom: 6 }}>
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="New page title"
        style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
      />
      {title.trim() ? (
        <p style={{ margin: "0 0 8px", fontSize: 10.5, color: COLORS.inkMuted }}>
          Path preview: /t/site/{siteSlug ?? "…"}/{previewSlug || "…"}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => { if (title.trim()) onSave(title.trim()); }}
          disabled={!title.trim()}
          style={{ ...miniBtn, background: COLORS.accent, color: "#fff", border: "none" }}
        >
          Add page
        </button>
        <button type="button" onClick={onCancel} style={miniBtn}>Cancel</button>
      </div>
    </div>
  );
}
