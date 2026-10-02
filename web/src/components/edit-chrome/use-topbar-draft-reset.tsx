"use client";

/**
 * Topbar "Discard draft" and "Pull from live" actions, extracted from
 * topbar.tsx (size budget). DRAFT-ONLY: neither touches the published
 * snapshot or the public cache.
 *
 *  - Replace / Discard confirm in the editor's own dialog (translatable),
 *    never a blocking native confirm.
 *  - A surface whose adapter can reset its own draft (talent sites) does it
 *    through `discardDraftToLive`, which reloads the canvas. The homepage
 *    action only ever resets the WORKSPACE homepage, so on a talent site it
 *    returned ok and left the edit on the canvas.
 *  - Every other surface keeps the homepage action, then refreshes.
 */
import { useState, type ReactNode } from "react";

import { copyPublishedHomepageAction } from "@/lib/site-admin/edit-mode/composition-actions";
import { safeAction } from "@/lib/site-admin/edit-mode/safe-action";

import { useMaybeEditContext } from "./edit-context";
import { EditConfirmDialog } from "./kit/confirm-dialog";
import { useEditorLocale } from "./use-editor-locale";

type PullMode = "replace" | "above" | "below";
type Pending = "discard" | "replace" | null;

export function useTopbarDraftReset(): {
  discard: () => void;
  pull: (mode: PullMode) => void;
  dialog: ReactNode;
} {
  const editCtx = useMaybeEditContext();
  const { t } = useEditorLocale();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  async function run(mode: PullMode, name: string, failure: string) {
    if (!editCtx) return;
    if (editCtx.discardDraftToLive) {
      if (mode !== "replace") {
        editCtx.reportMutationError(t("Adding the live blocks above or below is not available on your site. Use Replace instead."));
        return;
      }
      await editCtx.discardDraftToLive();
      return;
    }
    const res = await safeAction(() => copyPublishedHomepageAction({ locale: editCtx.locale, mode }), {
      name,
      fallback: { ok: false as const, error: t(failure), code: "network" },
    });
    if (res.ok) {
      await editCtx.refreshComposition();
      return;
    }
    editCtx.reportMutationError(res.error);
  }

  const runPending = async (kind: Exclude<Pending, null>) => {
    setBusy(true);
    try {
      await (kind === "discard"
        ? run("replace", "discardDraft", "Network error. Couldn't discard the draft. Check your connection and try again.")
        : run("replace", "pullFromLiveHomepage", "Network error. Couldn't pull from live. Check your connection and try again."));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const dialog = pending ? (
    <EditConfirmDialog
      title={pending === "discard" ? t("Discard your draft?") : t("Replace your draft with the live homepage?")}
      body={
        pending === "discard"
          ? t("Reset this draft to the currently published version? This discards your unsaved draft edits.")
          : t("This discards your unsaved draft edits.")
      }
      confirmLabel={pending === "discard" ? t("Discard draft") : t("Replace draft")}
      cancelLabel={t("Cancel")}
      busy={busy}
      onConfirm={() => void runPending(pending)}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return {
    dialog,
    discard: () => setPending("discard"),
    // Only Replace discards the draft, so only it confirms. Above / below are
    // additive (one undo reverts them) and run in one click.
    pull: (mode) =>
      mode === "replace"
        ? setPending("replace")
        : void run(mode, "pullFromLiveHomepage", "Network error. Couldn't pull from live. Check your connection and try again."),
  };
}
