/**
 * TUL-1256: ONE "things left" number for the talent profile. Today's quality
 * card counts the required website checklist slices; the More sheet used to
 * count every profile-completion field ("8 pending" vs "1 thing left").
 * Prefer the website checklist whenever it is known so both surfaces agree;
 * fall back to the profile-completion list only while that is unknown.
 */
export function profileLeftCount(input: {
  slices: ReadonlyArray<{ required: boolean; done: boolean | null }>;
  percent: number | null;
  completionMissing: number | null;
}): number | null {
  if (input.percent != null) {
    return input.slices.filter((s) => s.required && s.done === false).length;
  }
  return input.completionMissing;
}
