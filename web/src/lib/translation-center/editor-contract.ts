import type { TranslationDomainDefinition, TranslationUnitInlineEditDTO } from "@/lib/translation-center/types";

const NO_SECONDARY_INLINE_ACTION = {
  publish_secondary_action: null,
  publish_secondary_label: null,
} as const;

/**
 * Default inline-edit contract per adapter — extended later for non-translation admin surfaces.
 */
export function buildTranslationUnitInlineEdit(args: {
  domain: TranslationDomainDefinition;
  open_full_editor_url: string;
}): TranslationUnitInlineEditDTO {
  const { domain, open_full_editor_url } = args;
  const u = open_full_editor_url;

  switch (domain.adapterId) {
    case "talentBio":
      return {
        can_inline_edit: true,
        editor_fields: [
          { key: "bio_en", label: "English", kind: "textarea" },
          { key: "bio_es", label: "Spanish", kind: "textarea" },
        ],
        save_action: "talent_bio_quick",
        publish_action: null,
        ...NO_SECONDARY_INLINE_ACTION,
        create_draft_on_edit: false,
        open_full_editor_url: u,
      };
    case "taxonomyTermName":
      return {
        can_inline_edit: true,
        editor_fields: [
          { key: "name_en", label: "English", kind: "readonly" },
          { key: "name_es", label: "Spanish", kind: "text" },
        ],
        save_action: "taxonomy_name_es",
        publish_action: null,
        ...NO_SECONDARY_INLINE_ACTION,
        create_draft_on_edit: false,
        open_full_editor_url: u,
      };
    case "locationDisplay":
      return {
        can_inline_edit: true,
        editor_fields: [
          { key: "display_name_en", label: "English", kind: "readonly" },
          { key: "display_name_es", label: "Spanish", kind: "text" },
        ],
        save_action: "location_display_es",
        publish_action: null,
        ...NO_SECONDARY_INLINE_ACTION,
        create_draft_on_edit: false,
        open_full_editor_url: u,
      };
    case "fieldValueTextI18n":
      return {
        can_inline_edit: true,
        editor_fields: [
          { key: "en", label: "English", kind: "textarea" },
          { key: "es", label: "Spanish", kind: "textarea" },
        ],
        save_action: "field_value_i18n",
        publish_action: null,
        ...NO_SECONDARY_INLINE_ACTION,
        create_draft_on_edit: false,
        open_full_editor_url: u,
      };
    case "cmsPageTitle":
      return {
        can_inline_edit: false,
        editor_fields: [{ key: "note", label: "CMS pages use the full editor for titles per locale.", kind: "readonly" }],
        save_action: "none",
        publish_action: null,
        ...NO_SECONDARY_INLINE_ACTION,
        create_draft_on_edit: false,
        open_full_editor_url: u,
      };
    case "messagesUi":
      return {
        can_inline_edit: false,
        editor_fields: [
          { key: "note", label: "UI bundles are edited in-repo (messages JSON) — use export / PR workflow.", kind: "readonly" },
        ],
        save_action: "none",
        publish_action: null,
        ...NO_SECONDARY_INLINE_ACTION,
        create_draft_on_edit: false,
        open_full_editor_url: u,
      };
    default:
      return {
        can_inline_edit: false,
        editor_fields: [],
        save_action: "none",
        publish_action: null,
        ...NO_SECONDARY_INLINE_ACTION,
        create_draft_on_edit: false,
        open_full_editor_url: u,
      };
  }
}
