/**
 * TUL-1068 #1: "Select" on a service/class row must never leave the page.
 * The page's catalog island takes the request when it owns the offering; when
 * nobody does (a workspace site with no booking sheet, where `/w/<slug>/book`
 * is an empty-state dead end that wipes the widget), the row is added to the
 * guest's inquiry instead, the same as its "Add to inquiry" button.
 */
export type SelectOutcome = "island" | "added" | "none";

export function selectCatalogRow(opts: {
  offeringId: string | null;
  requestIsland: (offeringId: string) => boolean;
  addToInquiry: () => void;
}): SelectOutcome {
  if (!opts.offeringId) return "none";
  if (opts.requestIsland(opts.offeringId)) return "island";
  opts.addToInquiry();
  return "added";
}
