"use client";

/**
 * Legal tab — the bottom row of the footer: social icons, copyright line and
 * small-print links.
 *
 * These three sit together because they are ONE band on the rendered page. The
 * schema files them as three unrelated top-level fields (`social`, `legal`),
 * and the auto-bound form reproduced that split — so an operator adjusting "the
 * bottom bar" had to visit three disconnected field groups. Grouping by what
 * the visitor sees is the whole point of a bespoke inspector.
 *
 * SOCIAL: the platform set is a fixed enum, so the row editor is a platform
 * SELECT plus a URL — not a free-text pair. Picking from the enum is what lets
 * the renderer draw the right icon; a typed platform name silently renders
 * nothing, which is the failure mode the generic form had.
 */

import {
  DraggableList,
  InspectorField,
  InspectorGroup,
  InspectorInput,
  InspectorSelect,
  type DragHandleProps,
} from "../../kit";
import { useInspectorT } from "../../kit/use-inspector-t";
import {
  SITE_FOOTER_SOCIAL_PLATFORMS,
  type SiteFooterLink,
  type SiteFooterSocial,
  type SiteFooterSocialPlatform,
} from "@/lib/site-admin/site-footer/types";
import type { SiteFooterPatch } from "../SiteFooterInspector";
import { DragGlyph, PlusGlyph, TrashGlyph } from "../glyphs";
import { LinkRow } from "./ColumnsTab";

/** Schema caps — mirrored from `sections/site_footer/schema.ts`. */
const MAX_SOCIAL = 6;
const MAX_LEGAL_LINKS = 4;

/**
 * Display names for the platform enum.
 *
 * Every one is a product name, so none of them is translated — they read
 * identically in Spanish, and the ES parity guard carries exactly this list of
 * product names in its INTENTIONALLY_UNTRANSLATED map. "Email" is the one real
 * word and IS translated.
 */
const PLATFORM_LABEL: Record<SiteFooterSocialPlatform, string> = {
  instagram: "Instagram",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  vimeo: "Vimeo",
  spotify: "Spotify",
  github: "GitHub",
  email: "Email",
};

export function LegalTab({ api }: { api: SiteFooterPatch }) {
  const { t } = useInspectorT();
  const { value, patch } = api;
  const social = value.social;
  const legalLinks = value.legal.links;

  const atSocialCap = social.length >= MAX_SOCIAL;
  const atLegalCap = legalLinks.length >= MAX_LEGAL_LINKS;

  function setSocial(next: SiteFooterSocial[]) {
    patch({ social: next });
  }

  function setLegalLinks(next: SiteFooterLink[]) {
    patch({ legal: { ...value.legal, links: next } });
  }

  /** The first platform not already in the row — so "Add" never duplicates. */
  function nextUnusedPlatform(): SiteFooterSocialPlatform {
    const used = new Set(social.map((entry) => entry.platform));
    return (
      SITE_FOOTER_SOCIAL_PLATFORMS.find((platform) => !used.has(platform)) ??
      "instagram"
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup
        title="Social"
        info="The icon row at the bottom of the footer. Leave it empty to hide the row entirely."
        searchTerms={["social", "instagram", "tiktok", "icons"]}
      >
        {social.length === 0 ? (
          <p className="px-1 py-2 text-[11.5px] italic text-stone-400">
            {t("No social links. The icon row is hidden.")}
          </p>
        ) : (
          <DraggableList<SiteFooterSocial>
            items={social}
            keyOf={(_entry, index) => `social-${index}`}
            onReorder={setSocial}
          >
            {(entry, index, handleProps) => (
              <SocialRow
                entry={entry}
                handleProps={handleProps}
                onChange={(next) =>
                  setSocial(
                    social.map((s, i) => (i === index ? { ...s, ...next } : s)),
                  )
                }
                onRemove={() =>
                  setSocial(social.filter((_, i) => i !== index))
                }
              />
            )}
          </DraggableList>
        )}
        <button
          type="button"
          onClick={() => {
            if (atSocialCap) return;
            setSocial([...social, { platform: nextUnusedPlatform(), href: "" }]);
          }}
          disabled={atSocialCap}
          title={
            atSocialCap
              ? t("A footer can show at most 6 social links.")
              : undefined
          }
          className="mt-1 inline-flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-[12px] font-medium text-stone-500 transition-colors duration-150 hover:bg-[#faf9f6] hover:text-stone-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <PlusGlyph />
          {t("Add social link")}
        </button>
      </InspectorGroup>

      <InspectorGroup
        title="Legal"
        info="The small print on the last line of the page."
        searchTerms={["legal", "copyright", "privacy", "terms", "small print"]}
      >
        <InspectorField
          label="Copyright line"
          help="Leave empty to hide it. The year is not filled in automatically, so write it the way you want it to read."
        >
          <InspectorInput
            value={value.legal.copyright ?? ""}
            maxLength={200}
            placeholder="© Nova Crew"
            onChange={(event) =>
              patch({
                legal: { ...value.legal, copyright: event.target.value },
              })
            }
          />
        </InspectorField>

        <InspectorField label="Small-print links">
          {legalLinks.length === 0 ? (
            <p className="px-1 py-1 text-[11.5px] italic text-stone-400">
              {t("No small-print links yet.")}
            </p>
          ) : (
            <DraggableList<SiteFooterLink>
              items={legalLinks}
              keyOf={(_link, index) => `legal-${index}`}
              onReorder={setLegalLinks}
            >
              {(link, index, handleProps) => (
                <LinkRow
                  link={link}
                  handleProps={handleProps}
                  onChange={(next) =>
                    setLegalLinks(
                      legalLinks.map((l, i) =>
                        i === index ? { ...l, ...next } : l,
                      ),
                    )
                  }
                  onRemove={() =>
                    setLegalLinks(legalLinks.filter((_, i) => i !== index))
                  }
                />
              )}
            </DraggableList>
          )}
          <button
            type="button"
            onClick={() => {
              if (atLegalCap) return;
              setLegalLinks([
                ...legalLinks,
                { label: t("Privacy"), href: "/privacy" },
              ]);
            }}
            disabled={atLegalCap}
            title={
              atLegalCap
                ? t("A footer can show at most 4 small-print links.")
                : undefined
            }
            className="mt-1 inline-flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-[12px] font-medium text-stone-500 transition-colors duration-150 hover:bg-[#faf9f6] hover:text-stone-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <PlusGlyph />
            {t("Add small-print link")}
          </button>
        </InspectorField>
      </InspectorGroup>
    </div>
  );
}

function SocialRow({
  entry,
  handleProps,
  onChange,
  onRemove,
}: {
  entry: SiteFooterSocial;
  handleProps: DragHandleProps;
  onChange: (next: Partial<SiteFooterSocial>) => void;
  onRemove: () => void;
}) {
  const { t } = useInspectorT();
  return (
    <div className="group/social relative mb-1 flex items-center gap-1.5 rounded-md bg-white/55 px-1 py-1 ring-1 ring-transparent transition-[background-color,box-shadow] duration-150 focus-within:bg-white focus-within:ring-indigo-300/60 hover:bg-white hover:ring-stone-200/80">
      <button
        type="button"
        aria-label={t("Drag to reorder social link")}
        title={t("Drag to reorder social link")}
        {...handleProps}
        className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-stone-400 transition-[color,background-color] duration-150 hover:bg-stone-100 hover:text-stone-800 active:cursor-grabbing"
      >
        <DragGlyph />
      </button>
      <InspectorSelect
        value={entry.platform}
        aria-label={t("Platform")}
        onChange={(event) =>
          onChange({
            platform: event.target.value as SiteFooterSocialPlatform,
          })
        }
        style={{ width: 118, flexShrink: 0, padding: "5px 26px 5px 8px", fontSize: 12 }}
      >
        {SITE_FOOTER_SOCIAL_PLATFORMS.map((platform) => (
          <option key={platform} value={platform}>
            {PLATFORM_LABEL[platform]}
          </option>
        ))}
      </InspectorSelect>
      <InspectorInput
        value={entry.href}
        maxLength={500}
        placeholder={
          entry.platform === "email"
            ? "hello@example.com"
            : "https://instagram.com/…"
        }
        aria-label={t("Profile URL")}
        onChange={(event) => onChange({ href: event.target.value })}
        style={{ padding: "5px 8px", fontSize: 12, minWidth: 0 }}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("Remove social link")}
        title={t("Remove social link")}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-stone-500 opacity-40 transition-[opacity,color,background-color] duration-150 hover:bg-rose-50 hover:text-rose-600 group-focus-within/social:opacity-100 group-hover/social:opacity-100"
      >
        <TrashGlyph />
      </button>
    </div>
  );
}
