"use client";

/**
 * LanguageMenu — the top bar's dashboard-language button.
 *
 * A 32px square like the search and + buttons beside it, reading the active
 * locale as its code ("EN"). Click opens a menu of every language this
 * workspace supports (the active one ticked) plus an "Add a language" row
 * that opens the workspace settings drawer, where languages are managed.
 *
 * Picking a language writes the same cookie the account menu's pills write
 * (`setLocaleCookie`) and reloads, so layout copy follows.
 *
 * Talents (PR 7): with exactly one secondary language the button becomes a
 * `LocaleSwitchPill` (ES | EN); with none it renders nothing; with more the
 * menu lists the talent's languages and ends in "Manage languages", which
 * opens Website settings > Languages. The switch changes only the dashboard
 * language and the content locale (via reload), never the site's primary.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useEffect, useRef, useState } from "react";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { readLocaleFromDocumentCookie, setLocaleCookie } from "@/components/dashboard-locale-toggle";
import { getLocaleMetadata, type Locale } from "@/i18n/config";
import { useDashboardText } from "../dashboard-i18n";
import { Icon } from "../primitives";
import { meetsRole, useAdminShell } from "../state";
import { requestWebsiteSettingsView } from "@/components/talent/website-settings/website-settings-intent";
import { LocaleSwitchPill } from "./LocaleSwitchPill";
import { useTalentContentLocaleSeed } from "./use-talent-content-locale-seed";

export function LanguageMenu() {
  const { state, openDrawer, setTalentPage, supportedLocales, tenantDefaultLocale, talentLocales } = useAdminShell();
  useTalentContentLocaleSeed(talentLocales);
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const locales: readonly Locale[] = talentLocales
    ? [talentLocales.primary, ...talentLocales.secondary]
    : supportedLocales.length > 0
      ? supportedLocales
      : [tenantDefaultLocale];
  const defaultLocale: Locale = talentLocales?.primary ?? tenantDefaultLocale;
  const localesKey = locales.join(",");
  const renderedLocale = useDashboardLocale();
  const [active, setActive] = useState<Locale>(talentLocales?.primary ?? tenantDefaultLocale);

  useEffect(() => {
    const list = localesKey.split(",").filter((s): s is Locale => s.length > 0);
    setActive(readLocaleFromDocumentCookie(defaultLocale, list));
  }, [defaultLocale, localesKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (next: Locale) => {
    setOpen(false);
    // Compare with the language actually RENDERED, not the pill's guess: with no
    // cookie the pill defaulted to the primary while the page showed another
    // language, so picking the visible-but-different one was swallowed (2nd click).
    if (next === renderedLocale) return;
    setLocaleCookie(next);
    setActive(next);
    window.location.reload();
  };

  const canAddLanguage = talentLocales ? true : meetsRole(state.role, "admin");
  const languageWord = copy.t("Language");

  if (talentLocales) {
    if (talentLocales.secondary.length === 0) return null;
    if (talentLocales.secondary.length === 1) {
      return <LocaleSwitchPill locales={locales} active={active} label={languageWord} onPick={pick} />;
    }
  }
  const manage = () => {
    setOpen(false);
    if (talentLocales) {
      requestWebsiteSettingsView("lang");
      setTalentPage("public-page");
    } else openDrawer("workspace-settings");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-tulala-language-menu
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${languageWord} · ${getLocaleMetadata(active).label}`}
        title={languageWord}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[32px] min-w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-admin-border bg-admin-card px-[7px] font-admin-body text-admin-11h font-semibold uppercase tracking-[0.04em] text-admin-ink-muted hover:text-admin-ink [transition:color_var(--transition-admin-micro)]"
      >
        {active}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={languageWord}
          className="absolute right-0 top-[calc(100%+6px)] z-[60] w-[220px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[6px] font-admin-body shadow-admin-hover"
        >
          {locales.map((code) => {
            const isActive = code === active;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => pick(code)}
                className="flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] px-[10px] py-[7px] text-left hover:bg-admin-surface-alt"
              >
                <span className="inline-flex w-[26px] shrink-0 justify-center rounded-[5px] border border-admin-border-soft bg-admin-surface py-[1px] font-mono text-admin-10 font-semibold uppercase text-admin-ink-dim">
                  {code}
                </span>
                <span className="min-w-0 flex-1 text-admin-13 font-medium text-admin-ink">
                  {getLocaleMetadata(code).label}
                </span>
                {isActive && (
                  <span aria-hidden className="inline-flex text-admin-ink">
                    <Icon name="check" size={13} stroke={2} color="currentColor" />
                  </span>
                )}
              </button>
            );
          })}
          {canAddLanguage && (
            <>
              <div className="mx-[4px] my-[4px] border-t border-admin-border-soft" />
              <button
                type="button"
                role="menuitem"
                onClick={manage}
                className="flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] px-[10px] py-[7px] text-left hover:bg-admin-surface-alt"
              >
                <span className="inline-flex w-[26px] shrink-0 justify-center text-admin-ink-dim">
                  <Icon name="plus" size={13} stroke={1.75} color="currentColor" />
                </span>
                <span className="min-w-0 flex-1 text-admin-13 font-medium text-admin-ink">
                  {talentLocales ? copy.t("Manage languages") : copy.t("Add a language")}
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
