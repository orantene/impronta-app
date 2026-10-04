/**
 * Display helpers for Money spine (M2). Amounts are major units (pesos).
 * September weekday labels match prototype `mcD` (Tue=1 Sep 2026).
 */

const WK = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"] as const;

export function formatMoneyMajor(amount: number, currency = "MXN"): string {
  const n = Math.round(amount);
  const withCommas = n.toLocaleString("en-US");
  return `$${withCommas} ${currency}`;
}

/** Compact amount without currency code — e.g. `$620`. */
export function formatMoneyShort(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** Prototype `mcD`: day-of-month in September 2026 → "Tue 22 Sep". */
export function formatSeptemberDay(day: number): string {
  const d = Math.max(1, Math.min(31, Math.floor(day)));
  return `${WK[(d - 1) % 7]} ${d} Sep`;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function methodLabel(method: "card" | "cash" | "transfer"): string {
  if (method === "card") return "Card · through Tulala";
  if (method === "cash") return "Cash · recorded by you";
  return "Transfer · recorded by you";
}
