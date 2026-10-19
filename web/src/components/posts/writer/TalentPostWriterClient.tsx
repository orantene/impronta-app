"use client";

/**
 * TalentPostWriterClient — binds the talent server actions to the shared
 * writer. Everything else (UI, autosave, gates) lives in PostWriter.
 */

import {
  talentPublishPostAction,
  talentSavePostDraftAction,
  talentUnpublishPostAction,
  talentUpdatePostSettingsAction,
} from "@/lib/server-actions/posts-writer-actions";
import { talentSetAiCrawlersAllowedAction } from "@/lib/server-actions/posts-ai-toggle-actions";
import type { PostWriterActions } from "@/lib/cms/post-writer-types";
import { PostWriter, type PostWriterProps } from "./PostWriter";

export function makeTalentPostActions(uiLocale: "es" | "en"): PostWriterActions {
  return {
    save: (input) => talentSavePostDraftAction(input, uiLocale),
    updateSettings: (input) => talentUpdatePostSettingsAction(input, uiLocale),
    publish: (input) => talentPublishPostAction(input, uiLocale),
    unpublish: (input) => talentUnpublishPostAction(input, uiLocale),
  };
}

export type TalentPostWriterClientProps = Omit<PostWriterProps, "actions" | "upgradeAudience" | "aiCrawlers"> & {
  aiCrawlersAllowed?: boolean;
};

export function TalentPostWriterClient({ aiCrawlersAllowed, ...props }: TalentPostWriterClientProps) {
  // Module-level factory + a per-locale object: the identity only changes with the language.
  const actions = actionsFor(props.locale);
  return (
    <PostWriter
      {...props}
      actions={actions}
      upgradeAudience="talent"
      aiCrawlers={{ initialAllowed: aiCrawlersAllowed ?? true, onSave: talentSetAiCrawlersAllowedAction }}
    />
  );
}

const BY_LOCALE: Record<"es" | "en", PostWriterActions> = {
  es: makeTalentPostActions("es"),
  en: makeTalentPostActions("en"),
};

function actionsFor(locale: "es" | "en"): PostWriterActions {
  return BY_LOCALE[locale];
}
