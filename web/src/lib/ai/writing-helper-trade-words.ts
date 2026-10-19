/**
 * TUL-993. The writing helper's "what they do" fact is the catalogue title
 * ("Fotógrafo de retratos", masculine/singular by convention). The person's own
 * text says "fotógrafa". Anything that swaps the person's word for the title
 * (the fact line the model copies, or the model echoing it) drops their
 * gender and number. These pure helpers resolve the person's own form of the
 * title from their text before the model, and put it back after the model.
 * Pure, no I/O.
 */

const WORD_RE = /[\p{L}\p{M}]+/gu;

function fold(w: string): string {
  return w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Gender/number-insensitive key: fotógrafo, fotógrafa, fotógrafos, fotografas share "fotograf". */
export function tradeWordKey(word: string): string {
  const w = fold(word);
  if (w.length <= 3) return w;
  let k = w.replace(/s$/, "");
  if (k.length > 3) k = k.replace(/[oae]$/, "");
  return k;
}

function lowerUnlessAcronym(w: string): string {
  return w.length <= 4 && w === w.toUpperCase() && w !== w.toLowerCase() ? w : w.toLowerCase();
}

function matchCase(from: string, to: string): string {
  const first = from.charAt(0);
  return first !== first.toLowerCase() && to.length ? to.charAt(0).toUpperCase() + to.slice(1) : to;
}

/**
 * The trade phrase in the person's own gender/number: each word of the
 * catalogue title is replaced by the same-key word found in `ownText`; words
 * with no counterpart keep the title's form. Lowercased (acronyms kept).
 */
export function resolveOwnTradeWords(label: string, ownText: string): string {
  const own = new Map<string, string>();
  for (const m of ownText.matchAll(WORD_RE)) {
    const key = tradeWordKey(m[0]);
    if (key.length > 3 && !own.has(key)) own.set(key, m[0]);
  }
  return label.replace(WORD_RE, (w) => lowerUnlessAcronym(own.get(tradeWordKey(w)) ?? w)).trim();
}

/**
 * After the model: any word that is the title's form of a trade word the
 * person wrote differently is put back to the person's form.
 */
export function restoreOwnTradeWords(output: string, label: string, ownPhrase: string): string {
  const labelWords = label.match(WORD_RE) ?? [];
  const ownWords = ownPhrase.match(WORD_RE) ?? [];
  if (labelWords.length !== ownWords.length) return output;
  const swap = new Map<string, string>();
  labelWords.forEach((lw, i) => {
    const ow = ownWords[i];
    const key = tradeWordKey(lw);
    if (key.length > 3 && fold(lw) !== fold(ow)) swap.set(key, ow);
  });
  if (swap.size === 0) return output;
  return output.replace(WORD_RE, (w) => {
    const to = swap.get(tradeWordKey(w));
    return to ? matchCase(w, to) : w;
  });
}
