import { DirectoryDiscoveryHeaderActions } from "@/components/directory/directory-discovery-header-actions";
import type { DirectoryDiscoveryHeaderCopy } from "@/components/directory/directory-discovery-header-actions";

/**
 * Mounts the two-icon discovery header (bookmark = favorites drawer,
 * plane = inquiry cart drawer) on every public page. The icons live in
 * the global public shell (`PublicHeader`); behavior is identical across
 * home, /directory, /p/*, talent profiles, etc.
 */
export function PublicHeaderDiscoveryTools({
  initialFavoritesCount,
  initialCartCount,
  directoryHeaderCopy,
}: {
  initialFavoritesCount: number;
  initialCartCount: number;
  directoryHeaderCopy: DirectoryDiscoveryHeaderCopy;
}) {
  return (
    <DirectoryDiscoveryHeaderActions
      initialFavoritesCount={initialFavoritesCount}
      initialCartCount={initialCartCount}
      copy={directoryHeaderCopy}
    />
  );
}
