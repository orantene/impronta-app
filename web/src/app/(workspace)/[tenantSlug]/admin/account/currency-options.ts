export const SUPPORTED_CURRENCIES = [
  { code: "", label: "Auto (Stripe detects)" },
  { code: "usd", label: "USD — US Dollar" },
  { code: "mxn", label: "MXN — Mexican Peso" },
  { code: "eur", label: "EUR — Euro" },
  { code: "gbp", label: "GBP — British Pound" },
  { code: "brl", label: "BRL — Brazilian Real" },
  { code: "cad", label: "CAD — Canadian Dollar" },
  { code: "cop", label: "COP — Colombian Peso" },
  { code: "ars", label: "ARS — Argentine Peso" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];
