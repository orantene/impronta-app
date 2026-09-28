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
};

export type PortfolioLayout = NonNullable<BuilderPortfolioNode["props"]["layout"]>;

export const PORTFOLIO_LAYOUTS: readonly PortfolioLayout[] = [
  "filmstrip",
  "grid",
  "masonry",
  "contact_sheet",
] as const;
