/**
 * Locale-correct links for the published site shell.
 *
 * ONE DESIGN PER PAGE (#1345) localized the hrefs authored in a page BODY, but
 * the header and footer are a separate surface and kept shipping primary-locale
 * links: on Impronta's Spanish site the logo pointed at `/` and the footer
 * CONTACT at `/p/contact`, dropping a Spanish visitor onto the English page from
 * the chrome that appears on EVERY route.
 *
 * Safe to apply to the whole tree: the LANGUAGE SWITCHER's links are not in it —
 * they are built at render time from `options.availableLocales` (render.tsx,
 * `navMenuLocales`), so localizing the tree cannot rewrite the one control whose
 * links must point at OTHER locales.
 *
 * Idempotent and a no-op on the primary locale (`withLocalePath` strips any
 * existing prefix before adding one), so a shell row whose links were already
 * authored `/es/...` stays correct rather than becoming `/es/es/...`.
 *
 * Lives here rather than inline in `PublishedShell.tsx`: that file is on the
 * 800-line ratchet.
 */
import { localeUrlSettings } from "@/i18n/pathnames";
import { localizeHrefsDeep } from "@/lib/saas/locale-hrefs-deep";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  prepareShellTree,
  type ShellSnapshotSlotLike,
} from "@/lib/site-admin/builder-node/shell-render-plan";
import { resolveSnapshotBuilderTree } from "@/lib/site-admin/builder-node/snapshot-tree";

/**
 * Prepare the shell tree for rendering AND prefix every internal href for the
 * locale being rendered. The two steps live together so the caller has one
 * statement instead of two — `PublishedShell.tsx` is one line under its
 * 800-line ratchet, and this is the only site that prepares a shell tree.
 */
export async function prepareLocalizedShellTree(
  snapshot: Parameters<typeof resolveSnapshotBuilderTree>[0],
  slots: ReadonlyArray<ShellSnapshotSlotLike>,
  tenantId: string,
  locale: string,
): Promise<BuilderNodeTree> {
  const prepared = prepareShellTree(
    resolveSnapshotBuilderTree(snapshot).tree,
    slots,
  );
  const settings = await loadTenantLocaleSettings(tenantId);
  return localizeHrefsDeep(
    prepared.tree,
    locale,
    localeUrlSettings(settings.defaultLocale, settings.supportedLocales),
  );
}
