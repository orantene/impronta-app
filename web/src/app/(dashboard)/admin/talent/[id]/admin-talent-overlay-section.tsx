"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

import {
  clearAgencyTalentOverlay,
  saveAgencyTalentOverlay,
  type OverlayActionState,
} from "./overlay-actions";

export type AdminOverlayInitial = {
  display_headline: string | null;
  local_bio: string | null;
  cover_media_asset_id: string | null;
  local_tags: string[];
};

export function AdminTalentOverlaySection({
  talentProfileId,
  initial,
  tenantName,
  rosterOnTenant,
}: {
  talentProfileId: string;
  initial: AdminOverlayInitial | null;
  tenantName: string;
  rosterOnTenant: boolean;
}) {
  const [saveState, saveAction, savePending] = useActionState<
    OverlayActionState,
    FormData
  >(saveAgencyTalentOverlay, undefined);
  const [clearState, clearAction, clearPending] = useActionState<
    OverlayActionState,
    FormData
  >(clearAgencyTalentOverlay, undefined);

  const [headline, setHeadline] = useState(initial?.display_headline ?? "");
  const [localBio, setLocalBio] = useState(initial?.local_bio ?? "");
  const [coverId, setCoverId] = useState(initial?.cover_media_asset_id ?? "");
  const [tags, setTags] = useState((initial?.local_tags ?? []).join(", "));

  const savedToasted = useRef(false);
  const clearedToasted = useRef(false);

  useEffect(() => {
    if (!saveState?.success || savePending) return;
    if (savedToasted.current) return;
    savedToasted.current = true;
    clearedToasted.current = false;
    toast.success(saveState.message ?? "Overlay saved.");
  }, [saveState?.success, saveState?.message, savePending]);

  useEffect(() => {
    if (!clearState?.success || clearPending) return;
    if (clearedToasted.current) return;
    clearedToasted.current = true;
    savedToasted.current = false;
    toast.success(clearState.message ?? "Overlay cleared.");
    setHeadline("");
    setLocalBio("");
    setCoverId("");
    setTags("");
  }, [clearState?.success, clearState?.message, clearPending]);

  const hasOverlay = Boolean(
    initial &&
      (initial.display_headline ||
        initial.local_bio ||
        initial.cover_media_asset_id ||
        (initial.local_tags && initial.local_tags.length > 0)),
  );

  return (
    <DashboardSectionCard
      title={`Agency overlay · ${tenantName}`}
      description={
        rosterOnTenant
          ? "Storefront-only presentation for this agency. Blank fields fall back to the canonical profile. Never renders on the hub or the canonical app host."
          : "This talent is not on this tenant's roster yet. Add them to the roster before authoring an overlay."
      }
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
    >
      <div className="space-y-4">
        {saveState?.error ? (
          <p className="text-sm text-destructive">{saveState.error}</p>
        ) : null}
        {clearState?.error ? (
          <p className="text-sm text-destructive">{clearState.error}</p>
        ) : null}

        <form action={saveAction} className="space-y-4">
          <input
            type="hidden"
            name="talent_profile_id"
            value={talentProfileId}
          />

          <div className="space-y-1.5">
            <Label htmlFor="overlay_display_headline">Display headline</Label>
            <Input
              id="overlay_display_headline"
              name="display_headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Cancún Exclusive · Adriana V."
              maxLength={160}
              disabled={!rosterOnTenant}
            />
            <p className="text-xs text-muted-foreground">
              Replaces the canonical name on the storefront when set. Blank keeps
              the canonical name.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="overlay_local_bio">Local bio</Label>
            <Textarea
              id="overlay_local_bio"
              name="local_bio"
              value={localBio}
              onChange={(e) => setLocalBio(e.target.value)}
              rows={5}
              placeholder="Storefront-facing description for this tenant."
              maxLength={4000}
              disabled={!rosterOnTenant}
            />
            <p className="text-xs text-muted-foreground">
              Substitutes the canonical bio on the agency storefront. Blank keeps
              the canonical bio.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="overlay_cover_media_asset_id">
              Cover media asset id
            </Label>
            <Input
              id="overlay_cover_media_asset_id"
              name="cover_media_asset_id"
              value={coverId}
              onChange={(e) => setCoverId(e.target.value)}
              placeholder="UUID of an approved media_asset"
              disabled={!rosterOnTenant}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Must be an approved, non-deleted media asset. Leave
              blank to keep the canonical banner.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="overlay_local_tags">Local tags</Label>
            <Input
              id="overlay_local_tags"
              name="local_tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma, separated, tags"
              disabled={!rosterOnTenant}
            />
            <p className="text-xs text-muted-foreground">
              Up to 20 tags, 40 chars each. Storefront-only.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={savePending || !rosterOnTenant}
            >
              {savePending
                ? "Saving…"
                : hasOverlay
                  ? "Update overlay"
                  : "Create overlay"}
            </Button>
            {hasOverlay ? (
              <form
                action={clearAction}
                onSubmit={(e) => {
                  if (
                    !confirm(
                      "Clear this agency overlay? The storefront will fall back to the canonical profile.",
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                <input
                  type="hidden"
                  name="talent_profile_id"
                  value={talentProfileId}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  disabled={clearPending}
                >
                  {clearPending ? "Clearing…" : "Clear overlay"}
                </Button>
              </form>
            ) : null}
          </div>
        </form>
      </div>
    </DashboardSectionCard>
  );
}
