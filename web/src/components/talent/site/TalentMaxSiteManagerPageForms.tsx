"use client";

/**
 * ONB-4 — Inline page CRUD forms for TalentMaxSiteManager's PagesPanel.
 *
 * Extracted to keep TalentMaxSiteManager.tsx under the 800-line ESLint cap.
 * These components replace window.prompt / window.confirm with styled inline
 * forms that show a live slug preview as the operator types.
 */

import { useEffect, useRef, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { LocaleField } from "@/components/admin/shell/internal/primitives/locale-field";
import { COLORS } from "@/components/admin/shell/internal/state";
import { useTalentFieldLocales } from "@/components/locale-field/use-talent-field-locales";
import { orderLocales } from "@/lib/i18n/locale-field-model";
import {
  loadMaxSitePageTextAction,
  saveMaxSitePageTextAction,
  type MaxSitePageText,
} from "@/lib/talent-site/server/page-text-i18n-actions";
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

/**
 * Inline rename with live /t/site/<siteSlug>/<pageSlug> preview. PR 7: the
 * title (and, with the SEO capability, SEO title + meta description) is edited
 * per talent language; the maps save through `saveMaxSitePageTextAction`, then
 * the primary title flows through the existing rename (`onSave`).
 */
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
  const copy = useDashboardText();
  const store = useTalentFieldLocales();
  const [text, setText] = useState<MaxSitePageText | null>(null);
  const [title, setTitle] = useState<Record<string, string>>({ [store.primary]: page.title });
  const [metaTitle, setMetaTitle] = useState<Record<string, string>>({});
  const [metaDescription, setMetaDescription] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadMaxSitePageTextAction({ pageId: page.id }).then((res) => {
      if (!live || !res.ok || !res.data) return;
      setText(res.data);
      setTitle(res.data.title);
      setMetaTitle(res.data.metaTitle);
      setMetaDescription(res.data.metaDescription);
    });
    return () => {
      live = false;
    };
  }, [page.id]);

  const primary = text?.primary ?? store.primary;
  const locales = orderLocales(primary, store.locales);
  const primaryTitle = (title[primary] ?? "").trim();
  const previewSlug = page.isHome ? "" : slugifyPageTitle(primaryTitle);

  async function submit() {
    if (!primaryTitle || busy) return;
    setBusy(true);
    setError(null);
    if (text) {
      const res = await saveMaxSitePageTextAction({
        pageId: page.id,
        title,
        ...(text.seoAllowed ? { metaTitle, metaDescription } : {}),
      });
      if (!res.ok) {
        setBusy(false);
        setError(res.error);
        return;
      }
    }
    setBusy(false);
    onSave(primaryTitle, primaryTitle);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      style={{ padding: "10px 12px", border: `1.5px solid ${COLORS.accent}`, borderRadius: 10, background: COLORS.card, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <LocaleField
        label={copy.t("Page title")}
        value={title}
        locales={locales}
        primary={primary}
        ai={{ field: "page_title" }}
        maxLength={120}
        onChange={(l, v) => setTitle((m) => ({ ...m, [l]: v }))}
      />
      {!page.isHome ? (
        <p style={{ margin: 0, fontSize: 10.5, color: COLORS.inkMuted }}>
          Path preview: /t/site/{siteSlug ?? "…"}/{previewSlug || "…"}
        </p>
      ) : null}
      {text?.seoAllowed ? (
        <>
          <LocaleField
            label={copy.t("SEO title")}
            hint={copy.t("Shown in search results and link previews.")}
            value={metaTitle}
            locales={locales}
            primary={primary}
            ai={{ field: "seo_title" }}
            maxLength={70}
            onChange={(l, v) => setMetaTitle((m) => ({ ...m, [l]: v }))}
          />
          <LocaleField
            label={copy.t("Meta description")}
            value={metaDescription}
            locales={locales}
            primary={primary}
            ai={{ field: "seo_description" }}
            maxLength={170}
            multiline
            rows={2}
            onChange={(l, v) => setMetaDescription((m) => ({ ...m, [l]: v }))}
          />
        </>
      ) : null}
      {error ? <p style={{ margin: 0, fontSize: 11.5, color: COLORS.red }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="submit"
          disabled={!primaryTitle || busy}
          style={{ ...miniBtn, background: COLORS.accent, color: COLORS.card, border: "none" }}
        >
          {copy.t("Save")}
        </button>
        <button type="button" onClick={onCancel} style={miniBtn}>{copy.t("Cancel")}</button>
      </div>
    </form>
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
