import { profileLocaleMessagesScript } from "@/i18n/profile-locale-client-messages";

/** Inline script handing the browser translator the profile locale's catalogs when it differs from the request locale. */
export function ProfileLocaleMessages({ profileLocale, requestLocale }: { profileLocale: string; requestLocale: string }) {
  const script = profileLocaleMessagesScript(profileLocale, requestLocale);
  return script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null;
}
