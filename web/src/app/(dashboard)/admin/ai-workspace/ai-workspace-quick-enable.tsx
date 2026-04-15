"use client";

import { useActionState, useEffect, useRef } from "react";

import { enableCoreAiFeatures, type EnableCoreAiState } from "@/app/(dashboard)/admin/ai-workspace/actions";
import { Button } from "@/components/ui/button";

export function AiWorkspaceQuickEnableButton() {
  const [state, formAction, pending] = useActionState<EnableCoreAiState, FormData>(
    enableCoreAiFeatures,
    undefined,
  );
  const toastRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state?.success && toastRef.current) {
      toastRef.current.focus();
    }
  }, [state?.success]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Enable all core AI feature switches (search, rerank, explanations, refine, inquiry draft, translations, semantic/vector)? Master AI mode and quality v2 flags are unchanged.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" disabled={pending} variant="default">
        {pending ? "Enabling…" : "Quick enable core AI"}
      </Button>
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p ref={toastRef} tabIndex={-1} className="text-sm text-emerald-600 dark:text-emerald-400">
          Core AI flags updated. Refresh if toggles look stale.
        </p>
      ) : null}
    </form>
  );
}
