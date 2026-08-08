/**
 * Auth email copy fragment (EN + ES). Aggregated by `../email-copy.ts`.
 *
 * `AUTH_ES: typeof AUTH_EN` enforces key + shape parity at build time. No
 * `as const` — values stay `string` so ES can hold different words.
 */

export const AUTH_EN = {
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
    intro: "Click the button below to sign in. This link is single-use and expires in 1 hour.",
    note: "If you didn't request this, you can safely ignore this email.",
    button: "Sign in →",
    // P4 — the passwordless client flow shows a code box on the page it was
    // requested from, so the same email carries the code as well as the link.
    codeLabel: "Or type this code where you asked for it:",
  },
  "auth.signup": {
    subject: "Confirm your email",
    preview: "Confirm your email to get started",
    heading: "Confirm your email",
    intro:
      "Thanks for signing up. Click the button below to confirm your email address and activate your account.",
    note: "This link expires in 24 hours.",
    button: "Confirm email →",
    codeLabel: "Or type this code where you asked for it:",
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
};

export const AUTH_ES: typeof AUTH_EN = {
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
    codeLabel: "O escribe este código donde lo solicitaste:",
  },
  "auth.signup": {
    subject: "Confirma tu correo",
    preview: "Confirma tu correo para empezar",
    heading: "Confirma tu correo",
    intro:
      "Gracias por registrarte. Haz clic en el botón de abajo para confirmar tu correo y activar tu cuenta.",
    note: "Este enlace caduca en 24 horas.",
    button: "Confirmar correo →",
    codeLabel: "O escribe este código donde lo solicitaste:",
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
