"use client";

// Identity rows that feed the website hero: the Tagline (one line under the
// headline, saved with the profile like before), the website Headline and the
// Years of experience (both saved on blur, like the catalog fields, through
// `saveHeroTextFields`). One component so the drawer file stays one mount.

import React from "react";

import { loadHeroTextFields, saveHeroTextFields } from "@/lib/server-actions/talent-hero-text";

import { FieldRow, TextInput } from "../../../primitives/forms";
import { useDashboardText } from "../../drawer-shared";

const HEADLINE_MAX = 80;

export function ProfileHeroTextRows({
  tagline,
  onTagline,
  talentProfileId,
  workspaceScopeTenantId,
  isSelf,
  disabled,
}: {
  tagline: string;
  onTagline: (next: string) => void;
  talentProfileId: string | null | undefined;
  workspaceScopeTenantId: string | null | undefined;
  isSelf: boolean;
  disabled?: boolean;
}) {
  const copy = useDashboardText();
  const mode = isSelf ? "self" : "staff";
  const [headline, setHeadline] = React.useState("");
  const [years, setYears] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "saved" | "error">("idle");
  const saved = React.useRef<{ headline: string; years: string }>({ headline: "", years: "" });

  React.useEffect(() => {
    if (!talentProfileId) return;
    let live = true;
    void loadHeroTextFields({ talent_profile_id: talentProfileId, mode }).then((res) => {
      if (!live || !res.ok) return;
      const h = res.fields.headline ?? "";
      const y = res.fields.years === null ? "" : String(res.fields.years);
      saved.current = { headline: h, years: y };
      setHeadline(h);
      setYears(y);
    });
    return () => {
      live = false;
    };
  }, [talentProfileId, mode]);

  const commit = React.useCallback(() => {
    if (!talentProfileId || disabled) return;
    const next = { headline: headline.trim(), years: years.trim() };
    if (next.headline === saved.current.headline && next.years === saved.current.years) return;
    void saveHeroTextFields({
      talent_profile_id: talentProfileId,
      mode,
      headline: next.headline || null,
      years: next.years === "" ? null : Number(next.years),
    }).then((res) => {
      if (res.ok) {
        saved.current = { headline: next.headline, years: next.years };
        setStatus("saved");
      } else {
        setStatus("error");
      }
    });
  }, [talentProfileId, disabled, headline, years, mode]);

  return (
    <>
      <FieldRow label={copy.t("Tagline")} optional hint={copy.t("One line clients see at a glance.")} catalogId="identity.tagline" tenantId={workspaceScopeTenantId}>
        <TextInput placeholder={copy.t("e.g. Editorial fashion model · Madrid")} value={tagline} onChange={(e) => onTagline(e.target.value)} />
      </FieldRow>
      {talentProfileId ? (
        <div onBlur={commit}>
          <FieldRow
            label={copy.t("Website headline")}
            optional
            hint={status === "error" ? copy.t("Could not save") : copy.t("The big line at the top of your website. Short and about what clients get.")}
            error={status === "error" ? copy.t("Could not save") : undefined}
          >
            <TextInput
              placeholder={copy.t("e.g. Hands that speak for you.")}
              value={headline}
              maxLength={HEADLINE_MAX}
              readOnly={disabled}
              onChange={(e) => {
                setStatus("idle");
                setHeadline(e.target.value);
              }}
            />
          </FieldRow>
          <FieldRow label={copy.t("Years of experience")} optional hint={copy.t("Shown in the line under your hero buttons.")}>
            <TextInput
              placeholder="9"
              value={years}
              maxLength={2}
              readOnly={disabled}
              onChange={(e) => {
                setStatus("idle");
                setYears(e.target.value.replace(/\D/g, "").slice(0, 2));
              }}
            />
          </FieldRow>
        </div>
      ) : null}
    </>
  );
}
