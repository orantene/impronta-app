/**
 * The line a talent's own service prints on a shared draft.
 *
 * A length option that already starts with the service name stays as written
 * ("Soft Gel Largo #3"). A short option is joined with a space ("Soft Gel
 * Largo #3" when the option is "#3"). Stackable extras follow with " + ".
 * Agency and menu lines keep the middot join in `addLine`.
 */

export function composeTalentOfferingLabel(input: {
  title: string;
  variantLabel?: string | null;
  addonLabels?: readonly string[];
}): string {
  const title = input.title.trim() || "Item";
  const variant = input.variantLabel?.trim() ?? "";
  let base = title;
  if (variant) {
    base = variant.toLowerCase().startsWith(title.toLowerCase()) ? variant : `${title} ${variant}`;
  }
  const extras = (input.addonLabels ?? []).map((label) => label.trim()).filter((label) => label.length > 0);
  return extras.length > 0 ? `${base} + ${extras.join(" + ")}` : base;
}
