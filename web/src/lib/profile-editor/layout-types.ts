/** Client-safe types for the talent profile-editor sidebar layout. */

export type ProfileEditorSection = {
  slug: string;
  labelEn: string;
  labelEs: string | null;
  emoji: string;
};

export type ProfileEditorGroup = {
  slug: string;
  labelEn: string;
  labelEs: string | null;
  labelEnAlt: string | null;
  labelEsAlt: string | null;
  sections: ProfileEditorSection[];
};

export type ProfileEditorLayout = {
  groups: ProfileEditorGroup[];
  orderedSectionSlugs: string[];
  sectionMeta: Record<string, { label: string; emoji: string }>;
};
