"use client";

/**
 * ShellEditConfirm — "the header lives on its own page" hand-off dialog.
 *
 * WHY: the Structure panel lists "Site header" / "Site footer" on every
 * storefront page, but on a freeform page those rows pointed at a node id
 * that only exists on the SHELL surface's own tree (`__site_shell__`), so
 * clicking them selected nothing — a dead click the owner hit live
 * (2026-08-20). The shell IS a separate page by design: header + footer are
 * shared across the whole site and edit on their own surface.
 *
 * So instead of a silent no-op, the row now explains and offers the jump:
 * "Edit the site header? It is shared by every page and opens in its own
 * editor." Confirm navigates to `<base>/p/__site_shell__?edit=1`.
 *
 * Availability is a SERVER answer (`isSiteShellSurfaceAvailableAction`):
 * the ENABLE_SITE_SHELL_EDIT flag must not leak into the client bundle, and
 * with the flag off the shell URL 404s. The dialog checks on open and keeps
 * the confirm button disabled until the server says the link will resolve —
 * a disabled button with an explanation beats a button that 404s.
 */

import { useEffect, useState } from "react";

import { PortaledOverlay } from "./kit/portaled-overlay";
import { CHROME, CHROME_RADII } from "./kit/tokens";
import { useEditorLocale } from "./use-editor-locale";
import { isSiteShellSurfaceAvailableAction } from "@/lib/site-admin/site-shell-surface-availability";

/**
 * Derive the shell-editor path from the CURRENT builder pathname, keeping
 * whatever storefront base the operator is on:
 *   /w/impronta            -> /w/impronta/p/__site_shell__
 *   /w/impronta/p/about    -> /w/impronta/p/__site_shell__
 *   /es/w/impronta/p/about -> /es/w/impronta/p/__site_shell__
 *   /p/about  (custom host)-> /p/__site_shell__
 *   /         (custom host)-> /p/__site_shell__
 * Pure and exported for the unit test.
 */
export function buildShellEditorPathFromPathname(pathname: string): string {
  const clean = pathname.split("?")[0] ?? "/";
  const pIndex = clean.indexOf("/p/");
  const base = pIndex >= 0 ? clean.slice(0, pIndex) : clean === "/" ? "" : clean.replace(/\/$/, "");
  return `${base}/p/__site_shell__?edit=1`;
}

export function ShellEditConfirm({
  kind,
  onClose,
}: {
  kind: "site_header" | "site_footer";
  onClose: () => void;
}) {
  const { t } = useEditorLocale();
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isSiteShellSurfaceAvailableAction()
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const title =
    kind === "site_header" ? t("Edit the site header?") : t("Edit the site footer?");

  return (
    <PortaledOverlay>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 158, background: "rgba(0,0,0,0.28)" }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          top: "38%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 360,
          zIndex: 159,
          background: CHROME.paper,
          border: `1px solid ${CHROME.line}`,
          borderRadius: CHROME_RADII.xl,
          boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: CHROME.text, marginBottom: 6 }}>
          {title}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: CHROME.muted }}>
          {t(
            "The header and footer are shared by every page of your site, so they edit on their own page. Your work here is saved automatically.",
          )}
        </p>
        {available === false ? (
          <p
            role="alert"
            style={{ margin: "8px 0 0", fontSize: 11.5, lineHeight: 1.45, color: CHROME.amber }}
          >
            {t("The shell editor isn't enabled for this workspace yet.")}
          </p>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${CHROME.lineStrong}`,
              borderRadius: 10,
              padding: "7px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              color: CHROME.text,
              cursor: "pointer",
            }}
          >
            {t("Stay here")}
          </button>
          <button
            type="button"
            disabled={available !== true}
            onClick={() => {
              window.location.assign(
                buildShellEditorPathFromPathname(window.location.pathname),
              );
            }}
            style={{
              background: available === true ? CHROME.accent : CHROME.muted3,
              border: "none",
              borderRadius: 10,
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              color: "#ffffff",
              cursor: available === true ? "pointer" : "not-allowed",
            }}
          >
            {available === null ? t("Checking…") : t("Open the shell editor")}
          </button>
        </div>
      </div>
    </PortaledOverlay>
  );
}
