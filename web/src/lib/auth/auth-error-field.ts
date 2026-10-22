/**
 * TUL-1169: which field a signup form error belongs to, so only that field is
 * aria-invalid, shows the error line and points at it. Anything else is a form-level error.
 */
import { isValidAuthEmail } from "@/lib/auth/otp-flow";

export type AuthErrorField = "name" | "email" | "consent" | "form";

export const AUTH_ERROR_IDS: Record<AuthErrorField, string> = {
  name: "auth-error-name",
  email: "auth-error-email",
  consent: "auth-error-consent",
  form: "auth-error-form",
};

export type AuthErrorMessages = {
  invalidEmail: string;
  ageTermsRequired: string;
  nameRequired?: string;
};

export function authErrorField(
  error: string | null | undefined,
  messages: AuthErrorMessages,
): AuthErrorField | null {
  if (!error) return null;
  if (messages.nameRequired && error === messages.nameRequired) return "name";
  if (error === messages.invalidEmail) return "email";
  if (error === messages.ageTermsRequired) return "consent";
  return "form";
}

/**
 * The first invalid signup field in VISUAL order (name, email, consent), checked on the
 * client before submit. Each answer names exactly one field; a valid field is never returned.
 */
export function firstInvalidSignupField(
  values: { collectName: boolean; name: unknown; email: unknown; consent: unknown },
): Exclude<AuthErrorField, "form"> | null {
  if (values.collectName && String(values.name ?? "").trim() === "") return "name";
  if (!isValidAuthEmail(String(values.email ?? "").trim())) return "email";
  if (!values.consent) return "consent";
  return null;
}

/** Message for a client-detected field error. */
export function clientErrorMessage(
  field: Exclude<AuthErrorField, "form">,
  messages: Required<AuthErrorMessages>,
): string {
  return field === "name"
    ? messages.nameRequired
    : field === "email"
      ? messages.invalidEmail
      : messages.ageTermsRequired;
}
