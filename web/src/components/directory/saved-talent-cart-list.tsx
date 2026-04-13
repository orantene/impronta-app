"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { setTalentSaved } from "@/app/(public)/directory/actions";
import { Button } from "@/components/ui/button";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { formatInquiryCartRemoveAria } from "@/lib/directory/directory-ui-copy";

export function SavedTalentCartList({
  talents,
  copy,
}: {
  talents: Array<{ id: string; profileCode: string; displayName: string }>;
  copy: DirectoryUiCopy["inquiryCart"];
}) {
  const [pending, startTransition] = useTransition();
  const state = usePublicDiscoveryState();

  return (
    <ul className="flex flex-col gap-2">
      {talents.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0"
        >
          <div className="min-w-0">
            <Link
              href={`/t/${encodeURIComponent(t.profileCode)}`}
              className="block truncate font-medium hover:underline"
            >
              {t.displayName}
            </Link>
            <p className="font-mono text-sm text-muted-foreground">{t.profileCode}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                state.setSavedState(t.id, false);
                startTransition(async () => {
                  const res = await setTalentSaved(t.id, false);
                  if (!res.ok) {
                    state.setSavedState(t.id, true);
                    state.setFlash({
                      tone: "error",
                      title: copy.couldNotRemoveTitle,
                      message: res.error,
                    });
                  } else {
                    state.setFlash({
                      tone: "success",
                      title: copy.removedTitle,
                      message: copy.removedMessage,
                    });
                  }
                });
              }}
              aria-label={formatInquiryCartRemoveAria(copy, t.displayName)}
              className="gap-2"
            >
              <Trash2 className="size-4" />
              {copy.remove}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
