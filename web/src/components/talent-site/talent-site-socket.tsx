import type { ReactNode } from "react";
import Link from "next/link";

import { GUEST_CHAT_LAUNCHER_GAP_PX } from "@/app/t/[profileCode]/_chat/launcher-clearance";
import {
  GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX,
  GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX,
} from "@/app/t/[profileCode]/_chat/mini-chat-styles";
import { LocaleSwitchLink } from "@/components/locale-switch-link";
import type { SocketLink, SocketModel } from "@/lib/talent-site/footer-socket";

/**
 * Global Tulala footer socket: the shared bottom strip (server component).
 *
 * Styled ONLY from theme tokens (background, surface-raised, ink, line) plus a
 * muted ink derived with `color-mix`: `color.ink-muted` is not a real token,
 * and some designs set `color.muted` equal to the text colour. Text is always
 * ink or ink mixed into the strip surface, never on a design's dark band.
 * Phone: stacked. Desktop: one row.
 *
 * Links use `next/link`. Tulala legal pages open in the SAME tab so a cold
 * marketing paint never leaves a new tab stuck on about:blank (TUL-516 H2/H3/H5).
 */

/**
 * The round guest-chat launcher (54px `.tl-fab`) floats 16px in from the right
 * edge at a height that moves (130px up on desktop). The strip keeps its links
 * out of that column with an inline reserve; a full-width bottom pad here left
 * a ~200px empty band under every footer.
 *
 * Narrow (≤700px) with a booking bar up (`data-yield-booking-bar`), the
 * launcher steps 72px in and lifts by max(88px, bar + 16px) above its 24px
 * rest (useYieldBookingBar), so there the strip ends above it instead.
 */
const LAUNCHER_FAB_PX = 54;
const LAUNCHER_INLINE_CLEARANCE_PX = 16 + LAUNCHER_FAB_PX + GUEST_CHAT_LAUNCHER_GAP_PX;
/** Socket side padding: 18px stacked, 48px from 768px. */
const SOCKET_PAD_X_PHONE_PX = 18;
const SOCKET_PAD_X_DESKTOP_PX = 48;
const NARROW_YIELD_PAD = `calc(max(${GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX}px,var(--floating-chrome-bottom,0px) + 16px) + ${GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX + LAUNCHER_FAB_PX + GUEST_CHAT_LAUNCHER_GAP_PX}px)`;

export const SOCKET_LAUNCHER_CLEARANCE_CSS = `body:has([data-guest-chat-launcher]) .tulala-socket__inner{padding-right:${LAUNCHER_INLINE_CLEARANCE_PX - SOCKET_PAD_X_PHONE_PX}px}@media (min-width:768px){body:has([data-guest-chat-launcher]) .tulala-socket__inner{padding-right:${LAUNCHER_INLINE_CLEARANCE_PX - SOCKET_PAD_X_DESKTOP_PX}px}}@media (max-width:700px){body:has([data-guest-chat-launcher][data-yield-booking-bar]) .tulala-socket[data-clear-dock="true"]{padding-bottom:${NARROW_YIELD_PAD}}}`;

/**
 * On the published site the strip is the last thing on the page, so it owns
 * the floating-chrome reserve (dock, sticky bar, phone launcher) in its own
 * surface colour. The body pad would otherwise stack under it as a second,
 * unthemed band.
 */
const STRIP_CSS = `
.tulala-socket{--ts-bg:var(--token-color-surface-raised,var(--token-color-background,Canvas));--ts-ink:var(--token-color-ink,CanvasText);--ts-line:var(--token-color-line,currentColor);--ts-muted:color-mix(in srgb,var(--ts-ink) 82%,var(--ts-bg));box-sizing:border-box;width:100%;background:var(--ts-bg);color:var(--ts-ink);border-top:1px solid var(--ts-line);font-family:var(--site-body-font,inherit);font-size:13px;line-height:1.4;padding:18px ${SOCKET_PAD_X_PHONE_PX}px 22px}
.tulala-socket[data-clear-dock="true"]{padding-bottom:calc(22px + var(--floating-chrome-bottom,0px))}
body:has(.tulala-socket[data-clear-dock="true"]){padding-bottom:0}
.tulala-socket *{box-sizing:border-box}
.tulala-socket__inner{display:grid;gap:10px;max-width:1200px;margin:0 auto}
.tulala-socket nav{display:flex;flex-wrap:wrap;align-items:center;gap:0 4px}
.tulala-socket__label{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ts-muted);margin-right:6px}
.tulala-socket a{color:var(--ts-ink);text-underline-offset:3px;display:inline-flex;align-items:center;min-height:32px;padding:0 6px}
.tulala-socket a[aria-current="true"]{font-weight:600;text-decoration:none}
.tulala-socket__credit{color:var(--ts-muted);font-size:12.5px;display:inline-flex;align-items:center;gap:4px;min-height:32px}
.tulala-socket__credit a{color:var(--ts-muted);padding:0 2px}
.tulala-socket__hint{margin:0;font-size:12px;color:var(--ts-muted)}
@media (min-width:768px){
.tulala-socket{padding:14px ${SOCKET_PAD_X_DESKTOP_PX}px 18px}
.tulala-socket[data-clear-dock="true"]{padding-bottom:calc(18px + var(--floating-chrome-bottom,0px))}
.tulala-socket__inner{grid-auto-flow:column;justify-content:space-between;align-items:center;gap:8px 28px}
.tulala-socket__credit{margin-left:auto;text-align:right}
}
${SOCKET_LAUNCHER_CLEARANCE_CSS}
`;

function LinkGroup({ label, links }: { label: string; links: SocketLink[] }): ReactNode {
  return (
    <nav aria-label={label}>
      <span className="tulala-socket__label">{label}</span>
      {links.map((l) => (
        <Link key={l.key} href={l.href} data-socket-link={l.key} {...(l.external ? { rel: "noopener" } : {})}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function TalentSiteSocket({
  model,
  hint,
  clearDock = true,
}: {
  model: SocketModel;
  /** Builder canvas only: the "locked" hint under the strip. */
  hint?: string;
  /** Leave room for the fixed messages dock (published site only). */
  clearDock?: boolean;
}): ReactNode {
  return (
    <div
      className="tulala-socket"
      data-tulala-socket=""
      data-parity-key="socket"
      data-site-locale={model.locale}
      data-clear-dock={clearDock ? "true" : "false"}
      {...(hint ? { "data-socket-locked": "" } : {})}
    >
      <style dangerouslySetInnerHTML={{ __html: STRIP_CSS }} />
      <div className="tulala-socket__inner">
        {model.siteLinks.length > 0 ? (
          <LinkGroup label={model.siteGroupLabel} links={model.siteLinks} />
        ) : null}
        <LinkGroup label={model.tulalaGroupLabel} links={model.tulalaLinks} />
        {model.languages.length >= 2 ? (
          <nav aria-label={model.langGroupLabel} data-socket-languages="">
            <span className="tulala-socket__label">{model.langGroupLabel}</span>
            {model.languages.map((l) => (
              <LocaleSwitchLink
                key={l.locale}
                href={l.href}
                hrefLang={l.locale}
                lang={l.locale}
                aria-current={l.current ? "true" : undefined}
              >
                {l.label}
              </LocaleSwitchLink>
            ))}
          </nav>
        ) : null}
        {model.credit ? (
          <span className="tulala-socket__credit" data-socket-credit="">
            {model.credit.prefix}
            <Link href={model.credit.href} rel="noopener">
              {model.credit.label}
            </Link>
          </span>
        ) : null}
      </div>
      {hint ? <p className="tulala-socket__hint">{hint}</p> : null}
    </div>
  );
}
