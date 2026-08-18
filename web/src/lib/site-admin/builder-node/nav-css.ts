/**
 * Nav CSS — extracted verbatim from `render.tsx`.
 *
 * Moved so the nav's stylesheet can grow (mega columns, drawer furniture, link
 * states) without pushing the 5,000-line renderer further past its cap.
 *
 * NOTHING changed in the move: the rules are byte-for-byte what shipped, and
 * `nav-drawer-css.static.test.ts` was REPOINTED at this file rather than
 * rewritten — those assertions are regression pins for defects that reached
 * the live site (a drawer clipped to the header box, a scrim that swallowed
 * every tap on a link, a menu buried under the chat launcher). Rewriting them
 * during a file move is how a pin quietly stops pinning.
 */

// Nav primitive — inline link row on desktop, CSS-only hamburger→menu
// disclosure on mobile. The inline <ul.nav-links> and the <details.nav-disclosure>
// are mutually exclusive by breakpoint (driven by data-bn-collapse), so exactly
// one set of links is in the layout + a11y tree at any width. No client JS:
// the native <details>/<summary> manages open/closed and announces its state.
// Menu colours fall back to an opaque card (readable over any themed band) but
// are overridable via the --bn-nav-menu-* custom properties.
export const BUILDER_NODE_NAV_CSS = `
.site-builder-node--nav{position:relative;width:100%;max-width:1120px;margin:0 auto;display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:1.25rem}
.site-builder-node--nav-brand{font-weight:700;text-decoration:none;color:inherit}
.site-builder-node--nav-links{display:flex;flex-direction:row;align-items:center;gap:1.5rem;margin:0;padding:0;list-style:none}
.site-builder-node--nav-links>li{margin:0;padding:0}
.site-builder-node--nav-links a{text-decoration:none;color:inherit}
.site-builder-node--nav-disclosure{display:none;position:static}
.site-builder-node--nav-toggle{display:inline-flex;align-items:center;justify-content:center;width:2.75rem;min-width:44px;height:2.75rem;min-height:44px;cursor:pointer;list-style:none;border:1px solid currentColor;border-radius:8px;color:inherit;-webkit-tap-highlight-color:transparent}
.site-builder-node--nav-toggle::-webkit-details-marker{display:none}
.site-builder-node--nav-toggle::marker{content:""}
.site-builder-node--nav-toggle:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.site-builder-node--nav-burger{position:relative;display:block;width:18px;height:2px;background:currentColor;border-radius:2px}
.site-builder-node--nav-burger::before,.site-builder-node--nav-burger::after{content:"";position:absolute;left:0;width:18px;height:2px;background:currentColor;border-radius:2px}
.site-builder-node--nav-burger::before{top:-6px}
.site-builder-node--nav-burger::after{top:6px}
.site-builder-node--nav-menu{list-style:none;margin:0;padding:0.5rem;display:flex;flex-direction:column;gap:0.25rem;position:absolute;top:calc(100% + 8px);left:0;right:0;z-index:30;background:var(--bn-nav-menu-bg,#ffffff);color:var(--bn-nav-menu-color,#111111);border:1px solid var(--bn-nav-menu-border,rgba(17,17,17,0.12));border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,0.16)}
.site-builder-node--nav-menu>li{margin:0;padding:0}
.site-builder-node--nav-menu a{display:block;padding:0.6rem 0.75rem;border-radius:8px;text-decoration:none;color:inherit;font-size:0.95rem}
/* A3 — submenu disclosure. Desktop: the parent <li> is position:relative and
   the .nav-submenu panel is absolutely positioned, hidden by default and
   revealed on hover OR keyboard focus-within (CSS-only, no JS). The caret
   toggle is tabIndex=-1 (the link is the real focus target); :focus-within on
   the <li> opens the panel so a keyboard user reaches the children by tabbing.
   "mega" widens the panel into auto-fill columns. On mobile (inside .nav-menu)
   the panel is static + always laid out (children nest inline, indented). */
.site-builder-node--nav-links .site-builder-node--nav-has-sub{position:relative;display:flex;align-items:center;gap:0.35rem}
.site-builder-node--nav-sub-toggle{display:inline-flex;align-items:center;justify-content:center;width:1.25rem;height:1.25rem;padding:0;margin:0;background:none;border:0;color:inherit;cursor:pointer}
.site-builder-node--nav-caret{display:block;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;opacity:0.7}
.site-builder-node--nav-links .site-builder-node--nav-submenu{list-style:none;margin:0;padding:0.5rem;display:flex;flex-direction:column;gap:0.15rem;position:absolute;top:calc(100% + 10px);left:0;z-index:40;min-width:200px;background:var(--bn-nav-menu-bg,#ffffff);color:var(--bn-nav-menu-color,#111111);border:1px solid var(--bn-nav-menu-border,rgba(17,17,17,0.12));border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,0.16);opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity 120ms ease,transform 120ms ease,visibility 0s linear 120ms}
.site-builder-node--nav-links .site-builder-node--nav-has-sub:hover .site-builder-node--nav-submenu,.site-builder-node--nav-links .site-builder-node--nav-has-sub:focus-within .site-builder-node--nav-submenu{opacity:1;visibility:visible;transform:translateY(0);transition-delay:0s}
.site-builder-node--nav-links .site-builder-node--nav-submenu[data-bn-submenu="mega"]{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.15rem 1.25rem;min-width:min(620px,80vw)}
.site-builder-node--nav-links .site-builder-node--nav-submenu>li{margin:0;padding:0}
.site-builder-node--nav-links .site-builder-node--nav-submenu a{display:block;padding:0.5rem 0.65rem;border-radius:8px;text-decoration:none;color:inherit;font-size:0.92rem;white-space:nowrap}
.site-builder-node--nav-menu .site-builder-node--nav-has-sub{display:block}
.site-builder-node--nav-menu .site-builder-node--nav-sub-toggle{display:none}
.site-builder-node--nav-menu .site-builder-node--nav-submenu{list-style:none;margin:0.1rem 0 0.3rem;padding:0 0 0 0.85rem;display:flex;flex-direction:column;gap:0.1rem;border-left:1px solid var(--bn-nav-menu-border,rgba(17,17,17,0.12))}
.site-builder-node--nav-menu .site-builder-node--nav-submenu>li{margin:0;padding:0}
.site-builder-node--nav-menu .site-builder-node--nav-submenu a{display:block;padding:0.45rem 0.6rem;border-radius:8px;text-decoration:none;color:inherit;font-size:0.9rem;opacity:0.92}
@media (prefers-reduced-motion:reduce){
  .site-builder-node--nav-links .site-builder-node--nav-submenu{transition:none}
}
@media (max-width:900px){
  .site-builder-node--nav[data-bn-collapse="tablet"] .site-builder-node--nav-links{display:none}
  .site-builder-node--nav[data-bn-collapse="tablet"] .site-builder-node--nav-disclosure{display:block}
}
@media (max-width:640px){
  .site-builder-node--nav[data-bn-collapse="mobile"] .site-builder-node--nav-links{display:none}
  .site-builder-node--nav[data-bn-collapse="mobile"] .site-builder-node--nav-disclosure{display:block}
}
/* A6 — collapsed mobile-menu VARIANTS. Mirrors PublicHeaderMobileMenu's
   drawer-right / sheet-bottom / full-screen-fade shapes, driven purely by the
   native details open state (no JS). "dropdown" (default / absent) keeps the
   pre-A6 panel below, so existing nav trees are byte-identical. The panel is
   position:fixed for the off-canvas variants so it escapes the header's
   stacking/overflow; the open details animates it in.

   CAVEAT, learned the hard way: position:fixed does NOT always escape. Any
   ancestor with backdrop-filter, filter, perspective, contain:paint or
   will-change:transform becomes the CONTAINING BLOCK for fixed descendants --
   and a frosted-glass sticky header (our own shell variants ship
   backdrop-filter: blur(18px)) is exactly that. The drawer then resolves
   top:0;bottom:0 against the ~64px header instead of the viewport and opens
   as a clipped stub. There is no CSS escape from a containing block, so the
   off-canvas geometry is expressed in VIEWPORT UNITS (dvh/vw) rather than
   opposing offsets: the panel is then full-screen-sized whether or not it got
   trapped. mobile-health.ts additionally warns the operator at authoring
   time. Do not "simplify" these back to bottom:0 / inset:0. Variants apply ONLY
   when the disclosure is visible (i.e. at/under the collapse breakpoint), so a
   desktop render is untouched. */
.site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{animation:bn-nav-menu-in 200ms ease both}
@keyframes bn-nav-menu-in{from{opacity:0}to{opacity:1}}
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu,
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu,
.site-builder-node--nav[data-bn-mobile-menu="full-screen-fade"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{position:fixed;z-index:2;max-height:none;overflow:auto}
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{top:0;right:0;left:auto;height:100dvh;width:88vw;max-width:400px;border-radius:0;box-shadow:-18px 0 40px rgba(0,0,0,0.2);animation:bn-nav-drawer-right 240ms ease both}
@keyframes bn-nav-drawer-right{from{transform:translateX(100%)}to{transform:translateX(0)}}
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{left:0;width:100vw;bottom:0;top:auto;max-height:80dvh;border-radius:18px 18px 0 0;box-shadow:0 -18px 40px rgba(0,0,0,0.2);animation:bn-nav-sheet-bottom 240ms ease both}
@keyframes bn-nav-sheet-bottom{from{transform:translateY(100%)}to{transform:translateY(0)}}
.site-builder-node--nav[data-bn-mobile-menu="full-screen-fade"] .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{top:0;left:0;height:100dvh;width:100vw;border-radius:0;padding:1.25rem;gap:0.35rem;justify-content:center;animation:bn-nav-menu-in 240ms ease both}
/* An open off-canvas menu gets a tap-anywhere-to-close scrim and keeps its own
   toggle ON TOP of the panel. Without both, the drawer covered the hamburger
   and there was NO way to close the menu -- the panel simply ate the screen.
   The scrim is the summary's own ::before, so closing stays CSS-only: a tap
   anywhere on it is a tap on the summary, which toggles the details shut.
   Sized in viewport units for the containing-block caveat above. */
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>summary,
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>summary,
/* The three open-menu layers, ordered WITHIN the header's stacking context:
   scrim (1) < panel (2) < burger (3). Absolute page-level numbers are useless
   here -- a sticky header with a z-index is itself a stacking context, so no
   value on a descendant can out-stack a body-level element. An earlier attempt
   at 96/97 (to beat a body-level chat launcher at 95) could never have worked
   for that reason, and it put the summary ABOVE the panel, where its
   full-screen scrim swallowed every tap meant for a nav link. The panel must
   sit above the scrim, and only the burger above the panel. */
.site-builder-node--nav[data-bn-mobile-menu="full-screen-fade"] .site-builder-node--nav-disclosure[open]>summary{position:relative;z-index:auto}
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>summary>.site-builder-node--nav-burger,
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>summary>.site-builder-node--nav-burger,
.site-builder-node--nav[data-bn-mobile-menu="full-screen-fade"] .site-builder-node--nav-disclosure[open]>summary>.site-builder-node--nav-burger{position:relative;z-index:3}
.site-builder-node--nav[data-bn-mobile-menu="drawer-right"] .site-builder-node--nav-disclosure[open]>summary::before,
.site-builder-node--nav[data-bn-mobile-menu="sheet-bottom"] .site-builder-node--nav-disclosure[open]>summary::before{content:"";position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:1;background:var(--bn-nav-scrim,rgba(8,8,8,0.55));animation:bn-nav-menu-in 200ms ease both}
/* A site's floating chat launcher is body-level at z-index 95, while the header
   that contains this menu is its own stacking context (sticky + z-index) -- so
   no z-index on the drawer can ever lift it over that pill. Hiding the pill
   while the menu is open is the only correct fix, and it is what a native app
   would do anyway. */
body:has(.site-builder-node--nav-disclosure[open]) [data-guest-chat-launcher]{opacity:0;pointer-events:none;transition:opacity 160ms ease}
@media (prefers-reduced-motion:reduce){
  .site-builder-node--nav-disclosure[open]>.site-builder-node--nav-menu{animation:none}
  .site-builder-node--nav-disclosure[open]>summary::before{animation:none}
  body:has(.site-builder-node--nav-disclosure[open]) [data-guest-chat-launcher]{transition:none}
}`;
