/** TUL-767: true for GoTrue's "signed in with a right password but the email is not verified yet" error. PURE. */
export function isEmailNotConfirmed(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === "email_not_confirmed") return true;
  return typeof e.message === "string" && /email not confirmed/i.test(e.message);
}
