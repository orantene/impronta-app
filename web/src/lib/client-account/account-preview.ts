/**
 * Builder Lab preview of the header `account` item (TUL-695).
 *
 * The live renderer always injects `siteChrome` (with `account` only when the
 * entry resolves on); the builder canvas never does. So "no siteChrome" is the
 * editor: show a static sample, signed out or signed in per the item's
 * `previewAs`. On a live site `previewAs` is ignored.
 */
export type AccountPreviewMode = "off" | "live" | "signed-in" | "signed-out";

export function accountPreviewMode(
  siteChrome: { account?: boolean } | undefined,
  previewAs: "signed-in" | "signed-out" | undefined,
): AccountPreviewMode {
  if (!siteChrome) return previewAs === "signed-in" ? "signed-in" : "signed-out";
  return siteChrome.account ? "live" : "off";
}
