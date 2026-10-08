"use client";

/**
 * use-talent-photo-captions.ts — wires the detail rail's caption fields to the
 * talent caption server actions (TUL-229). Returns `undefined` off the talent
 * surface (no profile id) and until the talent's languages have loaded, so the
 * rail simply shows no Captions section in those cases.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { MediaLibraryWireItem } from "@/lib/media/library-wire";
import {
  loadTalentPhotoCaptionLocalesAction,
  saveTalentPhotoCaptionAction,
} from "@/lib/site-admin/media/photo-caption-actions";
import type { CaptionEditor } from "./media-library-captions";

export function useTalentPhotoCaptions(args: {
  talentProfileId: string | null | undefined;
  active: boolean;
  patchItem: (id: string, patch: Partial<MediaLibraryWireItem>) => void;
  onError?: (message: string) => void;
}): CaptionEditor | undefined {
  const { talentProfileId, active, patchItem, onError } = args;
  const [langs, setLangs] = useState<{ primary: string; secondary: string[] } | null>(null);

  useEffect(() => {
    if (!talentProfileId || !active || langs) return;
    let cancelled = false;
    void loadTalentPhotoCaptionLocalesAction(talentProfileId).then((res) => {
      if (cancelled || !res.ok) return;
      setLangs({ primary: res.primary, secondary: res.secondary });
    });
    return () => {
      cancelled = true;
    };
  }, [talentProfileId, active, langs]);

  const onSave = useCallback(
    async (item: MediaLibraryWireItem, locale: string, text: string) => {
      if (!talentProfileId) return;
      const res = await saveTalentPhotoCaptionAction({
        talentProfileId,
        assetId: item.id,
        locale,
        text,
      });
      if (!res.ok) {
        onError?.(res.error);
        return;
      }
      patchItem(item.id, { caption: res.caption, captionI18n: res.captionI18n });
    },
    [talentProfileId, patchItem, onError],
  );

  return useMemo(
    () =>
      talentProfileId && langs
        ? {
            locales: [langs.primary, ...langs.secondary],
            primary: langs.primary,
            onSave,
          }
        : undefined,
    [talentProfileId, langs, onSave],
  );
}
