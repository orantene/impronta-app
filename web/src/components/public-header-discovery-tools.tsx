"use client";

import { DirectoryDiscoveryHeaderActions } from "@/components/directory/directory-discovery-header-actions";
import type { DirectoryDiscoveryHeaderCopy } from "@/components/directory/directory-discovery-header-actions";
import { SavedEntryButton } from "@/components/directory/saved-entry-button";
import type { Locale } from "@/i18n/config";
import { publicLocaleHref } from "@/i18n/client-directory-href";

export function PublicHeaderDiscoveryTools({
  locale,
  pathnameWithoutLocale,
  initialSavedCount,
  directoryHeaderCopy,
  savedDirectoryAria,
}: {
  locale: Locale;
  /** From middleware `x-impronta-original-pathname` — not `usePathname()` (rewritten URL breaks /es). */
  pathnameWithoutLocale: string;
  initialSavedCount: number;
  directoryHeaderCopy: DirectoryDiscoveryHeaderCopy;
  savedDirectoryAria: string;
}) {
  const directoryHref = publicLocaleHref(
    pathnameWithoutLocale,
    "/directory",
    locale,
  );

  if (pathnameWithoutLocale === "/directory") {
    return (
      <DirectoryDiscoveryHeaderActions
        initialCount={initialSavedCount}
        copy={directoryHeaderCopy}
      />
    );
  }

  return (
    <SavedEntryButton
      href={directoryHref}
      initialCount={initialSavedCount}
      ariaLabel={savedDirectoryAria}
    />
  );
}
