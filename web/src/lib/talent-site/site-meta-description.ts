/**
 * TUL-798: the talent home meta description when the talent wrote none. Built only from facts the
 * site already holds (name, city, published service names), never from the platform blurb.
 * Pure: no DB, no server-only.
 */
const MAX = 155;

function clamp(t: string): string {
  if (t.length <= MAX) return t;
  const cut = t.slice(0, MAX - 3);
  const at = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  return `${(at > 40 ? cut.slice(0, at) : cut).replace(/[,;:\s]+$/, "")}...`;
}

export function deriveSiteDescription(input: {
  name: string | null | undefined;
  city?: string | null;
  serviceNames?: readonly string[] | null;
  locale: string;
}): string | undefined {
  const name = input.name?.trim();
  if (!name) return undefined;
  const es = !input.locale.toLowerCase().startsWith("en");
  const city = input.city?.trim();
  const names = Array.from(new Set((input.serviceNames ?? []).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))).slice(0, 4);
  const who = es ? `${name}${city ? ` en ${city}` : ""}` : `${name}${city ? ` in ${city}` : ""}`;
  if (names.length === 0) return clamp(es ? `Sitio oficial de ${who}. Reserva en línea.` : `Official site of ${who}. Book online.`);
  const list = names.join(", ");
  return clamp(es ? `${who}: ${list}. Reserva en línea.` : `${who}: ${list}. Book online.`);
}
