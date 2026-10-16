/** TUL-633 · validation for the platform-admin price-suggestion editor (pure, unit-tested). */

export type SuggestionPatch = { id: string; amountMajor: number; durationMinutes: number | null; status: "draft" | "approved" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSuggestionPatch(fd: FormData): { ok: true; patch: SuggestionPatch } | { ok: false; error: string } {
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, error: "Bad row id." };
  const amount = Number(String(fd.get("amount") ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return { ok: false, error: "Price must be between 0 and 100000." };
  const durRaw = String(fd.get("duration") ?? "").trim();
  let durationMinutes: number | null = null;
  if (durRaw) {
    const d = Number(durRaw);
    if (!Number.isInteger(d) || d < 5 || d > 1440) return { ok: false, error: "Minutes must be a whole number from 5 to 1440." };
    durationMinutes = d;
  }
  const status = String(fd.get("status") ?? "");
  if (status !== "draft" && status !== "approved") return { ok: false, error: "Status must be draft or approved." };
  return { ok: true, patch: { id, amountMajor: amount, durationMinutes, status } };
}

/** Major units to integer minor units (all currencies in the table are 2-decimal). */
export const toMinor = (major: number): number => Math.round(major * 100);
