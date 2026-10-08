/**
 * One-line summary above the Services list: "3 items need attention: 1 has no
 * photo, 2 have no price yet." Singular/plural agree, parts that are zero are
 * left out (it used to print "0 have no price yet, 0 is sold out"), and the
 * sentence is built per locale instead of gluing English fragments.
 */
export type AttentionCounts = {
  total: number;
  noPhoto: number;
  noPrice: number;
  soldOut: number;
};

export function attentionSummary(c: AttentionCounts, locale: string): string {
  const es = locale.toLowerCase().startsWith("es");
  const parts: string[] = [];
  if (es) {
    if (c.noPhoto > 0) parts.push(`${c.noPhoto} sin foto`);
    if (c.noPrice > 0) parts.push(`${c.noPrice} sin precio todavía`);
    if (c.soldOut > 0) parts.push(`${c.soldOut} ${c.soldOut === 1 ? "agotado" : "agotados"}`);
  } else {
    if (c.noPhoto > 0) parts.push(`${c.noPhoto} ${c.noPhoto === 1 ? "has" : "have"} no photo`);
    if (c.noPrice > 0) parts.push(`${c.noPrice} ${c.noPrice === 1 ? "has" : "have"} no price yet`);
    if (c.soldOut > 0) parts.push(`${c.soldOut} ${c.soldOut === 1 ? "is" : "are"} sold out`);
  }
  const overlap = c.noPhoto + c.noPrice + c.soldOut > c.total;
  const head = es
    ? `${c.total} ${c.total === 1 ? "elemento necesita" : "elementos necesitan"} atención`
    : `${c.total} ${c.total === 1 ? "item needs" : "items need"} attention`;
  const detail = parts.length > 0 ? `: ${parts.join(", ")}.` : ".";
  const note = overlap && parts.length > 1
    ? es ? " Algunos tienen más de uno." : " Some have more than one of these."
    : "";
  return `${head}${detail}${note}`;
}
