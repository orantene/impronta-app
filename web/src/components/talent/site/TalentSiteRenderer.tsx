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
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";

type Props = {
  snapshot: TalentSiteSnapshot;
  locale?: string;
};

/**
 * Public renderer for talent Max personal site snapshots on Tulala hosts.
 * No tenant edit-mode, preview, or agency business identity.
 */
export function TalentSiteRenderer({ snapshot, locale = "en" }: Props) {
  if (snapshot.siteKind !== "talent_personal") {
    return null;
  }

  const entries = [...snapshot.slots].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div data-talent-personal-site="">
      {entries.map((entry) => {
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
        const key = `${entry.slotKey}:${entry.sectionId}:${entry.sortOrder}`;
        const payload = migrated.payload as { presentation?: unknown };
        const presentation = payload?.presentation as Parameters<
          typeof presentationScopedCss
        >[1];
        const scopedCss = presentationScopedCss(entry.sectionId, presentation);
        const videoBg = presentationVideoBackground(presentation);
        const isBlankSection = entry.sectionTypeKey === "blank_section";

        const rendered = (
          <Component
            key={key}
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
            {rendered}
          </div>
        );
      })}
    </div>
  );
}
