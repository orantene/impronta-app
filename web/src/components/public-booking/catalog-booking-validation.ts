/**
 * TUL-841 / TUL-843: guest booking form validation helpers (pure + one DOM helper).
 * Errors are silent until the guest presses submit; after that they are live.
 * On a failed submit the first invalid field (in page order) is scrolled into
 * view and focused, so a field below the fold never fails silently.
 */

export type WhoFieldTestId = "cb-name" | "cb-phone" | "cb-email" | "cb-service-address";

/** First invalid field in the order the form renders them, or null when all pass. */
export function firstInvalidWhoField(v: {
  nameValid: boolean;
  phoneValid: boolean;
  emailValid: boolean;
  addressValid: boolean;
}): WhoFieldTestId | null {
  if (!v.nameValid) return "cb-name";
  if (!v.phoneValid) return "cb-phone";
  if (!v.emailValid) return "cb-email";
  if (!v.addressValid) return "cb-service-address";
  return null;
}

/** Scroll the field to the middle of the sheet and focus it (no second jump). */
export function focusBookingField(testId: WhoFieldTestId, root: ParentNode = document): boolean {
  const el = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) return false;
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus({ preventScroll: true });
  return true;
}
