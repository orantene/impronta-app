/**
 * Shared "magazine" edition primitives for the editorial blocks (masthead,
 * contents, portfolio chapters, comp card, statement footer). Each block
 * scopes its own rules under `[data-edition="magazine"]`; these are the type
 * stacks they share. Colours are token vars only.
 *
 * Label face: a condensed grotesk for tracked caps. The heading and body
 * faces stay the site's (Look) fonts, so a magazine block restyles with the
 * talent's palette and type.
 */
export const MAGAZINE_LABEL_FAMILY = "Archivo Narrow";

/** Google Fonts sheet for the label face (weights the blocks use). */
export const MAGAZINE_LABEL_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@400;500;600;700&display=swap";

/** Custom properties every magazine root declares. */
export const MAGAZINE_ROOT_VARS = `--sb-mag-serif:var(--site-heading-font,var(--token-typography-heading-font-family,Georgia,serif));--sb-mag-sans:var(--site-body-font,var(--token-typography-body-font-family,system-ui,sans-serif));--sb-mag-label:"${MAGAZINE_LABEL_FAMILY}","Arial Narrow",var(--sb-mag-sans);--sb-mag-ink:var(--token-color-ink);--sb-mag-bg:var(--token-color-background);--sb-mag-mute:var(--token-color-muted);--sb-mag-line:var(--token-color-line);--sb-mag-tint:var(--token-color-surface-raised,transparent)`;

/** Square magazine button (solid ink, or ghost with a rule border). */
export const MAGAZINE_BUTTON_CSS = `.sb-mag-btn{display:inline-flex;align-items:center;justify-content:center;height:46px;padding:0 18px;border:1px solid var(--sb-mag-ink);border-radius:0;background:var(--sb-mag-ink);color:var(--sb-mag-bg);font-family:var(--sb-mag-label);font-weight:600;font-size:12px;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;white-space:nowrap;cursor:pointer;box-shadow:none}
.sb-mag-btn[data-ghost="1"]{background:transparent;color:var(--sb-mag-ink);border-color:var(--sb-mag-line)}
.sb-mag-btn:focus-visible{outline:2px solid var(--sb-mag-ink);outline-offset:2px}`;
