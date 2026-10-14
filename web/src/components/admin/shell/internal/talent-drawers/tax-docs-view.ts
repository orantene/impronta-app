import type { TalentEarnings } from "@/lib/talent/earnings-types";

export type TaxDocsView = {
  currency: string;
  yearTotalCents: number;
  /** W-8BEN is a US form: only offered on USD accounts, never on MXN/other. */
  showW8: boolean;
  /** True when the ledger has no earnings, so the totals row is hidden. */
  empty: boolean;
};

/** Tax-docs figures come from the ledger bundle (same source as Money), never fixtures. */
export function taxDocsView(bundle: TalentEarnings): TaxDocsView {
  const currency = (bundle.totals.currency || "USD").toUpperCase();
  const yearTotalCents = bundle.totals.ytdNetCents;
  return {
    currency,
    yearTotalCents,
    showW8: currency === "USD",
    empty: yearTotalCents <= 0 && bundle.rows.length === 0,
  };
}
