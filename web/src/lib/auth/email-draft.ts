/**
 * TUL-768: the sign-in email survives switching between the code and password
 * lanes. Each lane is its own component (the toggle remounts the form), so the
 * typed address is kept here, in memory only, for the page's lifetime.
 */
let draft = "";

export function readAuthEmailDraft(): string {
  return draft;
}

export function writeAuthEmailDraft(value: string): void {
  draft = value;
}

/**
 * The address a lane should show: what the visitor typed (the draft) wins over the
 * page's `?email=` default, which only seeds an empty form. TUL-768 round 2: the
 * code lane preferred `defaultEmail`, so password -> code showed the default or an
 * empty box instead of the typed address.
 */
export function pickAuthEmail(draft: string | null | undefined, defaultEmail: string | null | undefined): string {
  return draft || defaultEmail || "";
}
