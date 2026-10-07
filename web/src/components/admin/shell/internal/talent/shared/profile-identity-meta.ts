/** "pronouns · age" chip text; hides the "any" placeholder and a zero age. */
export function profileIdentityMeta(pronouns: string | null | undefined, age: number | null | undefined): string {
  const parts: string[] = [];
  if (pronouns && pronouns.trim() && pronouns.trim().toLowerCase() !== "any") parts.push(pronouns.trim());
  if (typeof age === "number" && age > 0) parts.push(String(age));
  return parts.join(" · ");
}
