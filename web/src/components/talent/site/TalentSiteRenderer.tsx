import { improntaLog } from "@/lib/server/structured-log";
import { sectionAllowedForSiteKind } from "@/lib/site-admin/sections/site-kind-allowlist";
import {
  SECTION_REGISTRY,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import {
  migrateSectionPayload,
  type SectionRegistryEntry,
} from "@/lib/site-admin/sections/types";
import {
  presentationInlineStyles,
  presentationScopedCss,
  presentationVideoBackground,
} from "@/lib/site-admin/sections/shared/presentation";
import { SectionVideoBackground } from "@/components/site/section-video-background";
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";
import { TalentSiteFreeformRenderer } from "./TalentSiteFreeformRenderer";

type Props = {
  snapshot: TalentSiteSnapshot;
  locale?: string;
  /**
   * ADDITIVE freeform render context (platform-default freeform path only).
   * Slot-based snapshots ignore it. When the snapshot is freeform, the managing
   * agency tenant scopes any curated `section_embed` data + the talent subject
   * scopes connected sections to THIS talent. Absent ⇒ embeds show their
   * "connects on publish" placeholder (the tree is otherwise build-time
   * hydrated, so the page still renders fully).
   */
  freeformContext?: {
    tenantId: string | null;
    talentProfileId: string;
    publicPathPrefix?: string;
  };
};

/**
 * Public renderer for talent Max personal site snapshots on Tulala hosts.
 * No tenant edit-mode, preview, or agency business identity.
 */
export function TalentSiteRenderer({ snapshot, locale = "en", freeformContext }: Props) {
  if (snapshot.siteKind !== "talent_personal") {
    return null;
  }

  // ADDITIVE freeform branch. A freeform snapshot carries a builder-node tree
  // rendered through the SHARED freeform renderer (the same engine the agency
  // storefront + talent extra pages use) instead of the slot/section-registry
  // path below. Gated by composition mode + a present tree, so every existing
  // slot snapshot falls straight through to the unchanged slot path.
  if (
    snapshot.compositionMode === "freeform" &&
    Array.isArray(snapshot.builderTree) &&
    snapshot.builderTree.length > 0
  ) {
    return (
      <TalentSiteFreeformRenderer
        tree={snapshot.builderTree}
        locale={locale}
        context={freeformContext}
      />
    );
  }

  const entries = [...snapshot.slots]
    .filter((entry) => !entry.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div data-talent-personal-site="">
      {entries.map((entry, index) => {
        if (!sectionAllowedForSiteKind(entry.sectionTypeKey, "talent_personal")) {
          if (process.env.NODE_ENV !== "production") {
            void improntaLog("talent_personal_site.warn", {
              message: "section not allowed for talent_personal; skipping",
              sectionTypeKey: entry.sectionTypeKey,
            });
          }
          return null;
        }

        const registryEntry = SECTION_REGISTRY[
          entry.sectionTypeKey as SectionTypeKey
        ] as SectionRegistryEntry | undefined;

        if (!registryEntry) {
          if (process.env.NODE_ENV !== "production") {
            void improntaLog("talent_personal_site.warn", {
              message: "unknown section_type_key; skipping",
              sectionTypeKey: entry.sectionTypeKey,
            });
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
            void improntaLog("talent_personal_site.warn", {
              message: "migration failed; skipping",
              sectionTypeKey: entry.sectionTypeKey,
              error: (error as Error).message,
            });
          }
          return null;
        }

        const Component = registryEntry.Component;
        const key = `${entry.sectionId}:${index}`;
        const payload = migrated.payload as { presentation?: unknown };
        const presentation = payload?.presentation as Parameters<
          typeof presentationScopedCss
        >[1];
        const scopedCss = presentationScopedCss(entry.sectionId, presentation);
        const videoBg = presentationVideoBackground(presentation);
        const isBlankSection = entry.sectionTypeKey === "blank_section";

        const rendered = (
          <Component
            props={migrated.payload as never}
            tenantId=""
            locale={locale}
            preview={false}
            sectionId={entry.sectionId}
            publicPathPrefix=""
          />
        );

        return (
          <div
            key={key}
            data-section-id={entry.sectionId}
            data-section-type={entry.sectionTypeKey}
            style={
              isBlankSection || videoBg
                ? {
                    ...(isBlankSection
                      ? presentationInlineStyles(presentation)
                      : {}),
                    position: "relative",
                    overflow: "hidden",
                  }
                : undefined
            }
          >
            {scopedCss ? <style dangerouslySetInnerHTML={{ __html: scopedCss }} /> : null}
            {/* This was the bug: `videoBg` was computed above and used to set
                position/overflow on the wrapper, but the video itself was
                never rendered — so a section video background worked on the
                homepage and silently did nothing on every talent site. */}
            {videoBg ? <SectionVideoBackground video={videoBg} /> : null}
            {rendered}
          </div>
        );
      })}
    </div>
  );
}
