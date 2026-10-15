/**
 * TUL-822: Spanish city names for the IANA zones the picker lists. The key is
 * the last path segment with underscores as spaces, exactly what
 * `zoneLabel` derives, so a miss falls back to the humanized English tail.
 */
const CITY_ES: Readonly<Record<string, string>> = {
  // Mexico
  "Mexico City": "Ciudad de México",
  Cancun: "Cancún",
  Merida: "Mérida",
  Monterrey: "Monterrey",
  Chihuahua: "Chihuahua",
  "Ciudad Juarez": "Ciudad Juárez",
  Ojinaga: "Ojinaga",
  Hermosillo: "Hermosillo",
  Mazatlan: "Mazatlán",
  Matamoros: "Matamoros",
  "Bahia Banderas": "Bahía de Banderas",
  Tijuana: "Tijuana",
  // US and Canada
  "New York": "Nueva York",
  Chicago: "Chicago",
  Denver: "Denver",
  "Los Angeles": "Los Ángeles",
  Phoenix: "Phoenix",
  Anchorage: "Anchorage",
  Honolulu: "Honolulú",
  Detroit: "Detroit",
  Toronto: "Toronto",
  Vancouver: "Vancouver",
  Edmonton: "Edmonton",
  Winnipeg: "Winnipeg",
  Halifax: "Halifax",
  Montreal: "Montreal",
  "St Johns": "San Juan de Terranova",
  // Latin America
  Bogota: "Bogotá",
  Lima: "Lima",
  Santiago: "Santiago",
  Caracas: "Caracas",
  "La Paz": "La Paz",
  Guayaquil: "Guayaquil",
  Asuncion: "Asunción",
  Montevideo: "Montevideo",
  "Sao Paulo": "São Paulo",
  "Buenos Aires": "Buenos Aires",
  Havana: "La Habana",
  Panama: "Panamá",
  "Costa Rica": "Costa Rica",
  Guatemala: "Guatemala",
  "El Salvador": "El Salvador",
  Tegucigalpa: "Tegucigalpa",
  Managua: "Managua",
  "Santo Domingo": "Santo Domingo",
  "Puerto Rico": "Puerto Rico",
  Jamaica: "Jamaica",
  // Spain and Europe
  Madrid: "Madrid",
  Ceuta: "Ceuta",
  Canary: "Canarias",
  London: "Londres",
  Paris: "París",
  Rome: "Roma",
  Lisbon: "Lisboa",
  Berlin: "Berlín",
  Brussels: "Bruselas",
  Vienna: "Viena",
  Zurich: "Zúrich",
  Moscow: "Moscú",
  Athens: "Atenas",
  Warsaw: "Varsovia",
  Prague: "Praga",
  Copenhagen: "Copenhague",
  Stockholm: "Estocolmo",
  Dublin: "Dublín",
};

/** Spanish city name for a humanized IANA tail ("Mexico City"), else the input. */
export function cityForLocale(city: string, locale: string): string {
  if (!locale.toLowerCase().startsWith("es")) return city;
  return CITY_ES[city] ?? city;
}
