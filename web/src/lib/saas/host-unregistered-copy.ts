/** TUL-877: copy for the "domain not connected" page, ES/EN by Accept-Language. Pure. */
import { defaultFlowLocale, type FlowLocale } from "@/lib/onboarding/flow";

export type HostUnregisteredCopy = {
  locale: FlowLocale;
  tabTitle: string;
  heading: string;
  /** Text before the marketing link. */
  bodyBefore: string;
  cta: string;
};

export function hostUnregisteredCopy(acceptLanguage: string | null | undefined, country?: string | null): HostUnregisteredCopy {
  const locale = defaultFlowLocale({ acceptLanguage, country });
  if (locale === "es") {
    return {
      locale,
      tabTitle: "Dominio no conectado · Tulala",
      heading: "Este dominio aún no está conectado",
      bodyBefore: "Si buscas una página de talento o de un negocio, puede que se haya movido. Prueba a buscar en ",
      cta: "Ir a tulala.digital",
    };
  }
  return {
    locale,
    tabTitle: "Domain not connected · Tulala",
    heading: "This domain isn't connected yet",
    bodyBefore: "If you're looking for a talent or business page, it may have moved. Try searching on ",
    cta: "Go to tulala.digital",
  };
}
