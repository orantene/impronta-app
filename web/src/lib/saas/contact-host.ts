/** Host-dispatch for (public)/contact. Marketing gets the platform form. */
export function contactSurfaceForHostKind(
  kind: string,
): "marketing" | "storefront" {
  return kind === "marketing" ? "marketing" : "storefront";
}
