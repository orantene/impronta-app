/**
 * TUL-1169: which field a signup form error belongs to, so only that field is
 * aria-invalid and points at the error line. Anything else is a form-level error.
 */
export type AuthErrorField = "email" | "consent" | "form";

export const AUTH_ERROR_IDS: Record<AuthErrorField, string> = {
  email: "auth-error-email",
  consent: "auth-error-consent",
  form: "auth-error-form",
};

export function authErrorField(
  error: string | null | undefined,
  messages: { invalidEmail: string; ageTermsRequired: string },
): AuthErrorField | null {
  if (!error) return null;
  if (error === messages.invalidEmail) return "email";
  if (error === messages.ageTermsRequired) return "consent";
  return "form";
}
