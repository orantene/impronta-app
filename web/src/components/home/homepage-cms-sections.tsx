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
import { presentationScopedCss, presentationVideoBackground } from "@/lib/site-admin/sections/shared/presentation";

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
          // In edit-mode we render a visible placeholder so the operator
          // notices an orphaned section reference (e.g. a section type
          // that was retired after publish). View mode renders nothing
          // to avoid leaking debug chrome to public visitors.
          if (editMode) {
            return (
              <div
                key={`orphan:${entry.slotKey}:${entry.sectionId}:${entry.sortOrder}`}
                data-cms-section-orphan=""
                className="mx-4 my-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-300"
              >
                <strong>Section unavailable:</strong> the type{" "}
                <code>{entry.sectionTypeKey}</code> is no longer registered.
                Remove this slot entry from the homepage composer or restore
                the section type in code.
              </div>
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
          if (editMode) {
            return (
              <div
                key={`migfail:${entry.slotKey}:${entry.sectionId}:${entry.sortOrder}`}
                data-cms-section-orphan=""
                className="mx-4 my-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-300"
              >
                <strong>Section payload out of date:</strong> snapshot v
                {entry.schemaVersion} could not migrate to v
                {registryEntry.currentVersion} for{" "}
                <code>{entry.sectionTypeKey}</code>. Re-publish the homepage
                to refresh the snapshot.
              </div>
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
            sectionId={entry.sectionId}
          />
        );
        // Pixel-first companion: emit per-section scoped CSS when the
        // operator wrote any custom CSS. Scoped to the wrapper's
        // `data-section-id` attribute so it can't leak across sections.
        const payload = migrated.payload as { presentation?: unknown };
        const presentation = (payload?.presentation ?? undefined) as Parameters<typeof presentationScopedCss>[1];
        const scopedCss = presentationScopedCss(entry.sectionId, presentation);
        const videoBg = presentationVideoBackground(presentation);
        // Wrap unconditionally (visitor + edit mode). Visitor mode needs the
        // wrapper for scoped CSS targeting; edit mode adds chrome attrs the
        // selection layer reads.
        //
        // When a section has a video background, the wrapper becomes a
        // positioned container (relative + overflow:hidden) and a <video>
        // is injected as the first child, behind the section content via
        // z-index. The actual section markup is unchanged.
        return (
          <div
            key={`wrap:${key}`}
            data-cms-section=""
            data-section-id={entry.sectionId}
            data-section-type-key={entry.sectionTypeKey}
            data-slot-key={entry.slotKey}
            data-sort-order={entry.sortOrder}
            style={
              videoBg
                ? { position: "relative", overflow: "hidden", isolation: "isolate" }
                : undefined
            }
          >
            {scopedCss ? (
              <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
            ) : null}
            {videoBg ? (
              <>
                <video
                  src={videoBg.src}
                  poster={videoBg.poster}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    zIndex: -2,
                    pointerEvents: "none",
                  }}
                />
                {typeof videoBg.overlay === "number" && videoBg.overlay > 0 ? (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `rgba(0,0,0,${videoBg.overlay})`,
                      zIndex: -1,
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
              </>
            ) : null}
            {rendered}
          </div>
        );
      })}
    </>
  );
}
