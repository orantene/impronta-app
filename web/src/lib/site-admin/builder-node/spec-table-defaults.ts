import type { BuilderSpecTableNode } from "./types";

/** Max authored rows (the desktop strip is one column per row). */
export const SPEC_TABLE_ROWS_MAX = 8;

/** Default props for a freshly inserted `spec_table` block. */
export const SPEC_TABLE_DEFAULT_PROPS: BuilderSpecTableNode["props"] = {
  eyebrow: "",
  title: "",
  rows: [
    { label: "Warranty", value: "Written, on labour" },
    { label: "Price", value: "Always before we start" },
    { label: "Payment", value: "On the visit" },
  ],
  useWebsiteTheme: true,
};

/** Fresh props for create / kit stamps (rows cloned). */
export function cloneSpecTableDefaultProps(): BuilderSpecTableNode["props"] {
  return {
    ...SPEC_TABLE_DEFAULT_PROPS,
    rows: (SPEC_TABLE_DEFAULT_PROPS.rows ?? []).map((r) => ({ ...r })),
  };
}
