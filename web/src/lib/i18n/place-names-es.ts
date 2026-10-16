/**
 * place-names-es.ts - TUL-738. Place names reach the public directory from
 * `locations.display_name_i18n`, and a row with no Spanish name falls back to
 * English ("Mexico City") while one entered without accents reads "Cancun".
 * This is the safety net on the display side: a short table of the places a
 * Spanish page is most likely to meet, keyed by the unaccented English name.
 * Anything not in the table passes through untouched. Pure, no I/O.
 */
const ES_BY_KEY: Readonly<Record<string, string>> = {
  mexico: "México",
  "mexico city": "Ciudad de México",
  "ciudad de mexico": "Ciudad de México",
  cancun: "Cancún",
  merida: "Mérida",
  queretaro: "Querétaro",
  "san luis potosi": "San Luis Potosí",
  bogota: "Bogotá",
  medellin: "Medellín",
  peru: "Perú",
  panama: "Panamá",
  canada: "Canadá",
  "new york": "Nueva York",
  london: "Londres",
  paris: "París",
  rome: "Roma",
  "sao paulo": "São Paulo",
  spain: "España",
  germany: "Alemania",
  france: "Francia",
  italy: "Italia",
  brazil: "Brasil",
  "united states": "Estados Unidos",
  "united kingdom": "Reino Unido",
};

function keyOf(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Spanish spelling of a known place on a Spanish page; the input otherwise. */
export function spanishPlaceName(name: string, locale: string): string {
  if (!name || (locale ?? "").slice(0, 2).toLowerCase() !== "es") return name;
  return ES_BY_KEY[keyOf(name)] ?? name;
}

/**
 * Country facet label: a Spanish page names the country ("México"); an English
 * page and any unknown code keep the ISO code as before.
 */
export function countryFacetLabel(code: string, locale: string): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || (locale ?? "").slice(0, 2).toLowerCase() !== "es") return cc;
  try {
    const name = new Intl.DisplayNames(["es"], { type: "region" }).of(cc);
    return name && name !== cc ? name : cc;
  } catch {
    return cc;
  }
}
