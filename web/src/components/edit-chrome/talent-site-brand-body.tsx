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
import { Palette, PanelTop } from "lucide-react";

import { useEditContext } from "./edit-context";
import { CHROME, Field, FieldLabel, SaveChip, type SaveChipStatus } from "./kit";
import { ColorSwatchButton } from "./inspectors/color-swatch-button";
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

  const accent = draft?.["color.accent"];
  const ink = draft?.["color.ink"];
  const background = draft?.["color.background"];

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-y-auto px-[14px] py-[12px]"
      data-talent-site-brand=""
    >
      <div className="flex items-start justify-between gap-[8px]">
        <div className="flex min-w-0 items-start gap-2">
          <span
            aria-hidden
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px]"
            style={{
              background: "rgba(124, 58, 237, 0.10)",
              color: CHROME.accent,
            }}
          >
            <Palette size={14} strokeWidth={2.2} />
          </span>
          <p
            className="m-0 text-[11.5px] leading-snug"
            style={{ color: CHROME.muted }}
          >
            {t(
              "Your design sets these colours. Change any of them: it applies to every page of your site and goes live when you publish.",
            )}
          </p>
        </div>
        <SaveChip status={chip} />
      </div>

      {draft ? (
        <div
          aria-hidden
          className="flex h-9 overflow-hidden rounded-[10px] border"
          style={{ borderColor: CHROME.line }}
          data-brand-palette-preview=""
        >
          <span style={{ flex: 1.2, background: HEX6.test(accent ?? "") ? accent : "#7c3aed" }} />
          <span style={{ flex: 1, background: HEX6.test(ink ?? "") ? ink : "#0b0b0d" }} />
          <span
            style={{
              flex: 1.4,
              background: HEX6.test(background ?? "") ? background : "#faf9f6",
            }}
          />
        </div>
      ) : null}

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
              <div
                key={key}
                className="rounded-[12px] border px-3 py-2.5 shadow-[0_1px_2px_rgba(17,24,39,0.04)]"
                style={{
                  borderColor: CHROME.line,
                  background: CHROME.surface,
                }}
                data-brand-color-row={key}
              >
                <Field>
                  <FieldLabel info={t(hint)}>{t(label)}</FieldLabel>
                  <div className="flex items-center gap-[8px]">
                    <ColorSwatchButton
                      color={HEX6.test(value) ? value : "#000000"}
                      ariaLabel={t(label)}
                      onChange={(next) => setColor(key, next)}
                    />
                    <input
                      className="w-full rounded-[8px] border px-[10px] py-[7px] font-mono text-[12px] tracking-wide"
                      style={{
                        borderColor: CHROME.lineStrong,
                        color: CHROME.ink,
                        background: CHROME.surface2,
                      }}
                      value={value}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (HEX6.test(v)) setColor(key, v);
                        else
                          setDraft((d) =>
                            d ? { ...d, [key]: e.target.value } : d,
                          );
                      }}
                    />
                  </div>
                </Field>
              </div>
            );
          })
        : null}

      <div
        className="flex flex-col gap-[10px] rounded-[12px] border px-[12px] py-[12px]"
        style={{
          borderColor: "rgba(124, 58, 237, 0.18)",
          background: "rgba(124, 58, 237, 0.04)",
        }}
      >
        <p
          className="m-0 text-[11.5px] leading-snug"
          style={{ color: CHROME.muted }}
        >
          {t(
            "Your name, logo, menu and footer are part of your site header and footer.",
          )}
        </p>
        <button
          type="button"
          data-talent-brand-open-shell=""
          onClick={() => router.push("/talent/page-builder?shell=1")}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-none px-[12px] py-[9px] text-[12.5px] font-semibold text-white transition-[background-color,transform] duration-150 motion-safe:active:scale-[0.98]"
          style={{
            background: CHROME.accent,
            boxShadow: "0 1px 3px rgba(124,58,237,0.35)",
          }}
        >
          <PanelTop size={14} strokeWidth={2.2} aria-hidden />
          {t("Edit header and footer")}
        </button>
      </div>
    </div>
  );
}
