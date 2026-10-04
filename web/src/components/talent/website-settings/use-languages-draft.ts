"use client";

/**
 * The Languages slice of the Website settings draft (PR 7): load, suggested
 * primary, save, and what happens after a save.
 *
 * - Nothing stored yet: opening the group preselects the locale suggested from
 *   Accept-Language / IP country (caption "Suggested from your location.").
 * - Save with a primary change: the screen asks first (`confirmPrimary`);
 *   after the write the dashboard cookie follows the primary and the page
 *   reloads, so the dashboard speaks the new primary.
 * - Save that adds a secondary: a toast explains the red dots.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { setLocaleCookie } from "@/components/dashboard-locale-toggle";
import { languageName } from "@/lib/i18n/locale-field-model";
import { loadTalentLanguages, updateTalentLanguages } from "@/lib/server-actions/talent-self";
import { suggestTalentPrimaryLocaleAction } from "@/lib/talent/translation-coverage-actions";
import { secondaryDelta, withPrimary, type LanguagesDraft } from "./languages-model";

export function useLanguagesDraft(t: (s: string) => string) {
  const copy = useDashboardText();
  const { toast } = useAdminShell();
  const [saved, setSaved] = useState<LanguagesDraft | null>(null);
  const [draft, setDraft] = useState<LanguagesDraft | null>(null);
  const [stored, setStored] = useState(true);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(false);
  const [confirmPrimary, setConfirmPrimary] = useState(false);

  useEffect(() => {
    let live = true;
    void loadTalentLanguages().then(async (res) => {
      if (!live || !res.ok) return;
      const snap = { primary: res.data.primary, secondary: [...res.data.secondary] };
      setSaved(snap);
      setDraft(snap);
      setStored(res.data.storedPrimary !== null);
      if (res.data.storedPrimary === null) {
        const s = await suggestTalentPrimaryLocaleAction().catch(() => null);
        if (live) setSuggestion(s);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const nameInUi = useCallback(
    (code: string) => languageName(code, copy.locale, !copy.isSpanish),
    [copy.locale, copy.isSpanish],
  );

  /** Called when the Languages group opens: apply the suggestion once. */
  const onOpen = useCallback(() => {
    if (stored || suggested || !suggestion || !draft || draft.primary === suggestion) {
      if (!stored && suggestion && draft?.primary === suggestion) setSuggested(true);
      return;
    }
    setDraft(withPrimary(draft, suggestion));
    setSuggested(true);
  }, [stored, suggested, suggestion, draft]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!saved || !draft) return true;
    const res = await updateTalentLanguages({ primary: draft.primary, secondary: draft.secondary });
    if (!res.ok) return false;
    const next = { primary: res.data.primary, secondary: [...res.data.secondary] };
    const { added } = secondaryDelta(saved, next);
    const primaryChanged = saved.primary !== next.primary;
    setSaved(next);
    setDraft(next);
    setStored(true);
    if (primaryChanged) {
      setLocaleCookie(next.primary);
      window.location.reload();
      return true;
    }
    for (const code of added) {
      toast(
        t("{lang} added. Fields still in {primary} show a red {code} dot.")
          .replace("{lang}", languageName(code, copy.locale, true))
          .replace("{primary}", nameInUi(next.primary))
          .replace("{code}", code.toUpperCase()),
      );
    }
    return true;
  }, [saved, draft, toast, t, copy.locale, nameInUi]);

  return useMemo(
    () => ({
      saved,
      draft,
      suggested,
      setDraft,
      onOpen,
      save,
      nameInUi,
      primaryChanged: Boolean(saved && draft && saved.primary !== draft.primary),
      confirmPrimary,
      askConfirmPrimary: () => setConfirmPrimary(true),
      closeConfirmPrimary: () => setConfirmPrimary(false),
      discard: () => {
        setDraft(saved);
        setSuggested(false);
      },
    }),
    [saved, draft, suggested, onOpen, save, nameInUi, confirmPrimary],
  );
}
