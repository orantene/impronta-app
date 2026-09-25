/**
 * Publication words for talent catalogue rows.
 *
 * The database still stores status as draft | published | archived.
 * Hidden is derived: draft + first_published_at set.
 */

export type PublicationWord = "draft" | "live" | "hidden" | "archived";

export type PublicationInput = {
  status: "draft" | "published" | "archived" | string;
  firstPublishedAt?: string | null;
};

export function publicationWord(input: PublicationInput): PublicationWord {
  if (input.status === "archived") return "archived";
  if (input.status === "published") return "live";
  if (input.firstPublishedAt) return "hidden";
  return "draft";
}

export function publicationLabel(word: PublicationWord, locale: string): string {
  const es = locale.toLowerCase().startsWith("es");
  switch (word) {
    case "live":
      return es ? "En vivo" : "Live";
    case "hidden":
      return es ? "Oculto" : "Hidden";
    case "archived":
      return es ? "Archivado" : "Archived";
    default:
      return es ? "Borrador" : "Draft";
  }
}

export function bookingModeLabel(
  input: { bookingMode: string; priceDisplay: string; priceType?: string; amountCents?: number | null },
  locale: string,
): string {
  const es = locale.toLowerCase().startsWith("es");
  if (input.priceDisplay === "quote" || input.priceType === "custom" || input.amountCents == null) {
    return es ? "Pedir cotización" : "Request a quote";
  }
  if (input.bookingMode === "instant") return es ? "Reserva instantánea" : "Instant booking";
  return es ? "Pedir reserva" : "Request to book";
}

export function foldAccent(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function categoryNearMatch(a: string, b: string): boolean {
  const left = foldAccent(a);
  const right = foldAccent(b);
  if (!left || !right || left === right) return left === right && left.length > 0;
  if (left.includes(right) || right.includes(left)) return true;
  return editDistance(left, right) <= 2;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function parseOfferingLine(line: string): {
  title: string;
  amountCents: number | null;
  durationMinutes: number | null;
  kind: "service" | "product";
} | null {
  const raw = line.trim();
  if (!raw) return null;
  const kind: "service" | "product" =
    /\b(producto|product|kit)\b/i.test(raw) ? "product" : "service";
  const minutesMatch = raw.match(/\((\d+)\s*min\)/i);
  const durationMinutes = minutesMatch ? Number(minutesMatch[1]) : null;
  const withoutMins = raw.replace(/\(\d+\s*min\)/i, "").replace(/\(producto\)/i, "").trim();
  const priceMatch = withoutMins.match(/(\d+(?:[.,]\d{1,2})?)\s*$/);
  const amountCents = priceMatch
    ? Math.round(Number(priceMatch[1].replace(",", ".")) * 100)
    : null;
  const title = (priceMatch ? withoutMins.slice(0, priceMatch.index).trim() : withoutMins).replace(/\s+/g, " ");
  if (!title) return null;
  return { title, amountCents, durationMinutes, kind };
}
