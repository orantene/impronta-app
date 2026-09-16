"use client";

/**
 * The photo or document a customer sent, inside its message bubble.
 *
 * `inquiry-files` is a private bucket, so the object needs a signed URL. It is
 * requested per bubble on mount rather than for the whole thread up front: a
 * long WhatsApp history is mostly text, and signing objects nobody scrolls to
 * would be a round trip each.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { getMessageMediaUrl } from "@/lib/server-actions/message-media";

type State =
  | { phase: "loading" }
  | { phase: "ready"; url: string; mime: string }
  | { phase: "failed" };

export function MessageMedia({ messageId }: { readonly messageId: string }) {
  const t = useT();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getMessageMediaUrl(messageId).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { phase: "ready", url: result.url, mime: result.mime } : { phase: "failed" });
    });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  if (state.phase === "loading") {
    return (
      <p className="mt-2 text-[13px] text-admin-ink-muted" data-message-media="loading">
        {t("dashboard.pos.messages.media.loading")}
      </p>
    );
  }
  if (state.phase === "failed") {
    return (
      <p className="mt-2 text-[13px] text-admin-ink-muted" data-message-media="failed">
        {t("dashboard.pos.messages.media.failed")}
      </p>
    );
  }

  const isImage = state.mime.startsWith("image/");
  if (!isImage) {
    return (
      <a
        className="mt-2 inline-block text-[14px] font-semibold text-admin-brand"
        href={state.url}
        target="_blank"
        rel="noreferrer"
        data-message-media="file"
      >
        {t("dashboard.pos.messages.media.file")}
      </a>
    );
  }
  return (
    <a href={state.url} target="_blank" rel="noreferrer" data-message-media="image">
      {/* Signed, short-lived Supabase Storage URL: the image optimizer cannot
          cache it and next/image would refuse the unconfigured remote host. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={state.url}
        alt={t("dashboard.pos.messages.media.imageAlt")}
        className="mt-2 max-h-[320px] w-auto max-w-full rounded-[10px] object-contain"
      />
    </a>
  );
}
