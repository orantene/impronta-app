"use client";

import { useCallback, useState, type RefObject } from "react";

import { AIErrorBoundary } from "@/components/ai/ai-error-boundary";
import { AIInlineAssistant } from "@/components/ai/ai-inline-assistant";
import { AIActionButton } from "@/components/ai/ai-action-button";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

function readFormContext(
  form: HTMLFormElement,
  talentNames: string[],
  locale: "en" | "es",
): {
  locale: "en" | "es";
  talentNames: string[];
  rawQuery: string;
  eventLocation: string;
  eventDate: string;
  quantity: string;
  currentMessage: string;
} {
  const rawQuery =
    (form.elements.namedItem("raw_query") as HTMLTextAreaElement | null)?.value ?? "";
  const eventLocation =
    (form.elements.namedItem("event_location") as HTMLInputElement | null)?.value ?? "";
  const eventDate =
    (form.elements.namedItem("event_date") as HTMLInputElement | null)?.value ?? "";
  const quantity =
    (form.elements.namedItem("quantity") as HTMLInputElement | null)?.value ?? "";
  const currentMessage =
    (form.elements.namedItem("message") as HTMLTextAreaElement | null)?.value ?? "";
  return {
    locale,
    talentNames,
    rawQuery,
    eventLocation,
    eventDate,
    quantity,
    currentMessage,
  };
}

function InquiryDraftAssistantInner({
  formId,
  locale,
  talentNames,
  formCopy,
  messageTextareaRef,
}: {
  formId: string;
  locale: "en" | "es";
  talentNames: string[];
  formCopy: DirectoryUiCopy["inquiryForm"];
  messageTextareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [busy, setBusy] = useState<"generate" | "polish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (action: "generate" | "polish") => {
      setError(null);
      const form = document.getElementById(formId) as HTMLFormElement | null;
      if (!form) {
        setError(formCopy.draftError);
        return;
      }
      const ctx = readFormContext(form, talentNames, locale);
      let currentMessage = ctx.currentMessage;
      if (action === "polish") {
        if (!currentMessage.trim()) {
          setError(formCopy.draftPolishNeedText);
          return;
        }
      }

      setBusy(action);
      try {
        const res = await fetch("/api/ai/inquiry-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            locale: ctx.locale,
            talentNames: ctx.talentNames,
            rawQuery: ctx.rawQuery || null,
            eventLocation: ctx.eventLocation || null,
            eventDate: ctx.eventDate || null,
            quantity: ctx.quantity || null,
            currentMessage: currentMessage || null,
          }),
        });
        const body = (await res.json()) as { draft?: string; error?: string };
        if (!res.ok || !body.draft) {
          setError(body.error ?? formCopy.draftError);
          return;
        }
        const ta = messageTextareaRef.current;
        if (ta) {
          ta.value = body.draft;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch {
        setError(formCopy.draftError);
      } finally {
        setBusy(null);
      }
    },
    [formId, formCopy, locale, talentNames, messageTextareaRef],
  );

  return (
    <AIInlineAssistant>
      <div className="flex flex-wrap gap-2">
        <AIActionButton
          type="button"
          disabled={busy !== null}
          onClick={() => void run("generate")}
        >
          {busy === "generate" ? formCopy.draftWorking : formCopy.draftGenerate}
        </AIActionButton>
        <AIActionButton
          type="button"
          disabled={busy !== null}
          onClick={() => void run("polish")}
        >
          {busy === "polish" ? formCopy.draftWorking : formCopy.draftPolish}
        </AIActionButton>
      </div>
      {error ? (
        <p className="px-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p className="px-2 text-[11px] text-muted-foreground">{formCopy.draftHint}</p>
      )}
    </AIInlineAssistant>
  );
}

export function InquiryDraftAssistant(props: {
  formId: string;
  locale: "en" | "es";
  talentNames: string[];
  formCopy: DirectoryUiCopy["inquiryForm"];
  messageTextareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <AIErrorBoundary>
      <InquiryDraftAssistantInner {...props} />
    </AIErrorBoundary>
  );
}
