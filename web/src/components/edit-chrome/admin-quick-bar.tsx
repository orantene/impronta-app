"use client";

/**
 * AdminQuickBar — the thin "you are signed in here" strip across the top of a
 * tenant's own live storefront.
 *
 * Who sees it: only someone the server already proved is a credentialed member
 * of THIS tenant. The mount (`EditChromeMount`) resolves the host's tenant and
 * checks `agency.site_admin.pages.edit` against it, so a member of tenant A
 * never sees this on tenant B's site, and a signed-out visitor never sees it at
 * all. This component adds no authorization of its own; it is pure chrome over
 * a decision already made server-side.
 *
 * Why a bar and not more floating buttons: the storefront already carries a
 * bottom-right Edit pill. The operator's other errands (open the workspace,
 * jump to Messages, check the roster) had no route from the public site short
 * of hand-typing an admin URL. A single strip answers "where am I, and how do
 * I get back to work" without competing with the page's own design.
 *
 * Rules it respects:
 *   - It never renders in edit mode. The editor has its own topbar; two bars
 *     stacked would be noise, and the editor already offers these links.
 *   - It offsets the document instead of covering it. The storefront's own
 *     sticky header moves down by exactly the bar's height, so nothing the
 *     tenant designed is hidden behind it.
 *   - It is dismissible, and the choice sticks per tenant. An operator
 *     reviewing their live site should be able to see it exactly as a visitor
 *     does; a bar you cannot turn off is a bar that lies about the design.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useEditorLocale } from "./use-editor-locale";
import { resolveWorkspaceAdminBase } from "./workspace-admin-base";

/** Matches the storefront header offset applied while the bar is visible. */
export const ADMIN_QUICK_BAR_H = 34;

const DISMISS_KEY_PREFIX = "tulala:admin-quick-bar:hidden:";

/**
 * Workspace destinations, in the order an operator actually reaches for them.
 * Every href is a real route under `[tenantSlug]/admin/` — the same set the
 * editor topbar's Workspace menu uses, kept deliberately identical so the two
 * surfaces never drift into offering different answers.
 */
const QUICK_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "", label: "Dashboard" },
  { href: "/messages", label: "Messages" },
  { href: "/roster", label: "Roster" },
  { href: "/calendar", label: "Calendar" },
  { href: "/media", label: "Media" },
  { href: "/site", label: "Website" },
];

interface AdminQuickBarProps {
  /**
   * Workspace slug for admin links. Null on hub hosts and on tenants without a
   * slug, where every link would 404: the bar renders its label and the edit
   * action, and simply omits the workspace jumps.
   */
  workspaceSlug: string | null;
  /** The tenant's own site name, so the bar says whose site this is. */
  siteLabel: string | null;
}

export function AdminQuickBar({ workspaceSlug, siteLabel }: AdminQuickBarProps) {
  const { t } = useEditorLocale();
  const [hidden, setHidden] = useState(true); // assume hidden until storage says otherwise
  const [ready, setReady] = useState(false);

  const storageKey = useMemo(
    () => `${DISMISS_KEY_PREFIX}${workspaceSlug ?? "host"}`,
    [workspaceSlug],
  );

  // Read the dismissal AFTER mount: this component renders inside a server-
  // rendered storefront, so touching localStorage during render would produce a
  // hydration mismatch on the tenant's public page.
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(storageKey) === "1";
    } catch {
      /* private mode / storage disabled: show the bar */
    }
    setHidden(dismissed);
    setReady(true);
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setHidden(true);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* the bar still hides for this page view */
    }
  }, [storageKey]);

  const adminBase = useMemo(() => {
    if (!workspaceSlug) return null;
    if (typeof window === "undefined") return `/${workspaceSlug}/admin`;
    return resolveWorkspaceAdminBase(workspaceSlug, window.location.pathname);
  }, [workspaceSlug]);

  if (!ready || hidden) return null;

  return (
    <>
      {/* Push the document down instead of covering it, and move the tenant's
          own sticky header below the bar so their design stays fully visible. */}
      <style>{`
        body { padding-top: ${ADMIN_QUICK_BAR_H}px !important; }
        header[data-public-header] { top: ${ADMIN_QUICK_BAR_H}px !important; }
      `}</style>
      <div
        data-admin-quick-bar
        role="region"
        aria-label={t("Workspace quick actions")}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: ADMIN_QUICK_BAR_H,
          zIndex: 2147483000,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 10px",
          background: "#16161c",
          color: "#e9e9f0",
          fontFamily:
            '"Avenir Next", "Seravek", "Helvetica Neue", Arial, sans-serif',
          fontSize: 12,
          lineHeight: 1,
          boxShadow: "0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 600,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "34vw",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "#8f80f2",
              flex: "0 0 auto",
            }}
          />
          {siteLabel
            ? t("Signed in to {site}").replace("{site}", siteLabel)
            : t("Signed in to your workspace")}
        </span>

        {adminBase ? (
          <nav
            aria-label={t("Workspace quick links")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              minWidth: 0,
              overflowX: "auto",
            }}
          >
            {QUICK_LINKS.map((item) => (
              <a
                key={item.href || "dashboard"}
                href={`${adminBase}${item.href}`}
                style={{
                  color: "#b3b3c0",
                  textDecoration: "none",
                  padding: "5px 8px",
                  borderRadius: 6,
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "#e9e9f0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#b3b3c0";
                }}
              >
                {t(item.label)}
              </a>
            ))}
          </nav>
        ) : null}

        <span style={{ flex: "1 1 auto" }} />

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("Hide this bar")}
          title={t("Hide this bar. It comes back next time you sign in.")}
          style={{
            appearance: "none",
            border: "none",
            background: "transparent",
            color: "#787886",
            cursor: "pointer",
            padding: "5px 7px",
            borderRadius: 6,
            fontSize: 14,
            lineHeight: 1,
            flex: "0 0 auto",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "#e9e9f0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#787886";
          }}
        >
          ✕
        </button>
      </div>
    </>
  );
}
