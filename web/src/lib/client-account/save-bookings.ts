/**
 * "Save your bookings" (TUL-G4): the one block every post-booking surface shows
 * a guest so they can create or activate a client account with the email they
 * used. Pure: copy + the href into the EXISTING client sign-in (`/login?as=client`,
 * passwordless-first email code). No second auth flow lives here.
 *
 * No email travels in the URL (privacy rule: no personal data in query strings);
 * the sign-in screen asks for it, and the claim matches by the verified email.
 */

export type SaveBookingsLocale = "en" | "es";

export const SAVE_BOOKINGS_COPY: Record<SaveBookingsLocale, { title: string; body: string; cta: string; footer: string }> = {
  en: {
    title: "Save your bookings",
    body: "Create or activate your account with the email you used, and keep every booking, payment and message in one place.",
    cta: "Save my bookings",
    footer: "Save your bookings: create or activate your account with this email.",
  },
  es: {
    title: "Guarda tus reservas",
    body: "Crea o activa tu cuenta con el correo que usaste y ten todas tus reservas, pagos y mensajes en un solo lugar.",
    cta: "Guardar mis reservas",
    footer: "Guarda tus reservas: crea o activa tu cuenta con este correo.",
  },
};

export function saveBookingsLocale(raw: string | null | undefined): SaveBookingsLocale {
  return (raw ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

/** Relative href into the existing client sign-in, returning to `/account`. */
export const SAVE_BOOKINGS_HREF = "/login?as=client&next=%2Faccount";

/**
 * Show only to a viewer KNOWN to be signed out. `null`/`undefined` (still
 * checking) hides it, so a signed-in client never sees a flash of the block.
 */
export function shouldShowSaveBookings(signedIn: boolean | null | undefined): boolean {
  return signedIn === false;
}
