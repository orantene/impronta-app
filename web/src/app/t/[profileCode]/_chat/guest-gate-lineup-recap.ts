/**
 * buildGateLineupRecap — the quiet contact-gate recap line anchoring the value
 * of the ask (Phase 6). Extracted verbatim from MiniChatPanelColumn.tsx (W1-A
 * decomposition pre-pass) to keep that file under the 800-line cap. No logic
 * changes.
 */

import { interpolate } from "@/i18n/interpolate";
import { firstNameOf } from "./mini-chat-styles";

/**
 * Build the quiet contact-gate recap line anchoring the value of the ask, e.g.
 * "We will use this to send you {agency} reply about {Jane, +2}". Lists the
 * lineup talent FIRST names with a +N overflow (max two named, then +remaining).
 * Returns null when the lineup is empty so the gate renders without a recap.
 */
export function buildGateLineupRecap(
  cartTalentNames: string[],
  agencyName: string,
  t: (key: string) => string,
): string | null {
  const names = cartTalentNames
    .map((n) => firstNameOf(n))
    .filter((n) => n.length > 0);
  if (names.length === 0) return null;

  const MAX_NAMED = 2;
  const namedList =
    names.length > MAX_NAMED
      ? interpolate(t("public.guestChat.gateRecapOverflow"), {
          names: names.slice(0, MAX_NAMED).join(", "),
          count: names.length - MAX_NAMED,
        })
      : names.join(", ");

  return interpolate(t("public.guestChat.gateRecapOne"), {
    agency: agencyName || t("public.guestChat.sectionTalent"),
    names: namedList,
  });
}
