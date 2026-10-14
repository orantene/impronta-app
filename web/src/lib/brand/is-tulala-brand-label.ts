/**
 * True when a strip item names the platform itself ("Tulala", "TULALA").
 * Those items render the real logo component, never a text wordmark.
 */
export function isTulalaBrandLabel(label: string | null | undefined): boolean {
  return (label ?? "").trim().toLowerCase() === "tulala";
}
