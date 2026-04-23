/**
 * Phase 5 / M5 — public renderer for CMS-composed homepage sections.
 *
 * Given a `HomepageSnapshot` (from `published_homepage_snapshot`), this
 * component dispatches each slot entry to the matching `SectionRegistryEntry`
 * Component. Snapshot props are migrated to the registry's current schema
 * version via `migrateSectionPayload` — older published pages keep rendering
 * after a type-version bump without forcing a re-publish.
 *
 * Carry-forward discipline:
 *   - The snapshot is frozen at homepage-publish time. Subsequent edits (or
 *     even re-publishes) of a referenced section have ZERO effect on the
 *     storefront until the operator re-publishes the homepage. That rule is
 *     enforced upstream (`loadPublicHomepage` reads the snapshot, never the
 *     junction rows); this renderer just displays what it's given.
 *   - Unknown / removed section types are rendered as nothing, with a warn
 *     log in development. An archived section that a rollback happened to
 *     reference would have been filtered out at restore time.
 *   - We never render section props inline from free-form JSON: every render
 *     goes through a registry entry with a Zod-parsed payload.
 */
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import {
  SECTION_REGISTRY,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import {
  migrateSectionPayload,
  type SectionRegistryEntry,
} from "@/lib/site-admin/sections/types";

interface HomepageCmsSectionsProps {
  snapshot: HomepageSnapshot;
  tenantId: string;
  locale: string;
  /** Restrict rendering to a specific slot key (e.g. `"hero"`). */
  onlySlot?: string;
}

export async function HomepageCmsSections({
  snapshot,
  tenantId,
  locale,
  onlySlot,
}: HomepageCmsSectionsProps) {
  const entries = onlySlot
    ? snapshot.slots.filter((s) => s.slotKey === onlySlot)
    : snapshot.slots;
  if (entries.length === 0) return null;

  // Edit-mode wrapper: when active, each rendered section is wrapped in a
  // div carrying section identity so the client chrome can target it for
  // hover/selection overlays. View mode renders identically to before.
  const editMode = await isEditModeActiveForTenant(tenantId);

  return (
    <>
      {entries.map((entry) => {
        // Registry entries are keyed by type key; we widen to the generic
        // `SectionRegistryEntry` to hand off to the version-agnostic
        // `migrateSectionPayload` helper.
        const registryEntry = SECTION_REGISTRY[
          entry.sectionTypeKey as SectionTypeKey
        ] as SectionRegistryEntry | undefined;
        if (!registryEntry) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[homepage-cms-sections] unknown section_type_key; skipping",
              { slotKey: entry.slotKey, type: entry.sectionTypeKey },
            );
          }
          return null;
        }
        let migrated: { version: number; payload: unknown };
        try {
          migrated = migrateSectionPayload(
            registryEntry,
            entry.schemaVersion,
            entry.props,
          );
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[homepage-cms-sections] migration failed; skipping section",
              {
                slotKey: entry.slotKey,
                type: entry.sectionTypeKey,
                from: entry.schemaVersion,
                to: registryEntry.currentVersion,
                error: (error as Error).message,
              },
            );
          }
          return null;
        }
        const Component = registryEntry.Component;
        const key = `${entry.slotKey}:${entry.sectionId}:${entry.sortOrder}`;
        const rendered = (
          <Component
            key={key}
            props={migrated.payload as never}
            tenantId={tenantId}
            locale={locale}
            preview={false}
          />
        );
        if (!editMode) return rendered;
        return (
          <div
            key={`wrap:${key}`}
            data-cms-section=""
            data-section-id={entry.sectionId}
            data-section-type-key={entry.sectionTypeKey}
            data-slot-key={entry.slotKey}
            data-sort-order={entry.sortOrder}
          >
            {rendered}
          </div>
        );
      })}
    </>
  );
}
