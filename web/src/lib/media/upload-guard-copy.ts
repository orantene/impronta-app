/**
 * upload-guard-copy.ts: the user-facing words for every H1 upload refusal,
 * in en + es (`dashboard.uploadGuard.*`). Client-safe and import-free so the
 * browser pre-checks and the server actions say exactly the same thing.
 */

export type UploadGuardCode =
  | "not_an_image"
  | "markup"
  | "type_not_allowed"
  | "executable"
  | "too_large"
  | "too_many_pixels"
  | "unreadable"
  | "private_link";

/** `t` is any dashboard translator (`createTranslator(locale)` or `useT()`). */
export function uploadGuardMessage(t: (key: string) => string, code: UploadGuardCode): string {
  switch (code) {
    case "not_an_image":
      return t("dashboard.uploadGuard.notAnImage");
    case "type_not_allowed":
      return t("dashboard.uploadGuard.typeNotAllowed");
    case "markup":
    case "executable":
      return t("dashboard.uploadGuard.blockedFile");
    case "too_large":
      return t("dashboard.uploadGuard.tooLarge");
    case "too_many_pixels":
      return t("dashboard.uploadGuard.tooManyPixels");
    case "unreadable":
      return t("dashboard.uploadGuard.unreadable");
    case "private_link":
      return t("dashboard.uploadGuard.privateLink");
  }
}
