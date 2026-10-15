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
