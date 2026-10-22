"use client";

/**
 * TalentNewPostWriterClient — the talent writer for a post that has no row yet
 * (TUL-1249). Opening it writes nothing; the first real edit creates the draft
 * and the address bar moves to /talent/posts/<id> without remounting.
 */

import { useMemo, useState } from "react";

import type { WriterPostData } from "@/lib/cms/post-writer-types";
import type { PostLocale } from "@/lib/cms/posts-shared";
import { talentCreatePostDraftAction } from "@/lib/server-actions/posts-writer-actions";
import { makeLazyCreateActions } from "./new-post-actions";
import { PostWriter, type PostWriterProps } from "./PostWriter";
import { talentSetAiCrawlersAllowedAction } from "@/lib/server-actions/posts-ai-toggle-actions";
import { makeTalentPostActions } from "./TalentPostWriterClient";

function blankPost(locale: PostLocale, id: string): WriterPostData {
  return {
    id,
    locale,
    status: "draft",
    slug: "",
    title: "",
    excerpt: "",
    translationOf: null,
    blocks: [],
    publishedAt: null,
    scheduledPublishAt: null,
    categoryId: null,
    isFeatured: false,
    isUnlisted: false,
    expiresAt: null,
    relatedOfferingId: null,
    metaTitle: null,
    metaDescription: null,
    coverImageUrl: null,
    coverImageAlt: null,
    ogImageUrl: null,
    noindex: false,
    takenDownReason: null,
    takenDown: false,
    updatedAt: null,
  };
}

export function TalentNewPostWriterClient({
  postLocale,
  aiCrawlersAllowed,
  ...props
}: Omit<PostWriterProps, "post" | "actions" | "upgradeAudience" | "aiCrawlers" | "translationOptions"> & {
  postLocale: PostLocale;
  aiCrawlersAllowed?: boolean;
}) {
  const [id, setId] = useState("");
  const uiLocale = props.locale;
  const actions = useMemo(
    () =>
      makeLazyCreateActions({
        base: makeTalentPostActions(uiLocale),
        create: (input) => talentCreatePostDraftAction(input, uiLocale),
        postLocale,
        onCreated: (newId) => {
          setId(newId);
          window.history.replaceState(null, "", `/talent/posts/${newId}`);
        },
      }),
    [uiLocale, postLocale],
  );
  const post = useMemo(() => blankPost(postLocale, id), [postLocale, id]);
  return (
    <PostWriter
      {...props}
      post={post}
      actions={actions}
      upgradeAudience="talent"
      aiCrawlers={{ initialAllowed: aiCrawlersAllowed ?? true, onSave: talentSetAiCrawlersAllowedAction }}
    />
  );
}
