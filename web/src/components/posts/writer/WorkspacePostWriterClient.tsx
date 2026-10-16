"use client";

/**
 * WorkspacePostWriterClient — binds the workspace* server actions to the
 * shared writer (TUL-1011). Same component as the talent side; only the
 * actions, the upgrade audience and the links differ.
 */

import {
  workspacePublishPostAction,
  workspaceSavePostDraftAction,
  workspaceUnpublishPostAction,
  workspaceUpdatePostSettingsAction,
} from "@/lib/server-actions/posts-writer-actions";
import type { PostWriterActions } from "@/lib/cms/post-writer-types";
import { PostWriter, type PostWriterProps } from "./PostWriter";

export function makeWorkspacePostActions(uiLocale: "es" | "en"): PostWriterActions {
  return {
    save: (input) => workspaceSavePostDraftAction(input, uiLocale),
    updateSettings: (input) => workspaceUpdatePostSettingsAction(input, uiLocale),
    publish: (input) => workspacePublishPostAction(input, uiLocale),
    unpublish: (input) => workspaceUnpublishPostAction(input, uiLocale),
  };
}

const BY_LOCALE: Record<"es" | "en", PostWriterActions> = {
  es: makeWorkspacePostActions("es"),
  en: makeWorkspacePostActions("en"),
};

export type WorkspacePostWriterClientProps = Omit<PostWriterProps, "actions" | "upgradeAudience">;

export function WorkspacePostWriterClient(props: WorkspacePostWriterClientProps) {
  return <PostWriter {...props} actions={BY_LOCALE[props.locale]} upgradeAudience="workspace" />;
}
