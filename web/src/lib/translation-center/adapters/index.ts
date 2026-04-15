import type { TranslationCenterAdapter } from "@/lib/translation-center/adapters/adapter-types";
import { talentBioAdapter } from "@/lib/translation-center/adapters/talent-bio-adapter";
import { taxonomyTermNameAdapter } from "@/lib/translation-center/adapters/taxonomy-term-adapter";
import { locationDisplayAdapter } from "@/lib/translation-center/adapters/location-display-adapter";
import { cmsPageTitleAdapter } from "@/lib/translation-center/adapters/cms-page-title-adapter";
import { messagesUiAdapter } from "@/lib/translation-center/adapters/messages-ui-adapter";
import { fieldValueTextI18nAdapter } from "@/lib/translation-center/adapters/field-value-text-i18n-adapter";

const ADAPTERS: readonly TranslationCenterAdapter[] = [
  talentBioAdapter,
  taxonomyTermNameAdapter,
  locationDisplayAdapter,
  cmsPageTitleAdapter,
  messagesUiAdapter,
  fieldValueTextI18nAdapter,
];

const byId = new Map<string, TranslationCenterAdapter>();
for (const a of ADAPTERS) {
  byId.set(a.adapterId, a);
}

export function getTranslationAdapter(adapterId: string): TranslationCenterAdapter {
  const a = byId.get(adapterId);
  if (!a) {
    throw new Error(`Unknown translation adapter: ${adapterId}`);
  }
  return a;
}
