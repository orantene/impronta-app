"use client";

/**
 * Talent builder top bar identity (talent surface only). The workspace builder
 * keeps its page picker; a talent has a single-page site, so the left cluster
 * shows a back arrow to the talent dashboard and an identity menu (avatar +
 * name) with the dashboard's own quick links. The talent screen provides
 * `TalentBuilderIdentityProvider`; with no provider the top bar is unchanged.
 */
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { Icon } from "@/components/admin/shell/internal/primitives/icons";
import { TALENT_PAGES, TALENT_PAGE_META } from "@/components/admin/shell/internal/state/fixtures";
import { talentPageToSegment } from "@/components/admin/shell/internal/state/talent-page-segment";
import { translateDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { TALENT_SIDEBAR_ICON } from "@/components/admin/shell/internal/talent-nav-icons";
import { loadTalentGoLiveAction } from "@/lib/talent-site/history/history-actions";

import { useMaybeEditContext } from "./edit-context";
import { CHROME } from "./kit/tokens";
import { PortaledOverlay } from "./kit/portaled-overlay";
import { useEditorLocale } from "./use-editor-locale";

export const TALENT_DASHBOARD_FALLBACK_HREF = "/talent/site";

export type TalentBuilderIdentity = {
  displayName: string | null;
  headshotUrl: string | null;
};

const IdentityContext = createContext<TalentBuilderIdentity | null>(null);

export function TalentBuilderIdentityProvider({
  value,
  children,
}: {
  value: TalentBuilderIdentity;
  children?: ReactNode;
}): ReactElement {
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

/** Non-null only inside the talent builder. */
export function useTalentBuilderIdentity(): TalentBuilderIdentity | null {
  return useContext(IdentityContext);
}

const COPY = {
  back: { en: "Back to my dashboard", es: "Volver a mi panel" },
  viewSite: { en: "View my site", es: "Ver mi sitio" },
  menu: { en: "My account menu", es: "Menú de mi cuenta" },
} as const;

/** The page the talent came from when it was a talent dashboard page, else the
 *  "My presence" screen. Never the builder itself. */
export function resolveTalentBackHref(referrer: string, origin: string): string {
  try {
    const url = new URL(referrer);
    if (url.origin === origin && /^\/talent(\/|$)/.test(url.pathname) && !url.pathname.startsWith("/talent/page-builder")) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    /* no usable referrer */
  }
  return TALENT_DASHBOARD_FALLBACK_HREF;
}

/** Dashboard main-menu entries, from the dashboard's own nav config. */
export function talentQuickLinks(locale: string): Array<{ page: string; href: string; label: string }> {
  return TALENT_PAGES.map((p) => ({
    page: p,
    href: `/talent/${talentPageToSegment(p)}`,
    label: translateDashboardText(TALENT_PAGE_META[p].label, locale),
  }));
}

const btn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 32,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: CHROME.text,
  cursor: "pointer",
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
} as const;

export function TalentBackLink(): ReactElement {
  const { locale } = useEditorLocale();
  const editCtx = useMaybeEditContext();
  const [href, setHref] = useState(TALENT_DASHBOARD_FALLBACK_HREF);
  useEffect(() => {
    setHref(resolveTalentBackHref(document.referrer, window.location.origin));
  }, []);
  const label = COPY.back[locale === "es" ? "es" : "en"];
  return (
    <a
      data-talent-builder-back
      href={href}
      title={label}
      aria-label={label}
      style={{ ...btn, width: 32, justifyContent: "center", textDecoration: "none" }}
      onClick={(e) => {
        // Full navigation so the dashboard shell remounts; flush edits first.
        e.preventDefault();
        const go = () => window.location.assign(href);
        if (!editCtx) return go();
        void editCtx.flushBuilderTreeSave().catch(() => undefined).finally(go);
      }}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </a>
  );
}

export function TalentAvatar({ name, url, size = 26 }: { name: string; url: string | null; size?: number }): ReactElement {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-talent-avatar src={url} alt="" width={size} height={size} style={{ borderRadius: "50%", objectFit: "cover" }} />
  ) : (
    <span
      data-talent-avatar
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: CHROME.chipInk,
        color: CHROME.surface,
        fontSize: 11,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {initials}
    </span>
  );
}

export function TalentIdentityMenu(): ReactElement | null {
  const identity = useTalentBuilderIdentity();
  const { locale } = useEditorLocale();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open || siteUrl) return;
    void loadTalentGoLiveAction()
      .then((res) => {
        if (res && res.ok) setSiteUrl(res.summary.siteUrl ?? null);
      })
      .catch(() => undefined);
  }, [open, siteUrl]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!identity) return null;
  const name = identity.displayName?.trim() || "";
  const item = {
    ...btn,
    width: "100%",
    padding: "0 12px",
    height: 34,
    fontWeight: 500,
    textDecoration: "none",
    borderRadius: 6,
  } as const;
  return (
    <>
      <button
        type="button"
        ref={trigger}
        data-talent-identity-trigger
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={COPY.menu[locale === "es" ? "es" : "en"]}
        style={{ ...btn, padding: "0 8px" }}
        onClick={() => {
          const r = trigger.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 4, left: r.left });
          setOpen((o) => !o);
        }}
      >
        <TalentAvatar name={name} url={identity.headshotUrl} />
        <span>{name}</span>
        <Icon name="chevron-down" size={12} stroke={2} />
      </button>
      <PortaledOverlay open={open}>
        <div className="fixed inset-0 z-[300]" onClick={() => setOpen(false)} aria-hidden />
        <div
          id={menuId}
          role="menu"
          data-talent-identity-menu
          className="fixed z-[301]"
          style={{
            top: pos.top,
            left: pos.left,
            minWidth: 220,
            padding: 6,
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px -8px rgba(0,0,0,0.18)",
          }}
        >
          {talentQuickLinks(locale).map((l) => (
            <a key={l.page} role="menuitem" data-talent-nav-link={l.page} href={l.href} style={item}>
              <Icon name={TALENT_SIDEBAR_ICON[l.page] ?? "home"} size={15} stroke={1.7} />
              {l.label}
            </a>
          ))}
          <div aria-hidden style={{ height: 1, margin: "6px 4px", background: CHROME.line }} />
          <a
            role="menuitem"
            data-talent-view-site
            href={siteUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            style={item}
            onClick={(e) => {
              if (siteUrl) return;
              e.preventDefault();
              void loadTalentGoLiveAction().then((res) => {
                const url = res && res.ok ? res.summary.siteUrl : null;
                if (url) window.open(url, "_blank", "noopener");
              });
            }}
          >
            <Icon name="external" size={15} stroke={1.7} />
            {COPY.viewSite[locale === "es" ? "es" : "en"]}
          </a>
        </div>
      </PortaledOverlay>
    </>
  );
}
