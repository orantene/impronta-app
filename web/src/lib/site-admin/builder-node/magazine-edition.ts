/**
 * Shared magazine edition primitives for editorial blocks (masthead, contents,
 * portfolio chapters, comp card, statement footer).
 *
 * VALUES are theme tokens. Folio ships Instrument Serif / Archivo Narrow /
 * Archivo, stone, square buttons and 1px rules as DEFAULTS only — editable
 * site-wide or per-block, with reset to the Design default.
 *
 * Label face prefers Claude's future `typography.label-font-family` when
 * projected; until then it falls through `shell.header-nav-font` (Folio design
 * default) then Archivo Narrow. Rule width prefers future
 * `--token-border-rule-width`, else 1px. Do not register those keys here.
 */
export const MAGAZINE_LABEL_FAMILY = "Archivo Narrow";

/** Google Fonts sheet for the label face (weights the blocks use). */
export const MAGAZINE_LABEL_FONT_HREF =
  "/api/fonts/css?family=Archivo+Narrow:wght@400;500;600;700&display=swap";

/**
 * Custom properties every magazine root declares.
 * Prefer projected token vars; Folio Look/Design defaults fill them.
 */
export const MAGAZINE_ROOT_VARS = [
  "--sb-mag-serif:var(--site-heading-font,var(--token-typography-heading-font-family,Georgia,serif))",
  "--sb-mag-sans:var(--site-body-font,var(--token-typography-body-font-family,system-ui,sans-serif))",
  '--sb-mag-label:var(--token-typography-label-font-family,var(--token-shell-header-nav-font,"Archivo Narrow","Arial Narrow",system-ui,sans-serif))',
  "--sb-mag-ink:var(--token-color-ink)",
  "--sb-mag-bg:var(--token-color-background)",
  "--sb-mag-mute:var(--token-color-muted)",
  "--sb-mag-line:var(--token-color-line)",
  "--sb-mag-tint:var(--token-color-surface-raised,transparent)",
  "--sb-mag-rule:var(--token-border-rule-width,1px)",
  "--sb-mag-radius:var(--site-radius,0)",
].join(";");

/** Magazine button — radius + rule width from tokens (Folio defaults: square + 1px). */
export const MAGAZINE_BUTTON_CSS = `.sb-mag-btn{display:inline-flex;align-items:center;justify-content:center;height:46px;padding:0 18px;border:var(--sb-mag-rule) solid var(--sb-mag-ink);border-radius:var(--sb-mag-radius);background:var(--sb-mag-ink);color:var(--sb-mag-bg);font-family:var(--sb-mag-label);font-weight:600;font-size:12px;letter-spacing:var(--site-label-tracking,.2em);text-transform:var(--site-label-case,uppercase);text-decoration:none;white-space:nowrap;cursor:pointer;box-shadow:none}
.sb-mag-btn[data-ghost="1"]{background:transparent;color:var(--sb-mag-ink);border-color:var(--sb-mag-line)}
.sb-mag-btn:focus-visible{outline:2px solid var(--sb-mag-ink);outline-offset:2px}`;
