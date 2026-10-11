/** Stable filter key for the uncategorised bucket (UI label "Otros" / "Other"). */
export const CATALOG_UNCATEGORISED_TAB = "__otros__";

export function catalogGroupTabKey(name: string | null | undefined): string {
  return name ?? CATALOG_UNCATEGORISED_TAB;
}

export function catalogGroupNavLabel(
  g: { name: string | null; label?: string | null },
  es: boolean,
): string {
  return g.label ?? g.name ?? (es ? "Otros" : "Other");
}
