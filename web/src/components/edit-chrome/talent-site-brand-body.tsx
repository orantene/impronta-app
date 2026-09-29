"use client";

/**
 * TalentSiteBrandBody — the Design panel's "Brand" section on the talent page
 * builder (`talent_page` surface).
 *
 * The agency Brand body reads the workspace's `agency_business_identity` +
 * `agency_branding`, which a talent does not have ("No tenant in scope"). A
 * talent's brand is her SITE theme: the Design she picked sets the starting
 * colours, and every one stays editable. This body edits the main colours
 * through the SAME talent theme action set the Theme drawer uses
 * (`resolveThemeActionSet("talent_page", slug)`), so Brand and Theme never
 * disagree: both write the site draft, both go live with "Publish site".
 * Name, logo, menu and footer live in the site header, edited in the shell
 * builder.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useEditContext } from "./edit-context";
import { CHROME, Field, FieldLabel, SaveChip, type SaveChipStatus } from "./kit";
import { resolveThemeActionSet } from "./theme-action-scope";
import { publishThemePreview } from "./theme-preview-bridge";
import { useEditorLocale } from "./use-editor-locale";

const BRAND_COLOR_KEYS = [
  { key: "color.accent", label: "Accent colour", hint: "Buttons and highlights." },
  { key: "color.ink", label: "Text colour", hint: "Headings and body text." },
  { key: "color.background", label: "Background colour", hint: "The page behind everything." },
] as const;

const HEX6 = /^#[0-9a-f]{6}$/i;

export function TalentSiteBrandBody({ active }: { active: boolean }) {
  const { surfaceKind, pageSlug, queueRouterRefresh } = useEditContext();
  const { t } = useEditorLocale();
  const router = useRouter();
  const actions = useMemo(
    () => resolveThemeActionSet(surfaceKind, pageSlug),
    [surfaceKind, pageSlug],
  );

  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [chip, setChip] = useState<SaveChipStatus>("saved");
  const versionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !actions) return;
    let cancelled = false;
    setLoadErr(null);
    void actions.load().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        versionRef.current = res.snapshot.version;
        setDraft(res.snapshot.themeDraft);
        setChip("saved");
      } else {
        setLoadErr(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, actions]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const setColor = useCallback(
    (key: string, value: string) => {
      if (!draft || !actions) return;
      const next = { ...draft, [key]: value };
      setDraft(next);
      // Recolour the canvas immediately; the save follows.
      publishThemePreview(next);
      setChip("dirty");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setChip("saving");
        void actions
          .saveDraft({ patch: next, expectedVersion: versionRef.current })
          .then((res) => {
            if (res.ok) {
              versionRef.current = res.version;
              setChip("saved");
              void queueRouterRefresh();
            } else {
              setChip("error");
            }
          });
      }, 600);
    },
    [draft, actions, queueRouterRefresh],
  );

  if (!active) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[14px] py-[12px]">
      <div className="flex items-start justify-between gap-[8px]">
        <p className="m-0 text-[12px] leading-relaxed" style={{ color: CHROME.muted }}>
          {t(
            "Your design sets these colours. Change any of them: it applies to every page of your site and goes live when you publish.",
          )}
        </p>
        <SaveChip status={chip} />
      </div>

      {loadErr ? (
        <p className="m-0 text-[12px]" style={{ color: CHROME.rose }}>
          {loadErr}
        </p>
      ) : null}
      {!draft && !loadErr ? (
        <p className="m-0 text-[12px]" style={{ color: CHROME.muted }}>
          {t("Loading brand…")}
        </p>
      ) : null}

      {draft
        ? BRAND_COLOR_KEYS.map(({ key, label, hint }) => {
            const value = draft[key] ?? "";
            return (
              <Field key={key}>
                <FieldLabel info={t(hint)}>{t(label)}</FieldLabel>
                <div className="flex items-center gap-[8px]">
                  <input
                    type="color"
                    aria-label={t(label)}
                    value={HEX6.test(value) ? value : undefined}
                    onChange={(e) => setColor(key, e.target.value)}
                  />
                  <input
                    className="w-full rounded-[8px] border px-[10px] py-[6px] text-[12px]"
                    style={{ borderColor: CHROME.line, color: CHROME.ink }}
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (HEX6.test(v)) setColor(key, v);
                      else setDraft((d) => (d ? { ...d, [key]: e.target.value } : d));
                    }}
                  />
                </div>
              </Field>
            );
          })
        : null}

      <div
        className="flex flex-col gap-[8px] rounded-[10px] border px-[12px] py-[10px]"
        style={{ borderColor: CHROME.line }}
      >
        <p className="m-0 text-[12px] leading-relaxed" style={{ color: CHROME.muted }}>
          {t("Your name, logo, menu and footer are part of your site header and footer.")}
        </p>
        <button
          type="button"
          data-talent-brand-open-shell=""
          onClick={() => router.push("/talent/page-builder?shell=1")}
          className="inline-flex cursor-pointer items-center justify-center rounded-[10px] border px-[12px] py-[8px] text-[12.5px] font-semibold"
          style={{
            borderColor: CHROME.controlBorder,
            background: CHROME.controlFill,
            color: CHROME.text,
          }}
        >
          {t("Edit header and footer")}
        </button>
      </div>
    </div>
  );
}
