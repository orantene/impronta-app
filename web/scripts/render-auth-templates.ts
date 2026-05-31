/**
 * Phase 7 — render the auth React Email components to static HTML for Supabase.
 *
 * Supabase Auth does NOT render React. At send time it substitutes Go-template
 * variables ({{ .ConfirmationURL }}, {{ .NewEmail }}, …) into a STATIC HTML
 * string referenced from `config.toml` via `content_path`. The spec
 * (web/docs/email-notification-system-spec-2026-05-28.md, Phase 7 / decision D2)
 * mandates that those static files stay in lock-step with our branded React
 * Email components rather than drifting as hand-maintained HTML.
 *
 * This script is that lock-step: it renders each auth component with the Go
 * placeholder strings passed in as the URL/email props, so the rendered HTML
 * carries the literal `{{ .ConfirmationURL }}` (etc.) exactly where Supabase
 * expects to substitute. The output is committed to ../supabase/templates/*.html
 * and wired in supabase/config.toml under [auth.email.template.*].
 *
 * Run from web/ (the npm script pins cwd): `npm run email:export-auth`.
 * Re-run whenever the auth components or shared Layout/Button change, then
 * commit the regenerated HTML alongside the component change.
 *
 * NOTE: we render with `@react-email/render` directly — NOT the
 * `src/lib/email/render.ts` wrapper — because that wrapper is `server-only`
 * and throws outside an RSC runtime (i.e. in this plain tsx script).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement } from "react";
import { render } from "@react-email/render";
import SignupConfirm from "../emails/auth/SignupConfirm";
import MagicLink from "../emails/auth/MagicLink";
import PasswordReset from "../emails/auth/PasswordReset";
import EmailChange from "../emails/auth/EmailChange";

// Go-template placeholders Supabase substitutes at send time. Keep these exact
// — config.toml's content_path points at the rendered output and Supabase reads
// these tokens verbatim. https://supabase.com/docs/guides/auth/auth-email-templates
const CONFIRMATION_URL = "{{ .ConfirmationURL }}";
const NEW_EMAIL = "{{ .NewEmail }}";

// npm runs from web/; supabase/ is a sibling of web/ at the repo root.
const OUT_DIR = resolve(process.cwd(), "../supabase/templates");

type Template = {
  /** Output filename; matches the content_path wired in config.toml. */
  file: string;
  element: ReactElement;
  /** Strings that MUST survive rendering, or Supabase can't substitute. */
  mustContain: string[];
};

const TEMPLATES: Template[] = [
  {
    file: "confirm.html",
    element: createElement(SignupConfirm, { confirmUrl: CONFIRMATION_URL }),
    mustContain: [CONFIRMATION_URL],
  },
  {
    file: "magic_link.html",
    element: createElement(MagicLink, { magicUrl: CONFIRMATION_URL }),
    mustContain: [CONFIRMATION_URL],
  },
  {
    file: "recovery.html",
    element: createElement(PasswordReset, { resetUrl: CONFIRMATION_URL }),
    mustContain: [CONFIRMATION_URL],
  },
  {
    file: "email_change.html",
    element: createElement(EmailChange, { confirmUrl: CONFIRMATION_URL, newEmail: NEW_EMAIL }),
    mustContain: [CONFIRMATION_URL, NEW_EMAIL],
  },
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const t of TEMPLATES) {
    const html = await render(t.element, { pretty: true });
    for (const token of t.mustContain) {
      if (!html.includes(token)) {
        throw new Error(
          `${t.file}: rendering dropped the Go placeholder "${token}" — ` +
            `Supabase would email a broken link. Aborting without writing.`,
        );
      }
    }
    const outPath = resolve(OUT_DIR, t.file);
    writeFileSync(outPath, html, "utf8");
    console.log(`wrote supabase/templates/${t.file} (${html.length} bytes)`);
  }
  console.log(`\n${TEMPLATES.length} auth templates rendered to ${OUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
