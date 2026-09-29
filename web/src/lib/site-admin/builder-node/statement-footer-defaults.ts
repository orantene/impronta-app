import type { BuilderStatementFooterNode } from "./types";

/** Default props for a freshly inserted `statement_footer` block. */
export const STATEMENT_FOOTER_DEFAULT_PROPS: BuilderStatementFooterNode["props"] = {
  statement: "Available for editorial, campaign, and portrait commissions.",
  creditLine: "{{displayName}}",
  contactLine: "Inquire for bookings",
  align: "center",
  showRule: true,
  useWebsiteTheme: true,
};

export type StatementFooterAlign = NonNullable<
  BuilderStatementFooterNode["props"]["align"]
>;

export const STATEMENT_FOOTER_ALIGNS: readonly StatementFooterAlign[] = [
  "start",
  "center",
] as const;

/** Fresh props for create / kit stamps. */
export function cloneStatementFooterDefaultProps(): BuilderStatementFooterNode["props"] {
  return { ...STATEMENT_FOOTER_DEFAULT_PROPS };
}
