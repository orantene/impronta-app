/**
 * TUL-1785: "Concierge QA Instant" showed its name twice because the role line was the same text as the name. A role
 * line that only repeats the name tells the visitor nothing, so it is dropped (the name stays, once). Compared without
 * case, accents or extra spaces so "  Concierge QA instant " and "concierge qa instant" count as the same.
 */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function roleLineFor(name: string | null | undefined, role: string | null | undefined): string | null {
  const r = role?.trim();
  if (!r) return null;
  if (name && norm(name) === norm(r)) return null;
  return r;
}
