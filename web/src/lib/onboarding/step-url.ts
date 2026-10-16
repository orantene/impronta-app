/**
 * TUL-812: the wizard's current step mirrored into the address bar as `?step=`,
 * so the URL says where you are and a copied or refreshed link carries it.
 * Progress itself is restored by the saved-progress resume, not by the URL.
 * Pure, so it is unit tested.
 */
const STEP = /^[a-z][a-z0-9-]{0,40}$/;

export function urlWithStep(href: string, step: string | null | undefined): string {
  const url = new URL(href);
  if (step && STEP.test(step)) url.searchParams.set("step", step);
  else url.searchParams.delete("step");
  return url.toString();
}
