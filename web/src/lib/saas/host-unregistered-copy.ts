/**
 * Unregistered-host 404 (`/_host-unregistered`) copy (TUL-516 C5).
 * Neutral Mexican Spanish (tú). No em dashes.
 */
import { isSpanishLocale } from "@/lib/locale-time";
import { TULALA_BRAND } from "@/lib/brand/tulala";

export type HostUnregisteredCopy = {
  title: string;
  heading: string;
  bodyBefore: string;
  bodyAfter: string;
  homeCta: string;
};

export function hostUnregisteredCopy(locale: string | undefined | null): HostUnregisteredCopy {
  if (isSpanishLocale(locale)) {
    return {
      title: `Dominio no conectado · ${TULALA_BRAND.name}`,
      heading: "Este dominio aún no está conectado",
      bodyBefore: "Si buscas la página de un talento o un negocio, puede haberse movido. Prueba buscar en ",
      bodyAfter: ".",
      homeCta: "Ir a tulala.digital",
    };
  }
  return {
    title: `Domain not connected · ${TULALA_BRAND.name}`,
    heading: "This domain isn't connected yet",
    bodyBefore: "If you're looking for a talent or business page, it may have moved. Try searching on ",
    bodyAfter: ".",
    homeCta: "Go to tulala.digital",
  };
}
