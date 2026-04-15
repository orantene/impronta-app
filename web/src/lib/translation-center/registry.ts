import type { TranslationDomainDefinition } from "@/lib/translation-center/types";

/**
 * Single source of truth for translatable domains.
 * New domains: add a row here + implement adapter — do not add tabs/queries to the route shell.
 */
export const TRANSLATION_DOMAINS: readonly TranslationDomainDefinition[] = [
  {
    id: "talent.profile.bio",
    title: "Talent profile bio",
    description: "EN/ES bios — live edits and language checks in the Translation Center.",
    groupKey: "talent",
    navTabKey: "bio",
    navTabLabel: "Talent bios",
    navTabOrder: 0,
    contentClass: "ugc",
    storageStrategy: "asymmetric_bio",
    stalenessPolicy: "asymmetric_status",
    workflow: "asymmetric_bio",
    editorMode: "full_edit",
    coverageWeight: "required",
    adapterId: "talentBio",
    sortOrder: 10,
    supportedLocaleMode: "en_es_pair",
  },
  {
    id: "taxonomy.term.name",
    title: "Taxonomy term names",
    groupKey: "taxonomy",
    navTabKey: "taxonomy",
    navTabLabel: "Taxonomy",
    navTabOrder: 1,
    contentClass: "ugc",
    storageStrategy: "paired_columns",
    stalenessPolicy: "paired_timestamps",
    workflow: "none",
    editorMode: "full_edit",
    coverageWeight: "required",
    adapterId: "taxonomyTermName",
    sortOrder: 20,
    supportedLocaleMode: "en_es_pair",
  },
  {
    id: "location.city.display_name",
    title: "Location display names",
    groupKey: "locations",
    navTabKey: "locations",
    navTabLabel: "Locations",
    navTabOrder: 2,
    contentClass: "ugc",
    storageStrategy: "paired_columns",
    stalenessPolicy: "paired_timestamps",
    workflow: "none",
    editorMode: "full_edit",
    coverageWeight: "required",
    adapterId: "locationDisplay",
    sortOrder: 30,
    supportedLocaleMode: "en_es_pair",
  },
  {
    id: "cms.page.title",
    title: "CMS page titles",
    groupKey: "cms",
    navTabKey: "cms",
    navTabLabel: "CMS pages",
    navTabOrder: 3,
    contentClass: "cms",
    storageStrategy: "locale_rows",
    stalenessPolicy: "peer_updated_at",
    workflow: "none",
    editorMode: "cms_linkout",
    coverageWeight: "required",
    adapterId: "cmsPageTitle",
    sortOrder: 40,
    supportedLocaleMode: "locale_rows",
  },
  {
    id: "messages.ui",
    title: "UI message bundles",
    groupKey: "messages",
    navTabKey: "messages",
    navTabLabel: "UI strings",
    navTabOrder: 5,
    contentClass: "product_messages",
    storageStrategy: "message_bundle",
    stalenessPolicy: "none",
    workflow: "none",
    editorMode: "gap_report",
    coverageWeight: "required",
    adapterId: "messagesUi",
    sortOrder: 50,
    supportedLocaleMode: "message_bundle",
  },
  {
    id: "talent.field_value.text",
    title: "Translatable profile field values",
    description: "Custom text/textarea fields marked translatable on field_definitions.",
    groupKey: "talent",
    navTabKey: "profile_fields",
    navTabLabel: "Profile fields (i18n)",
    navTabOrder: 4,
    contentClass: "ugc",
    storageStrategy: "message_bundle",
    stalenessPolicy: "none",
    workflow: "none",
    editorMode: "full_edit",
    coverageWeight: "required",
    adapterId: "fieldValueTextI18n",
    sortOrder: 45,
    supportedLocaleMode: "dynamic_json",
  },
] as const;

export function getDomainById(id: string): TranslationDomainDefinition | undefined {
  return TRANSLATION_DOMAINS.find((d) => d.id === id);
}

export type TranslationNavTab = { key: string; label: string; order: number };

/** Unique nav tabs derived from registry (sorted). */
export function getTranslationNavTabs(): TranslationNavTab[] {
  const map = new Map<string, { label: string; order: number }>();
  for (const d of TRANSLATION_DOMAINS) {
    if (!map.has(d.navTabKey)) {
      map.set(d.navTabKey, { label: d.navTabLabel, order: d.navTabOrder });
    }
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, order: v.order }))
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

export function domainsForNavTab(navTabKey: string): TranslationDomainDefinition[] {
  return TRANSLATION_DOMAINS.filter((d) => d.navTabKey === navTabKey).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}
