import type { BuilderPortfolioNode } from "./types";

/** Default props for a freshly inserted `portfolio` block (W-12). */
export const PORTFOLIO_DEFAULT_PROPS: BuilderPortfolioNode["props"] = {
  layout: "grid",
  eyebrow: "",
  title: "Recent work",
  columns: 3,
  showCaptions: false,
  selectionMode: "all",
  autoIncludeNew: true,
  limit: 12,
  linkMode: "offering",
  emptyMessage: "No photos in your portfolio yet.",
  useWebsiteTheme: true,
  chapterNumber: 1,
  creditLine: "",
  albumId: "",
};

export type PortfolioLayout = NonNullable<BuilderPortfolioNode["props"]["layout"]>;

export const PORTFOLIO_LAYOUTS: readonly PortfolioLayout[] = [
  "filmstrip",
  "grid",
  "masonry",
  "contact_sheet",
  "chapter",
  "staggered",
  "work_order",
] as const;

/** Roman numeral for chapter index (clamped 1–20). Shared, not Folio-only. */
export function portfolioChapterRoman(n: number | undefined | null): string {
  const clamped = Math.min(Math.max(Math.floor(Number(n) || 1), 1), 20);
  const ones = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  const tens = ["", "X", "XX"];
  return `${tens[Math.floor(clamped / 10)] ?? ""}${ones[clamped % 10] ?? "I"}`;
}
