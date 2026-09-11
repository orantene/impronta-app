export function moneyLabel(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  return `${currency} ${amount}`.trim();
}

export function clockLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "V";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function isVisitorName(name: string): boolean {
  return name.trim() === "" || name.trim().toLowerCase() === "visitor";
}
