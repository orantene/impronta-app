/**
 * Quick view styles (TUL-1272 #3). One <dialog>: a centered popup on desktop,
 * a bottom sheet under 640 px (390 px phones). Paints from the site's theme
 * tokens only.
 */
const INK = "var(--token-color-ink, CanvasText)";
const BG = "var(--token-color-background, Canvas)";
const SOFT = `color-mix(in srgb, ${INK} 66%, ${BG})`;
const LINE = `color-mix(in srgb, ${INK} 14%, transparent)`;

export const SERVICE_QUICK_VIEW_CSS = `
dialog.sqv {
  box-sizing: border-box;
  width: min(640px, calc(100vw - 32px));
  max-width: none;
  max-height: min(86vh, 880px);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 16px;
  background: ${BG};
  color: ${INK};
  font-family: var(--site-body-font, inherit);
  line-height: 1.55;
  overflow: hidden;
  flex-direction: column;
}
dialog.sqv[open] { display: flex; }
dialog.sqv::backdrop { background: color-mix(in srgb, ${INK} 45%, transparent); }
.sqv-scroll { overflow-y: auto; overscroll-behavior: contain; padding: 0 24px 24px; }
.sqv-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 24px 8px; }
.sqv-title { flex: 1 1 auto; min-width: 0; margin: 0; font-family: var(--site-heading-font, inherit); font-size: 22px; line-height: 1.2; }
.sqv-close {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 999px; border: 1px solid ${LINE};
  background: transparent; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; text-decoration: none;
}
.sqv-facts { margin: 0 0 16px; color: ${SOFT}; }
.sqv-photos { display: flex; gap: 8px; margin: 0 0 16px; overflow-x: auto; scroll-snap-type: x mandatory; }
.sqv-photos img { flex: none; width: 70%; max-width: 320px; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 10px; scroll-snap-align: start; }
.sqv-photos img:only-child { width: 100%; max-width: none; aspect-ratio: 16 / 10; }
.sqv-desc { margin: 0 0 20px; white-space: pre-line; }
.sqv h3 { margin: 20px 0 8px; font-size: 16px; font-family: var(--site-heading-font, inherit); }
.sqv-list { margin: 0; padding-left: 18px; }
.sqv details { border-top: 1px solid ${LINE}; padding: 10px 0; }
.sqv summary { cursor: pointer; font-weight: 600; }
.sqv details p { margin: 6px 0 0; color: ${SOFT}; white-space: pre-line; }
.sqv-review { margin: 0 0 12px; }
.sqv-review blockquote { margin: 2px 0; white-space: pre-line; }
.sqv-review p { margin: 0; color: ${SOFT}; font-size: 14px; }
.sqv-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 24px calc(12px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid ${LINE};
}
.sqv-price { font-weight: 600; min-width: 0; }
.sqv-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.sqv-page { color: inherit; text-underline-offset: 3px; font-size: 15px; }
.sqv-book {
  display: inline-block; padding: 11px 22px; border-radius: var(--token-button-radius, 999px);
  background: ${INK}; color: ${BG}; font-weight: 600; text-decoration: none; white-space: nowrap;
}
@media (max-width: 639px) {
  dialog.sqv {
    width: 100vw;
    max-height: 88vh;
    margin: auto 0 0;
    border-radius: 16px 16px 0 0;
  }
    .sqv-head { padding: 16px 16px 8px; }
  .sqv-scroll { padding: 0 16px 16px; }
  .sqv-foot { padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); }
  .sqv-title { font-size: 20px; }
  .sqv-photos img { width: 78%; }
}
`;
