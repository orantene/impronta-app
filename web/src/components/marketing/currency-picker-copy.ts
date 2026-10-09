/**
 * Words on the footer / pricing currency chip. The chip said "Showing prices
 * in ... Auto-detected" on the Spanish site (bucket TUL-518, was TUL-499).
 */
export type CurrencySource = "url-param" | "cookie" | "ip-country" | "fallback";

export function currencyPickerCopy(locale: string): {
  showing: string;
  pick: string;
  source: Record<CurrencySource, string>;
} {
  const es = locale.trim().toLowerCase().startsWith("es");
  return es
    ? {
        showing: "Mostrando precios en",
        pick: "Elige una moneda",
        source: { "ip-country": "Detectada automáticamente", cookie: "Tu elección", "url-param": "Definida por enlace", fallback: "Predeterminada" },
      }
    : {
        showing: "Showing prices in",
        pick: "Pick a currency",
        source: { "ip-country": "Auto-detected", cookie: "Your pick", "url-param": "Set via link", fallback: "Default" },
      };
}
