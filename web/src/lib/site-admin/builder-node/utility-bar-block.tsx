/**
 * Utility bar (Gridline `.gl-top`): the dark sticky header of an on-call trade.
 * Logo tile + name (always an `<a>` to site home via `homeHref`), mono subtitle,
 * an emergencies status pill, an optional action (desktop) and a tap-to-call
 * button.
 *
 * The status flag arrives as `liveStatus` (G3b `dataSources.liveStatus`, absent
 * = off). Off renders only the off pill; on renders the on pill marked
 * `data-live-when="on"` plus the off pill marked `data-live-when="off"`, so the
 * expiry island can flip the page at midnight without a reload. The call button exists only when a
 * `tel:` href was supplied (the talent's opt-in public number, G4); there is
 * no fallback to any private number. Token colours only, 44px targets, the
 * pulse stops under reduced motion.
 */
import type { CSSProperties, ReactNode } from "react";

import { languageToggleGroupLabel } from "@/i18n/language-toggle-label";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import type { LiveStatusRenderContext } from "@/lib/talent/live-status-render";

import { anchorIdAttrs } from "./anchor-id";
import { HEADER_LOGO_LIMITS } from "../header-logo-limits";
import type { BuilderUtilityBarNode } from "./types";

export const UTILITY_BAR_CSS = `
/* TUL-532 / GRK-073: ≥16px phone side padding so the name never sits on the edge. */
.sb-ub{container:sbub/inline-size;position:sticky;top:0;z-index:7;display:flex;align-items:center;gap:10px;padding:10px 16px;box-sizing:border-box;width:100%;background:var(--token-color-ink);color:var(--token-color-background);border-bottom:1px solid color-mix(in srgb,var(--token-color-background) 10%,transparent)}
.sb-ub-brand{display:flex;align-items:center;gap:10px;flex:1;min-width:0;color:inherit;text-decoration:none}
.sb-ub-logo{flex:0 0 auto;width:36px;height:36px;border-radius:6px;background:var(--token-color-accent,var(--token-color-primary));color:var(--token-color-on-accent,var(--token-color-ink));display:grid;place-items:center;overflow:hidden;font-weight:800;font-size:15px}
.sb-ub-logo img{width:100%;height:100%;object-fit:cover;display:block}
/* TUL-532: an owner logo keeps its proportions (a wordmark was cropped to a 36px square) and sits
   on the site background it was made for, not the accent (accent = ink on some themes). */
.sb-ub-logo[data-logo-img]{width:auto;max-width:min(160px,40cqi);padding:0 6px;box-sizing:border-box;background:var(--token-color-background)}
.sb-ub-logo[data-logo-img] img{width:auto;max-width:100%;height:100%;min-height:${HEADER_LOGO_LIMITS.minHeightPx}px;object-fit:contain}
.sb-ub-nm{flex:1;min-width:0;line-height:1.1}
.sb-ub-nm b{display:block;font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* TUL-474: trade · city wraps 2 lines on phone instead of cutting mid-word (Monterr…). */
.sb-ub-nm small{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;margin-top:2px;font:500 10.5px/1.25 var(--site-mono-font,ui-monospace,monospace);opacity:.7;letter-spacing:.02em;overflow:hidden;overflow-wrap:anywhere;white-space:normal}
.sb-ub-pill{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border-radius:99px;background:color-mix(in srgb,var(--token-color-background) 10%,transparent);color:var(--token-color-background);font-size:12px;font-weight:700;white-space:nowrap;box-sizing:border-box}
.sb-ub-pill i{width:8px;height:8px;border-radius:50%;background:color-mix(in srgb,var(--token-color-background) 45%,transparent);flex:0 0 auto}
.sb-ub-pill[data-on="true"]{background:color-mix(in srgb,var(--token-color-accent,var(--token-color-primary)) 16%,transparent);color:var(--token-color-accent,var(--token-color-primary))}
.sb-ub-pill[data-on="true"] i{background:var(--token-color-accent,var(--token-color-primary));animation:sbUbPulse 1.8s infinite}
@keyframes sbUbPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--token-color-accent,var(--token-color-primary)) 55%,transparent)}70%,100%{box-shadow:0 0 0 7px transparent}}
@media (prefers-reduced-motion:reduce){.sb-ub-pill i{animation:none!important}}
/* TUL-496: phone header keeps the visit CTA (was desktop-only). */
.sb-ub-cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border-radius:6px;background:var(--token-color-accent,var(--token-color-primary));color:var(--token-color-on-accent,var(--token-color-ink));font-weight:700;font-size:13px;text-decoration:none;white-space:nowrap;flex:0 0 auto}
/* TUL-547: with no on-accent token the label fell back to ink, and on a theme whose accent IS
   ink (karla) the CTA read ink-on-ink inside an ink bar. Label from the accent's own lightness;
   the ring keeps the button's edge visible when the accent matches the bar. */
.sb-ub-cta,.sb-ub-logo{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--token-color-background) 30%,transparent)}
@supports (color:oklch(from red l c h)){.sb-ub-cta,.sb-ub-logo{color:var(--token-color-on-accent,oklch(from var(--token-color-accent,var(--token-color-primary)) clamp(0,(0.62 - l) * 1000,1) 0 0))}}
.sb-ub-tel{flex:0 0 auto;width:44px;height:44px;border-radius:99px;border:1.5px solid color-mix(in srgb,var(--token-color-background) 28%,transparent);color:var(--token-color-background);display:grid;place-items:center;text-decoration:none;box-sizing:border-box}
.sb-ub-tel svg{width:18px;height:18px}
/* TUL-474/496: never hide only the pill label (left a stray status dot). Drop the whole pill. */
@container sbub (max-width:330px){.sb-ub-pill{display:none}.sb-ub-cta{padding:0 10px;font-size:12px}}
/* GRK-030: language switch. Wide: "ES / EN", current marked. Phone: one 44px button to the other language; the name text (already cut to 2 letters) gives way, the logo tile still links home. */
.sb-ub-lang{flex:0 0 auto;display:inline-flex;align-items:center;font:600 12px/1 var(--site-mono-font,ui-monospace,monospace);letter-spacing:.06em}
.sb-ub-lang a{display:inline-grid;place-items:center;min-width:32px;min-height:44px;padding:0 4px;color:inherit;text-decoration:none;opacity:.6;box-sizing:border-box}
.sb-ub-lang a[aria-current]{opacity:1;text-decoration:underline;text-underline-offset:4px}
.sb-ub-lang i{font-style:normal;opacity:.4}
@container sbub (max-width:479px){.sb-ub[data-ub-lang] .sb-ub-nm{display:none}.sb-ub-lang a[aria-current],.sb-ub-lang i{display:none}.sb-ub-lang a{min-width:44px;border-radius:99px;border:1.5px solid color-mix(in srgb,var(--token-color-background) 28%,transparent);opacity:1}}
/* TUL-547 / GRK-081: section nav, inline from 760px, a menu below it (the status pill moves into it). */
.sb-ub-nav{display:none;align-items:center;gap:4px;flex:0 1 auto;min-width:0}
.sb-ub-nav a,.sb-ub-menu-panel a{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;border-radius:6px;color:inherit;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}
.sb-ub-nav a:hover,.sb-ub-nav a:focus-visible,.sb-ub-menu-panel a:hover,.sb-ub-menu-panel a:focus-visible{background:color-mix(in srgb,var(--token-color-background) 12%,transparent)}
.sb-ub-menu{position:relative;flex:0 0 auto}
.sb-ub-menu>summary{list-style:none;cursor:pointer;width:44px;height:44px;border-radius:6px;border:1.5px solid color-mix(in srgb,var(--token-color-background) 28%,transparent);display:grid;place-items:center;box-sizing:border-box}
.sb-ub-menu>summary::-webkit-details-marker{display:none}
.sb-ub-menu>summary svg{width:18px;height:18px}
.sb-ub-menu-panel{position:absolute;right:0;top:calc(100% + 8px);z-index:8;display:flex;flex-direction:column;align-items:stretch;gap:2px;min-width:200px;padding:8px;border-radius:10px;background:var(--token-color-ink);color:var(--token-color-background);box-shadow:0 12px 32px rgba(0,0,0,.28)}
.sb-ub-menu-panel .sb-ub-pill{display:inline-flex;align-self:flex-start;margin:4px 6px 6px}
.sb-ub:has(.sb-ub-menu) > .sb-ub-pill{display:none}
@container sbub (min-width:760px){.sb-ub-nav{display:flex}.sb-ub-menu{display:none}.sb-ub:has(.sb-ub-menu) > .sb-ub-pill{display:inline-flex}}
/* TUL-532: on a phone a logo cannot be readable beside the status pill + CTA. The logo is the
   name, so the name text stays for screen readers only (it names the home link). */
@container sbub (max-width:480px){.sb-ub-logo[data-logo-img]{max-width:min(160px,50cqi)}.sb-ub-logo[data-logo-img]+.sb-ub-nm{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.sb-ub:has(.sb-ub-logo[data-logo-img]) .sb-ub-pill{display:none}}
@container sbub (min-width:900px){.sb-ub{padding:12px 40px;gap:14px}.sb-ub-cta{padding:0 18px;font-size:14px}.sb-ub-nm small{display:block;-webkit-line-clamp:unset;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}}
`;

const PHONE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
  </svg>
);

/** Each language named in itself, so the switch reads right from either page. */
const LANGUAGE_NAMES: Record<string, string> = { es: "Español", en: "English", fr: "Français", pt: "Português", it: "Italiano", de: "Deutsch" };
const MENU_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

/** Only an explicit `tel:` link with digits is a call target. */
export function safeCallHref(href: unknown): string {
  if (typeof href !== "string") return "";
  const h = href.trim();
  return /^tel:\+?\d{6,16}$/.test(h) ? h : "";
}

export function renderUtilityBarBlock(args: {
  node: BuilderUtilityBarNode;
  liveStatus?: LiveStatusRenderContext;
  /** Call link from the page (G4 `callHref`); wins over the node's own. */
  callHref?: string;
  /** The site's languages + this page per language (`dataSources.siteLocales`). */
  siteLocales?: { locales: readonly string[]; hrefs?: Readonly<Record<string, string>> };
  /** The language the page rendered in. */
  locale?: string;
  /** Public path prefix (host-root sites pass ""). */
  publicPathPrefix?: string;
  styleAttr?: CSSProperties;
}): ReactNode {
  const { node, styleAttr } = args;
  const langs = (args.siteLocales?.locales ?? []).slice(0, 4);
  const current = args.locale ?? langs[0] ?? "";
  const p = node.props;
  const on = args.liveStatus?.emergenciesToday === true;
  const name = (p.name ?? "").trim();
  const subtitle = (p.subtitle ?? "").trim();
  const homeHref = prefixPublicHref((p.homeHref ?? "").trim() || "/", args.publicPathPrefix ?? "");
  const call = p.showCall === false ? "" : safeCallHref(args.callHref || p.callHref);
  const ctaLabel = (p.ctaLabel ?? "").trim();
  const ctaHref = (p.ctaHref ?? "").trim();
  const onLabel = (p.statusOnLabel ?? "").trim() || "Emergencies today";
  const offLabel = (p.statusOffLabel ?? "").trim() || "No emergencies today";
  const navLinks = (p.navLinks ?? []).filter(
    (l) => typeof l?.label === "string" && l.label.trim() && typeof l.href === "string" && l.href.trim(),
  );
  const navLabel = (p.navLabel ?? "").trim() || "Sections";
  const links = navLinks.map((l) => (
    <a key={`${l.href}:${l.label}`} href={prefixPublicHref(l.href.trim(), args.publicPathPrefix ?? "")}>
      {l.label.trim()}
    </a>
  ));
  const status =
    p.showStatus === false ? null : (
      <>
        {on ? (
          <span className="sb-ub-pill" role="status" data-on="true" data-live-when="on">
            <i />
            <span>{onLabel}</span>
          </span>
        ) : null}
        <span className="sb-ub-pill" role="status" data-on="false" data-live-when={on ? "off" : undefined}>
          <i />
          <span>{offLabel}</span>
        </span>
      </>
    );
  return (
    <header
      className="sb-ub"
      data-builder-kind="utility_bar"
      data-builder-node-kind="utility_bar"
      data-builder-node-id={node.id}
      data-ub-lang={langs.length > 1 ? "" : undefined}
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      <style>{UTILITY_BAR_CSS}</style>
      <a className="sb-ub-brand" href={homeHref} data-ub-brand-home="true">
        <span className="sb-ub-logo" aria-hidden="true" {...(p.logoUrl ? { "data-logo-img": "" } : {})}>
          {p.logoUrl ? <img src={p.logoUrl} alt="" /> : (name.charAt(0) || "·").toUpperCase()}
        </span>
        <div className="sb-ub-nm">
          <b>{name}</b>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
      </a>
      {links.length > 0 ? (
        <nav className="sb-ub-nav" aria-label={navLabel}>
          {links}
        </nav>
      ) : null}
      {status}
      {langs.length > 1 ? (
        <nav className="sb-ub-lang" aria-label={languageToggleGroupLabel(current)}>
          {langs.map((code, i) => (
            <span key={code} style={{ display: "contents" }}>
              {i > 0 ? <i aria-hidden="true">/</i> : null}
              <a
                href={args.siteLocales?.hrefs?.[code] ?? `?locale=${code}`}
                hrefLang={code}
                lang={code}
                aria-current={code === current ? "true" : undefined}
                aria-label={LANGUAGE_NAMES[code] ?? code.toUpperCase()}
              >
                {code.toUpperCase()}
              </a>
            </span>
          ))}
        </nav>
      ) : null}
      {ctaLabel && ctaHref ? (
        <a className="sb-ub-cta" href={ctaHref}>
          {ctaLabel}
        </a>
      ) : null}
      {call ? (
        <a className="sb-ub-tel" href={call} aria-label={(p.callLabel ?? "").trim() || "Call"}>
          {PHONE_ICON}
        </a>
      ) : null}
      {links.length > 0 ? (
        <details className="sb-ub-menu">
          <summary aria-label={(p.menuLabel ?? "").trim() || "Menu"}>{MENU_ICON}</summary>
          <nav className="sb-ub-menu-panel" aria-label={navLabel}>
            {links}
            {status}
          </nav>
        </details>
      ) : null}
    </header>
  );
}
