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
  // TUL-822: the rest of the browser's IANA list where standard Spanish differs from the
  // English tail (accent, exonym or translation). Names that read the same in Spanish
  // are deliberately not listed; a miss falls back to the English tail.
  // Africa
  Abidjan: "Abiyán", Accra: "Acra", "Addis Ababa": "Adís Abeba", Algiers: "Argel", Asmera: "Asmara",
  Bissau: "Bisáu", Bujumbura: "Buyumbura", Cairo: "El Cairo", Conakry: "Conakri",
  Djibouti: "Yibuti", Douala: "Duala", "El Aaiun": "El Aaiún", Johannesburg: "Johannesburgo", Juba: "Yuba",
  Khartoum: "Jartum", Lome: "Lomé", Mogadishu: "Mogadiscio", Ndjamena: "Yamena", Nouakchott: "Nuakchot",
  Ouagadougou: "Uagadugú", "Porto-Novo": "Portonovo", "Sao Tome": "Santo Tomé", Tripoli: "Trípoli", Tunis: "Túnez",
  // Americas and Caribbean
  Araguaina: "Araguaína", Bahia: "Bahía", Belem: "Belém", Belize: "Belice",
  Bermuda: "Bermudas", Cayenne: "Cayena", Cayman: "Caimán", Cordoba: "Córdoba", Cuiaba: "Cuiabá",
  Curacao: "Curazao", Eirunepe: "Eirunepé", Godthab: "Nuuk", "Grand Turk": "Gran Turca", Grenada: "Granada",
  Guadeloupe: "Guadalupe", Indianapolis: "Indianápolis", Maceio: "Maceió", Manaus: "Manaos", Martinique: "Martinica",
  Miquelon: "Miquelón", "Port of Spain": "Puerto España", "Port-au-Prince": "Puerto Príncipe", Santarem: "Santarém",
  "St Barthelemy": "San Bartolomé", "St Helena": "Santa Elena", "St Kitts": "San Cristóbal", "St Lucia": "Santa Lucía",
  "St Thomas": "Santo Tomás", "St Vincent": "San Vicente", Tortola: "Tórtola", Tucuman: "Tucumán",
  "Rio Branco": "Río Branco", "Rio Gallegos": "Río Gallegos",
  // Asia and Middle East
  Amman: "Amán", Ashgabat: "Asjabad", Baghdad: "Bagdad", Bahrain: "Baréin", Baku: "Bakú",
  Brunei: "Brunéi", Calcutta: "Calcuta", Damascus: "Damasco", Dhaka: "Daca", Dubai: "Dubái", Dushanbe: "Dusambé",
  Hebron: "Hebrón", Istanbul: "Estambul", Jakarta: "Yakarta", Jerusalem: "Jerusalén", Katmandu: "Katmandú",
  Macau: "Macao", Makassar: "Macasar", Muscat: "Mascate", Pyongyang: "Pionyang", Qatar: "Catar", Qostanay: "Kostanái",
  Rangoon: "Rangún", Riyadh: "Riad", Saigon: "Ciudad Ho Chi Minh", Samarkand: "Samarcanda", Seoul: "Seúl",
  Shanghai: "Shanghái", Singapore: "Singapur", Taipei: "Taipéi", Tashkent: "Taskent", Tehran: "Teherán",
  Thimphu: "Timbu", Tokyo: "Tokio", Ulaanbaatar: "Ulán Bator", Vientiane: "Vientián", Yerevan: "Ereván",
  // Europe and Russia
  Amsterdam: "Ámsterdam", Astrakhan: "Astracán", Belgrade: "Belgrado", Bucharest: "Bucarest", Busingen: "Büsingen",
  Faeroe: "Feroe", "Isle of Man": "Isla de Man", Kaliningrad: "Kaliningrado", Kirov: "Kírov",
  Ljubljana: "Liubliana", Luxembourg: "Luxemburgo", Monaco: "Mónaco", Saratov: "Sarátov", Skopje: "Skopie",
  Sofia: "Sofía", Tallinn: "Tallin", Tirane: "Tirana", Ulyanovsk: "Uliánovsk", Vatican: "Ciudad del Vaticano",
  Vilnius: "Vilna", Volgograd: "Volgogrado", Yekaterinburg: "Ekaterimburgo", Simferopol: "Simferópol",
  Chisinau: "Chisináu", Barnaul: "Barnaúl", Anadyr: "Anádyr", Chita: "Chitá", Magadan: "Magadán", Sakhalin: "Sajalín",
  Srednekolymsk: "Srednekolimsk",
  // Oceania, islands and polar
  Adelaide: "Adelaida", Christmas: "Navidad", "Cape Verde": "Cabo Verde", Comoro: "Comoras", Easter: "Isla de Pascua",
  Fiji: "Fiyi", Galapagos: "Galápagos", Maldives: "Maldivas", Mauritius: "Mauricio", Palau: "Palaos", Ponape: "Pohnpei",
  Reunion: "Reunión", "South Georgia": "Georgia del Sur", Sydney: "Sídney", Tahiti: "Tahití", Truk: "Chuuk",
  Noumea: "Numea", Saipan: "Saipán",
  // Browsers differ on legacy vs current spellings of the same zone; both resolve.
  Kolkata: "Calcuta", Kathmandu: "Katmandú", Yangon: "Rangún", "Ho Chi Minh": "Ciudad Ho Chi Minh", Kyiv: "Kiev", Faroe: "Feroe",
};

/** Spanish city name for a humanized IANA tail ("Mexico City"), else the input. */
export function cityForLocale(city: string, locale: string): string {
  if (!locale.toLowerCase().startsWith("es")) return city;
  return CITY_ES[city] ?? city;
}

const strip = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Zone labels printed in either language ("1:00 PM Cancun"): only the ACCENT is restored
 * ("Cancún", "Mérida"), never a translation, so English copy is untouched otherwise (TUL-702).
 */
export function cityWithAccents(city: string): string {
  const es = CITY_ES[city];
  return es && strip(es) === strip(city) ? es : city;
}
