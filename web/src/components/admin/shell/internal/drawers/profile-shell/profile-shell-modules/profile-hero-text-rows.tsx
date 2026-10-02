"use client";

// Identity rows that feed the website hero: the Tagline (one line under the
// headline, saved with the profile like before), the website Headline and the
// Years of experience (saved on blur, like the catalog fields, through
// `saveHeroTextFields`), plus the same two lines in each language the site
// speaks (English and Spanish) so a visitor reads her words in their language.
// One component so the drawer file stays one mount.

import React from "react";

import { loadHeroTextFields, saveHeroTextFields } from "@/lib/server-actions/talent-hero-text";

import { FieldRow, TextInput } from "../../../primitives/forms";
import { useDashboardText } from "../../drawer-shared";

const HEADLINE_MAX = 80;
const TAGLINE_MAX = 160;
const LANGS = [
  { code: "en", head: "Headline (English)", tag: "Tagline (English)" },
  { code: "es", head: "Headline (Spanish)", tag: "Tagline (Spanish)" },
] as const;

type Langs = Record<string, string>;
const trimmed = (m: Langs): Langs =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ""));
const same = (a: Langs, b: Langs) => JSON.stringify(trimmed(a)) === JSON.stringify(trimmed(b));

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
  const [headI18n, setHeadI18n] = React.useState<Langs>({});
  const [tagI18n, setTagI18n] = React.useState<Langs>({});
  const [status, setStatus] = React.useState<"idle" | "saved" | "error">("idle");
  const saved = React.useRef<{ headline: string; years: string; head: Langs; tag: Langs }>({
    headline: "",
    years: "",
    head: {},
    tag: {},
  });

  React.useEffect(() => {
    if (!talentProfileId) return;
    let live = true;
    void loadHeroTextFields({ talent_profile_id: talentProfileId, mode }).then((res) => {
      if (!live || !res.ok) return;
      const h = res.fields.headline ?? "";
      const y = res.fields.years === null ? "" : String(res.fields.years);
      saved.current = { headline: h, years: y, head: res.fields.headlineI18n, tag: res.fields.taglineI18n };
      setHeadline(h);
      setYears(y);
      setHeadI18n(res.fields.headlineI18n);
      setTagI18n(res.fields.taglineI18n);
    });
    return () => {
      live = false;
    };
  }, [talentProfileId, mode]);

  const commit = React.useCallback(() => {
    if (!talentProfileId || disabled) return;
    const next = { headline: headline.trim(), years: years.trim(), head: trimmed(headI18n), tag: trimmed(tagI18n) };
    const was = saved.current;
    if (next.headline === was.headline && next.years === was.years && same(next.head, was.head) && same(next.tag, was.tag)) return;
    void saveHeroTextFields({
      talent_profile_id: talentProfileId,
      mode,
      headline: next.headline || null,
      years: next.years === "" ? null : Number(next.years),
      headlineI18n: next.head,
      taglineI18n: next.tag,
    }).then((res) => {
      if (res.ok) {
        saved.current = next;
        setStatus("saved");
      } else {
        setStatus("error");
      }
    });
  }, [talentProfileId, disabled, headline, years, headI18n, tagI18n, mode]);

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
          <details>
            <summary>{copy.t("Write them in another language")}</summary>
            {LANGS.map((l) => (
              <React.Fragment key={l.code}>
                <FieldRow label={copy.t(l.head)} optional hint={copy.t("Shown to visitors who read your site in that language. Leave empty to show your main language.")}>
                  <TextInput
                    value={headI18n[l.code] ?? ""}
                    maxLength={HEADLINE_MAX}
                    readOnly={disabled}
                    onChange={(e) => {
                      setStatus("idle");
                      setHeadI18n((m) => ({ ...m, [l.code]: e.target.value }));
                    }}
                  />
                </FieldRow>
                <FieldRow label={copy.t(l.tag)} optional>
                  <TextInput
                    value={tagI18n[l.code] ?? ""}
                    maxLength={TAGLINE_MAX}
                    readOnly={disabled}
                    onChange={(e) => {
                      setStatus("idle");
                      setTagI18n((m) => ({ ...m, [l.code]: e.target.value }));
                    }}
                  />
                </FieldRow>
              </React.Fragment>
            ))}
          </details>
        </div>
      ) : null}
    </>
  );
}
