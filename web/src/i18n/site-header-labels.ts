/**
 * Accessible names for the shared site header's icon buttons (`aria-label`).
 * TUL-1406: were hard-coded English ("Saved", "Your inquiry", "Menu", "Phone")
 * and announced in English on every Spanish page. Same shape as GRK-101's
 * `primaryNavAriaLabel`.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export type SiteHeaderLabels = {
  saved: string;
  inquiry: string;
  menu: string;
  phone: string;
  whatsapp: string;
  email: string;
};

export function siteHeaderLabels(locale: string | null | undefined): SiteHeaderLabels {
  const short = locale?.trim().toLowerCase().split("-")[0] || "en";
  const pick = (en: string, es: string) => pickLocale(short, { en, es });
  return {
    saved: pick("Saved", "Guardados"),
    inquiry: pick("Your inquiry", "Tu consulta"),
    menu: pick("Menu", "Menú"),
    phone: pick("Phone", "Teléfono"),
    whatsapp: "WhatsApp",
    email: pick("Email", "Correo"),
  };
}
