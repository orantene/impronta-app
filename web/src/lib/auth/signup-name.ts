/**
 * TUL-762: the client sign-up name. Stored as `full_name` in the auth user metadata, which the
 * existing `handle_new_user` trigger already copies to the profile display name (0 migrations).
 * PURE: trims, strips control characters, collapses whitespace, caps the length.
 */

export const SIGNUP_NAME_MAX = 120;

export function sanitizeSignupName(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SIGNUP_NAME_MAX);
}

/** Supabase `options.data` for a signup that carries a name; undefined when there is none. */
export function signupNameMetadata(raw: unknown): { full_name: string } | undefined {
  const name = sanitizeSignupName(raw);
  return name ? { full_name: name } : undefined;
}
