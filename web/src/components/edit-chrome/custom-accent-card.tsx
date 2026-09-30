"use client";

/**
 * The one-colour custom accent control of the theme drawer's Colors tab
 * (release 2.5, PL-2). Pick a colour; the accent, the soft tint, the page
 * ground and the hairlines are derived from it (`customAccentTokenPatch`), the
 * text-safe accent is derived at render, and a note says how readable it is.
 * Works for every design because it only writes registry colour tokens. The
 * drawer's "Brand colors" card below still edits each colour by hand.
 */
import { useState } from "react";

import { customAccentNote, customAccentTokenPatch, deriveCustomAccent } from "@/lib/talent-site/custom-accent";

import { Card, CardBody, CardHead, ColorRow, Field, FieldLabel } from "./kit";
import { useEditorLocale } from "./use-editor-locale";

export function CustomAccentCard({
  draft,
  onChange,
}: {
  draft: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const { locale, t } = useEditorLocale();
  const [picked, setPicked] = useState<string>("");
  const derived = picked ? deriveCustomAccent(picked) : null;

  const pick = (hex: string) => {
    setPicked(hex);
    const patch = customAccentTokenPatch(hex, draft);
    if (!patch) return;
    for (const [key, value] of Object.entries(patch)) onChange(key, value);
  };

  return (
    <Card>
      <CardHead title="Custom accent" sub="One color, the rest follows" />
      <CardBody>
        <Field flush>
          <FieldLabel
            htmlFor="theme-custom-accent"
            info="Pick one color. Buttons use it as is; the soft tint, page ground and lines are derived, and text uses a version that stays readable."
          >
            Accent color
          </FieldLabel>
          <ColorRow value={picked || draft["color.accent"] || ""} onChange={pick} />
          <p className="mt-1.5 text-[12px] text-stone-500" data-custom-accent-note="">
            {derived
              ? customAccentNote(derived, locale)
              : t("Pick any color. Text color and tints are derived, and contrast is checked.")}
          </p>
        </Field>
      </CardBody>
    </Card>
  );
}
