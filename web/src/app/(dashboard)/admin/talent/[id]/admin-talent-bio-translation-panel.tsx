"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  adminAiFillMissingSpanishBio,
  adminAiUpdateSpanishBio,
  adminApproveSpanishBioDraft,
  adminMarkSpanishBioApproved,
  adminSaveManualSpanishBio,
} from "@/app/(dashboard)/admin/talent/translation-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { canonicalBioEn } from "@/lib/translation/public-bio";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";

type Props = {
  talentProfileId: string;
  bio_en: string | null;
  bio_es: string | null;
  bio_es_draft: string | null;
  bio_es_status: string | null;
  bio_en_updated_at: string | null;
  bio_es_updated_at: string | null;
  short_bio: string | null;
  openAiAvailable: boolean;
};

export function AdminTalentBioTranslationPanel({
  talentProfileId,
  bio_en,
  bio_es,
  bio_es_draft,
  bio_es_status,
  bio_en_updated_at,
  bio_es_updated_at,
  short_bio,
  openAiAvailable,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [esText, setEsText] = useState(bio_es ?? "");

  useEffect(() => {
    setEsText(bio_es ?? "");
  }, [bio_es]);

  const enDisplay = canonicalBioEn(bio_en, short_bio);
  const status = bio_es_status ?? "missing";
  const hasPublishedEs = Boolean((bio_es ?? "").trim());
  const hasDraft = Boolean((bio_es_draft ?? "").trim());

  const run = async (fn: () => Promise<{ error?: string; success?: true }>) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved");
      router.refresh();
    });
  };

  return (
    <div id="bio-translation">
    <DashboardSectionCard
      title="Bio translation (EN / ES)"
      description="English is edited in Profile. Spanish lifecycle: missing → AI auto-fill → review → approve. Approved refreshes go to draft only."
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
    >
      <div className="space-y-4 text-sm">
        <div>
          <Label className="text-muted-foreground">English (source)</Label>
          <p className="mt-1 whitespace-pre-wrap rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-foreground">
            {enDisplay || "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            EN updated: {bio_en_updated_at ? formatAdminTimestamp(bio_en_updated_at) : "—"}
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-muted-foreground">Spanish (published)</Label>
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs capitalize">
              {status}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-foreground">
            {(bio_es ?? "").trim() || "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ES published: {bio_es_updated_at ? formatAdminTimestamp(bio_es_updated_at) : "—"}
          </p>
        </div>

        {hasDraft ? (
          <div>
            <Label className="text-muted-foreground">Spanish draft (AI)</Label>
            <p className="mt-1 whitespace-pre-wrap rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-foreground">
              {bio_es_draft}
            </p>
          </div>
        ) : null}

        <div>
          <Label htmlFor="admin-bio-es-edit">Edit Spanish (manual)</Label>
          <Textarea
            id="admin-bio-es-edit"
            className="mt-1 min-h-[100px] rounded-xl"
            value={esText}
            onChange={(e) => setEsText(e.target.value)}
            disabled={pending}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(() =>
                  adminSaveManualSpanishBio({
                    talent_profile_id: talentProfileId,
                    bio_es: esText,
                  }),
                )
              }
            >
              Save Spanish
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || !hasPublishedEs}
              onClick={() =>
                run(() => adminMarkSpanishBioApproved({ talent_profile_id: talentProfileId }))
              }
            >
              Approve published
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-amber-600 text-white hover:bg-amber-600/90"
              disabled={pending || !hasDraft}
              onClick={() =>
                run(() => adminApproveSpanishBioDraft({ talent_profile_id: talentProfileId }))
              }
            >
              Promote draft → published
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !openAiAvailable || hasPublishedEs}
            title={!openAiAvailable ? "Set OPENAI_API_KEY on the server to enable AI translation." : undefined}
            onClick={() =>
              run(() => adminAiFillMissingSpanishBio({ talent_profile_id: talentProfileId }))
            }
          >
            AI: fill missing Spanish
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !openAiAvailable || !enDisplay.trim()}
            title={!openAiAvailable ? "Set OPENAI_API_KEY on the server to enable AI translation." : undefined}
            onClick={() =>
              run(() => adminAiUpdateSpanishBio({ talent_profile_id: talentProfileId }))
            }
          >
            AI: update Spanish
          </Button>
        </div>
        {!openAiAvailable ? (
          <p className="text-xs text-amber-200/90">
            AI buttons are disabled: add <span className="font-mono">OPENAI_API_KEY</span> to the
            server environment. Manual Spanish edits still work.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            “Update Spanish” writes to draft when status is approved; otherwise refreshes published
            Spanish.
          </p>
        )}
      </div>
    </DashboardSectionCard>
    </div>
  );
}
