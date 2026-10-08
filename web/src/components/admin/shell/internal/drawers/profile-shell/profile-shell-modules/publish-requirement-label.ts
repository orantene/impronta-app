/**
 * Display-layer label for a publish requirement ("1 language", "2 more
 * photos", "a bio"). The server builds these in English
 * (`lib/field-engine/profile-publish-requirements.ts`) and that contract is not
 * changed; the coach maps them to the dashboard language here, including the
 * counted photo forms the static dictionary cannot hold.
 */
export function publishRequirementLabel(
  label: string,
  t: (value: string) => string,
  isSpanish: boolean,
): string {
  if (!isSpanish) return label;
  const more = /^(\d+) more photos?$/.exec(label);
  if (more) {
    const n = Number(more[1]);
    return n === 1 ? "1 foto más" : `${n} fotos más`;
  }
  return t(label);
}

/** "Add 1 language" / "Agregar 1 idioma": verb + localized object. */
export function addRequirementText(
  label: string,
  t: (value: string) => string,
  isSpanish: boolean,
): string {
  return isSpanish ? `Agregar ${publishRequirementLabel(label, t, true)}` : `Add ${label}`;
}
