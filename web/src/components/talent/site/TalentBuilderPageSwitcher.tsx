"use client";

/**
 * TalentBuilderPageSwitcher — the in-editor page selector for the multi-page
 * Talent Max Site builder. Lives in the builder's exit bar.
 *
 * Lets the talent:
 *   - see every page of their site + which one they're editing,
 *   - switch to another page (router push to `/talent/page-builder?page=<slug>`),
 *   - ADD a page (then jump straight into editing it), and
 *   - jump to the SHELL editor (`?shell=1`) or back to the `/talent/site` manager.
 *
 * RENAME / DELETE / REORDER / SET-HOME live on the `/talent/site` dashboard
 * (richer surface); the switcher keeps the in-editor chrome lean — the talent
 * adds + switches pages here, and manages the structure on the dashboard.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CHROME } from "@/components/edit-chrome/kit/tokens";
import { addMaxSitePageAction } from "@/lib/talent-site/server/site-management-actions";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";

type Props = {
  pages: MaxSiteManagerPage[];
  /** The slug currently open in the editor, or "__shell__" for the shell. */
  currentSlug: string;
};

export function TalentBuilderPageSwitcher({ pages, currentSlug }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, startAdd] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sorted = [...pages].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug),
  );
  const isShell = currentSlug === "__shell__";
  const current = sorted.find((p) => p.slug === currentSlug);
  const label = isShell ? "Site shell" : current?.navLabel || current?.title || current?.slug || "Page";

  function goToPage(slug: string) {
    setOpen(false);
    router.push(`/talent/page-builder?page=${encodeURIComponent(slug)}`);
  }

  function goToShell() {
    setOpen(false);
    router.push(`/talent/page-builder?shell=1`);
  }

  function handleAdd() {
    setError(null);
    const title = window.prompt("New page title");
    if (!title || !title.trim()) return;
    startAdd(async () => {
      const result = await addMaxSitePageAction({ title: title.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data) goToPage(result.data.slug);
    });
  }

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 12px",
          borderRadius: 8,
          border: `1px solid ${CHROME.controlBorder}`,
          background: CHROME.controlFill,
          color: CHROME.text,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          maxWidth: 220,
        }}
      >
        <span aria-hidden>{isShell ? "▦" : "▤"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span aria-hidden style={{ opacity: 0.6 }}>▾</span>
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 60,
            minWidth: 240,
            maxHeight: 360,
            overflowY: "auto",
            background: CHROME.paper,
            border: `1px solid ${CHROME.line}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px -12px rgba(0,0,0,0.25)",
            padding: 6,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: CHROME.muted,
              padding: "6px 8px 4px",
            }}
          >
            Pages
          </div>
          {sorted.map((p) => {
            const active = !isShell && p.slug === currentSlug;
            return (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                onClick={() => goToPage(p.slug)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "7px 8px",
                  borderRadius: 7,
                  border: "none",
                  background: active ? CHROME.greenBg : "transparent",
                  color: CHROME.text,
                  fontSize: 12.5,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.navLabel || p.title || p.slug}
                </span>
                {p.isHome ? (
                  <span style={{ fontSize: 10, color: CHROME.muted, fontWeight: 600 }}>Home</span>
                ) : null}
              </button>
            );
          })}

          <div style={{ height: 1, background: CHROME.line, margin: "6px 4px" }} />

          <button
            type="button"
            role="menuitem"
            onClick={handleAdd}
            disabled={adding}
            style={menuActionStyle}
          >
            {adding ? "Adding…" : "＋ Add page"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={goToShell}
            style={{ ...menuActionStyle, fontWeight: isShell ? 700 : 500, background: isShell ? CHROME.greenBg : "transparent" }}
          >
            ▦ Edit site shell
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => router.push("/talent/site")}
            style={menuActionStyle}
          >
            ⚙ Manage site
          </button>
          {error ? (
            <p style={{ margin: "6px 8px 2px", fontSize: 11.5, color: CHROME.rose }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const menuActionStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "7px 8px",
  borderRadius: 7,
  border: "none",
  background: "transparent",
  color: CHROME.text,
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
  textAlign: "left",
};
