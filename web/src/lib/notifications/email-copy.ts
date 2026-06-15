/**
 * Bilingual email copy — EN + ES in one typed module.
 *
 * Mirrors the marketing-copy pattern (`src/lib/marketing/copy.ts`): `es` is
 * typed `typeof en`, so the build FAILS if a key is missing or mistyped in
 * either language — the two languages can never drift apart.
 *
 * Spanish is natural Mexican Spanish using "tú" — written to read well, not
 * translated word-for-word.
 *
 * Three consumers:
 *  - React Email templates (`emails/**`) call `getEmailCopy(brand?.locale)[KEY]`
 *    to render their frame text in the recipient's language. Dynamic values
 *    (names, amounts) stay interpolated in the template.
 *  - The email channel (`channels/email.ts`) calls `getEmailSubject(locale, id)`
 *    to localize subject lines (falls back to the catalog entry's English
 *    `subject()` fn when a key isn't translated yet — so this is incremental).
 *  - The auth hook (`api/hooks/auth-email`) localizes the four auth emails.
 *
 * Keys are the catalog `templateId` (e.g. "client.inquiry_received") or, for
 * auth mail, "auth.<action>". Placeholders use `{var}` and are filled by
 * `interpolate()` / in-template `.replace()`.
 *
 * The console DB override (notification_template_override) still wins on top of
 * everything here — baked-in copy is the good default; overrides are the escape
 * hatch.
 */

export type EmailLocale = "en" | "es";

/** Normalize any BCP-47-ish string to the two locales we ship. */
export function normalizeEmailLocale(locale: string | undefined | null): EmailLocale {
  return (locale ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
}

// ─── English (source of truth) ───────────────────────────────────────────────
const en = {
  // Auth (rendered by the Supabase Send Email Hook, not the dispatcher).
  "auth.recovery": {
    subject: "Reset your password",
    preview: "Reset your password",
    heading: "Reset your password",
    intro:
      "Someone requested a password reset for your account. Click the button below to choose a new password.",
    note: "This link expires in 1 hour. If you didn't request this, you can safely ignore this email and your password will stay unchanged.",
    button: "Reset password →",
  },
  "auth.magiclink": {
    subject: "Your sign-in link",
    preview: "Your sign-in link",
    heading: "Sign in",
    intro:
      "Click the button below to sign in. This link is single-use and expires in 1 hour.",
    note: "If you didn't request this, you can safely ignore this email.",
    button: "Sign in →",
  },
  "auth.signup": {
    subject: "Confirm your email",
    preview: "Confirm your email to get started",
    heading: "Confirm your email",
    intro:
      "Thanks for signing up. Click the button below to confirm your email address and activate your account.",
    note: "This link expires in 24 hours.",
    button: "Confirm email →",
  },
  "auth.email_change": {
    subject: "Confirm your new email",
    preview: "Confirm your new email",
    heading: "Confirm your new email",
    // {email} = the new address being confirmed.
    intro:
      "A request was made to change the email address on your account to {email}. Click the button below to confirm the change.",
    note: "If you didn't request this, you can safely ignore this email and your address will stay unchanged.",
    button: "Confirm new email →",
  },
} as const;

// `as const` above gives literal types; strip them to plain `string` for the
// parity type so `es` only has to match shape + keys (not the exact English
// literal). This is what lets `es` hold different words but the same structure.
type Stringify<T> = { [K in keyof T]: { [F in keyof T[K]]: string } };
export type EmailCopy = Stringify<typeof en>;
export type EmailCopyKey = keyof typeof en;

// ─── Español (Mexican Spanish, "tú") ─────────────────────────────────────────
const es: EmailCopy = {
  "auth.recovery": {
    subject: "Restablece tu contraseña",
    preview: "Restablece tu contraseña",
    heading: "Restablece tu contraseña",
    intro:
      "Alguien solicitó restablecer la contraseña de tu cuenta. Haz clic en el botón de abajo para elegir una nueva.",
    note: "Este enlace caduca en 1 hora. Si no fuiste tú, puedes ignorar este correo sin problema y tu contraseña no cambiará.",
    button: "Restablecer contraseña →",
  },
  "auth.magiclink": {
    subject: "Tu enlace para iniciar sesión",
    preview: "Tu enlace para iniciar sesión",
    heading: "Inicia sesión",
    intro:
      "Haz clic en el botón de abajo para iniciar sesión. El enlace es de un solo uso y caduca en 1 hora.",
    note: "Si no fuiste tú, puedes ignorar este correo sin problema.",
    button: "Iniciar sesión →",
  },
  "auth.signup": {
    subject: "Confirma tu correo",
    preview: "Confirma tu correo para empezar",
    heading: "Confirma tu correo",
    intro:
      "Gracias por registrarte. Haz clic en el botón de abajo para confirmar tu correo y activar tu cuenta.",
    note: "Este enlace caduca en 24 horas.",
    button: "Confirmar correo →",
  },
  "auth.email_change": {
    subject: "Confirma tu nuevo correo",
    preview: "Confirma tu nuevo correo",
    heading: "Confirma tu nuevo correo",
    intro:
      "Se solicitó cambiar el correo de tu cuenta a {email}. Haz clic en el botón de abajo para confirmar el cambio.",
    note: "Si no fuiste tú, puedes ignorar este correo sin problema y tu correo no cambiará.",
    button: "Confirmar nuevo correo →",
  },
};

const BY_LOCALE: Record<EmailLocale, EmailCopy> = { en, es };

/** Full copy map for a locale (defaults to English). */
export function getEmailCopy(locale: string | undefined | null): EmailCopy {
  return BY_LOCALE[normalizeEmailLocale(locale)];
}

/**
 * Localized subject for a templateId, or undefined when that key isn't
 * translated yet (caller then keeps the catalog's English `subject()` fn). This
 * is what makes the rollout incremental — subjects light up as keys are added.
 */
export function getEmailSubject(
  locale: string | undefined | null,
  templateId: string,
): string | undefined {
  const map = getEmailCopy(locale) as Record<string, { subject?: string }>;
  return map[templateId]?.subject;
}

/** Fill `{key}` placeholders from a vars bag (missing keys → empty string). */
export function interpolate(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_, k: string) => (vars[k] ?? "").toString());
}
