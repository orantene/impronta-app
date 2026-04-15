"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  adminAiFillMissingSpanishBio,
  adminAiUpdateSpanishBio,
  adminSaveTalentBioTranslationCenterLive,
} from "@/app/(dashboard)/admin/talent/translation-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { canonicalBioEn } from "@/lib/translation/public-bio";
import { detectLocaleHint } from "@/lib/translation-center/save/locale-hint";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";

type Props = {
  talentProfileId: string;
  bio_en: string | null;
  bio_es: string | null;
  bio_en_updated_at: string | null;
  bio_es_updated_at: string | null;
  short_bio: string | null;
  openAiAvailable: boolean;
};

function Hint({ text, expectEn }: { text: string; expectEn: boolean }) {
  const t = text.trim();
  if (!t) return null;
  const hint = detectLocaleHint(t);
  if (hint === "unknown" || hint === "mixed") return null;
  const mismatch = expectEn ? hint === "es" : hint === "en";
  if (!mismatch) return null;
  return (
    <p className="text-xs text-amber-700 dark:text-amber-300/90">
      Language check: reads like {hint === "es" ? "Spanish" : "English"} — confirm the intended column.
    </p>
  );
}

export function AdminTalentBioTranslationPanel({
  talentProfileId,
  bio_en,
  bio_es,
  bio_en_updated_at,
  bio_es_updated_at,
  short_bio,
  openAiAvailable,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const enLive = canonicalBioEn(bio_en, short_bio) ?? "";
  const [fields, setFields] = useState({
    bio_en: enLive,
    bio_es: (bio_es ?? "").trim(),
  });

  useEffect(() => {
    setFields({
      bio_en: canonicalBioEn(bio_en, short_bio) ?? "",
      bio_es: (bio_es ?? "").trim(),
    });
  }, [bio_en, bio_es, short_bio]);

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

  const enPub = canonicalBioEn(bio_en, short_bio) ?? "";

  return (
    <div id="bio-translation">
      <DashboardSectionCard
        title="Bilingual bios (EN / ES)"
        description="Save updates live profile text immediately — same behavior as Translation Center. Optional AI tools translate from English to Spanish."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="grid gap-6 text-sm md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border/50 bg-muted/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">English</p>
            <div>
              <Label htmlFor="admin-bio-en">English</Label>
              <Textarea
                id="admin-bio-en"
                className="mt-1 min-h-[100px] rounded-xl"
                value={fields.bio_en}
                onChange={(e) => setFields((f) => ({ ...f, bio_en: e.target.value }))}
                disabled={pending}
              />
              <Hint text={fields.bio_en} expectEn />
              <p className="mt-1 text-xs text-muted-foreground">
                English updated: {bio_en_updated_at ? formatAdminTimestamp(bio_en_updated_at) : "—"}
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/50 bg-muted/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spanish</p>
            <div>
              <Label htmlFor="admin-bio-es">Spanish</Label>
              <Textarea
                id="admin-bio-es"
                className="mt-1 min-h-[100px] rounded-xl"
                value={fields.bio_es}
                onChange={(e) => setFields((f) => ({ ...f, bio_es: e.target.value }))}
                disabled={pending}
              />
              <Hint text={fields.bio_es} expectEn={false} />
              <p className="mt-1 text-xs text-muted-foreground">
                Spanish updated: {bio_es_updated_at ? formatAdminTimestamp(bio_es_updated_at) : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-4">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(() =>
                adminSaveTalentBioTranslationCenterLive({
                  talent_profile_id: talentProfileId,
                  bio_en: fields.bio_en,
                  bio_es: fields.bio_es,
                }),
              )
            }
          >
            Save bios
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !openAiAvailable || Boolean((bio_es ?? "").trim())}
            title={!openAiAvailable ? "Set OPENAI_API_KEY on the server to enable AI translation." : undefined}
            onClick={() => run(() => adminAiFillMissingSpanishBio({ talent_profile_id: talentProfileId }))}
          >
            AI: fill missing Spanish
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !openAiAvailable || !enPub.trim()}
            title={!openAiAvailable ? "Set OPENAI_API_KEY on the server to enable AI translation." : undefined}
            onClick={() => run(() => adminAiUpdateSpanishBio({ talent_profile_id: talentProfileId }))}
          >
            AI: update Spanish
          </Button>
        </div>
        {!openAiAvailable ? (
          <p className="mt-2 text-xs text-amber-200/90">
            AI buttons are disabled: add <span className="font-mono">OPENAI_API_KEY</span> to the server
            environment.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            AI update reads English from the database and overwrites live Spanish — use Save bios first if you edited
            English here.
          </p>
        )}
      </DashboardSectionCard>
    </div>
  );
}
