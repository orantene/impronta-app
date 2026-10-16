/**
 * The understood card shows what the AI read ("haircut"). On the Spanish flow
 * a name that matches a pack service is shown with its Spanish label; anything
 * else is kept as said.
 */
import { BEAUTY_PACKS, packServiceFor } from "./essentials";

export function localizeServicesDisplay(value: string, locale: "en" | "es"): string {
  if (!value) return value;
  return value
    .split(/( · |, |\n)/)
    .map((part) => {
      const said = part.trim();
      if (!said || part === " · " || part === ", " || part === "\n") return part;
      for (const pack of Object.values(BEAUTY_PACKS)) {
        const hit = packServiceFor(pack, said);
        if (hit) return locale === "es" ? hit.es : hit.en;
      }
      return part;
    })
    .join("");
}
