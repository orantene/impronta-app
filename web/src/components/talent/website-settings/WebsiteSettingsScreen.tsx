"use client";

/**
 * Website settings (WSF F1): the shell. A list of groups, each with a one-line
 * summary, opening a group sub-screen. One draft across all groups, saved only
 * by an explicit Save (operational settings never auto-save).
 *
 * Backed only by stores that exist and are read today:
 *  - `talent_profiles.selling_defaults` via load/saveSellingDefaults
 *  - `talent_offerings.booking_mode` / deposit / cancelling via
 *    loadTalentOfferingsForEditor/patchOfferingBookingRules (only those
 *    columns, so a Services-editor edit made meanwhile survives; WSF B2)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { WEBSITE_SETTINGS_ES_TEXT } from "@/components/admin/shell/internal/dashboard-i18n-website-settings";
import {
  loadSellingDefaults,
  saveSellingDefaults,
  type SellingDefaults,
} from "@/lib/talent/services-settings-actions";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { patchOfferingBookingRules } from "@/lib/talent/offering-booking-rules-action";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { resolveEffectiveMinNoticeMin } from "@/lib/scheduling/instant-book-gates";
import { MaxSiteSettingsPanels } from "@/components/talent/site/TalentMaxSiteSettingsPanels";
import { settle } from "./settle";
import { loadHoursMinNoticeAction } from "./website-settings-gate-action";
import { loadSiteSwitchesAction, saveSiteSwitchesAction, type SiteSwitchesSnapshot } from "./website-settings-switches-action";
import {
  AcceptBookingsCard,
  ChatInquiriesGroup,
  VisibilityGroup,
  chatSummary,
  visibilitySummary,
} from "./WebsiteSettingsSwitchGroups";
import { DEFAULT_TALENT_SITE_SWITCHES, type TalentSiteSwitches } from "@/lib/talent/site-switches";
import {
  READINESS_GAP_COPY,
  readinessGaps,
  takesMoneyOnline,
  switchSaveImpact,
} from "@/lib/talent/accepting-readiness";
import { NavRow, SaveBar, StatusChip, UnsavedExitSheet, type SaveStatus } from "./primitives";
import { ConfirmSheet, LanguagesGroup, languagesSummary } from "./LanguagesGroup";
import { languagesChangeCount, type LanguagesDraft } from "./languages-model";
import { useLanguagesDraft } from "./use-languages-draft";
import { BookingGroup, PaymentsGroup, SelfServiceGroup, TimingGroup, postureLabel } from "./WebsiteSettingsGroups";
import {
  switchChangeCount,
  pendingChangeLabels,
  effectiveServiceMode,
  canBookInstantly,
  changeCount,
  countCustom,
  diffDraft,
  needsOwnDeposit,
  type ServiceFields,
  type SettingsDraft,
  type SettingsService,
} from "./settings-model";

function fieldsOf(o: TalentOffering): ServiceFields {
  return {
    bookingMode: o.bookingMode ?? null,
    depositPct: o.depositPct ?? null,
    cancellationHours: o.cancellationHours ?? null,
  };
}

type View = "home" | "site" | "lang" | "booking" | "timing" | "pay" | "self" | "chat" | "vis";

export function WebsiteSettingsScreen({
  talentId,
  onClose,
  initialView,
}: {
  talentId: string;
  onClose: () => void;
  /** Deep link (PR 7): open straight on a group, e.g. "lang". */
  initialView?: "lang";
}) {
  const copy = useDashboardText();
  // Screen strings live in the lazy chunk, not the global admin map.
  const t = (value: string) =>
    copy.isSpanish ? (WEBSITE_SETTINGS_ES_TEXT[value] ?? copy.t(value)) : copy.t(value);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<TalentOffering[] | null>(null);
  const [saved, setSaved] = useState<SettingsDraft | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [view, setView] = useState<View>(initialView ?? "home");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [confirmExit, setConfirmExit] = useState(false);
  const [hoursNoticeMin, setHoursNoticeMin] = useState<number | null>(null);
  // WSF-C: talent_sites switches, in the same draft / Save flow.
  const [savedSw, setSavedSw] = useState<TalentSiteSwitches>(DEFAULT_TALENT_SITE_SWITCHES);
  const [draftSw, setDraftSw] = useState<TalentSiteSwitches>(DEFAULT_TALENT_SITE_SWITCHES);
  const [swReadiness, setSwReadiness] = useState<SiteSwitchesSnapshot["readiness"] | null>(null);
  /** A save that stored some parts and failed others. */
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [d, o, h, sw] = await Promise.all([
        loadSellingDefaults(talentId),
        loadTalentOfferingsForEditor(talentId),
        loadHoursMinNoticeAction().catch(() => null),
        loadSiteSwitchesAction().catch(() => null),
      ]);
      if (!live) return;
      if (!d.ok || !o.ok) {
        setLoadError(t("Your settings could not load. Try again in a moment."));
        return;
      }
      const services = o.items.filter((i) => i.kind !== "product" && i.status !== "archived");
      const snapshot: SettingsDraft = {
        defaults: d.defaults,
        services: Object.fromEntries(services.map((i) => [i.id, fieldsOf(i)])),
      };
      setOfferings(services);
      setHoursNoticeMin(h);
      if (sw) {
        setSavedSw(sw.switches);
        setDraftSw(sw.switches);
        setSwReadiness(sw.readiness);
      }
      setSaved(snapshot);
      setDraft(snapshot);
    })();
    return () => {
      live = false;
    };
  }, [talentId, t]);

  const services: SettingsService[] = useMemo(
    () =>
      (offerings ?? []).map((o) => ({
        id: o.id,
        title: o.title || t("Untitled service"),
        canBookInstantly: canBookInstantly(o) && !(needsOwnDeposit({ ...o, bookingMode: "instant" }) && !o.depositPct),
        // Effective mode: an inherited-instant service with a deposit reserve
        // needs its own deposit too (WSF B2).
        depositRequired: needsOwnDeposit({
          ...o,
          bookingMode: effectiveServiceMode(
            draft?.services[o.id]?.bookingMode ?? null,
            draft?.defaults.bookingPosture ?? "request",
          ),
        }),
        quote: o.priceDisplay === "quote",
        instantGap: swReadiness
          ? (() => {
              const gap = readinessGaps({
                kind: o.kind,
                hasWorkingHours: swReadiness.hasWorkingHours,
                durationMinutes: o.durationMinutes ?? null,
                takesMoneyOnline: takesMoneyOnline(o.reserveMode, o.allowPayInPerson === true),
                payoutsReady: swReadiness.payoutsReady,
              })[0];
              return gap ? t(READINESS_GAP_COPY[gap]) : null;
            })()
          : null,
      })),
    [offerings, t, swReadiness, draft],
  );

  // PR 7: talent languages ride the same draft / Save / unsaved-exit flow.
  const lang = useLanguagesDraft(t);
  const langOnOpen = lang.onOpen;
  useEffect(() => {
    if (view === "lang") langOnOpen();
  }, [view, langOnOpen]);
  const unsaved =
    saved && draft
      ? changeCount(saved, draft) + switchChangeCount(savedSw, draftSw) + languagesChangeCount(lang.saved, lang.draft)
      : 0;
  const dirty = unsaved > 0;

  const edit = (next: SettingsDraft) => {
    setDraft(next);
    if (status === "failed") setStatus("idle");
  };
  const setDefaults = (defaults: SellingDefaults) => draft && edit({ ...draft, defaults });
  const setService = (id: string, patch: Partial<ServiceFields>) =>
    draft && edit({ ...draft, services: { ...draft.services, [id]: { ...draft.services[id], ...patch } } });

  const save = useCallback(async (confirmedPrimary = false): Promise<boolean> => {
    if (!saved || !draft || !offerings) return false;
    if (!confirmedPrimary && lang.primaryChanged) {
      lang.askConfirmPrimary();
      return false;
    }
    setStatus("saving");
    const diff = diffDraft(saved, draft);
    let nextSaved = saved;
    let ok = true;
    if (diff.defaults.length > 0) {
      const r = await settle(() => saveSellingDefaults(talentId, draft.defaults));
      const res = r.ok ? r.value : { ok: false as const };
      if (res.ok) nextSaved = { ...nextSaved, defaults: draft.defaults };
      else ok = false;
    }
    const nextOfferings = [...offerings];
    for (const id of diff.services) {
      const idx = nextOfferings.findIndex((o) => o.id === id);
      if (idx < 0) continue;
      const fields = draft.services[id];
      const r = await settle(() =>
        patchOfferingBookingRules(talentId, id, {
          bookingMode: fields.bookingMode,
          depositPct: fields.depositPct,
          cancellationHours: fields.cancellationHours,
        }),
      );
      const res = r.ok ? r.value : null;
      if (res?.ok) {
        nextOfferings[idx] = { ...res.item, imageUrls: nextOfferings[idx].imageUrls };
        nextSaved = { ...nextSaved, services: { ...nextSaved.services, [id]: fields } };
      } else ok = false;
    }
    let swSaved = false;
    if (switchChangeCount(savedSw, draftSw) > 0) {
      const r = await settle(() => saveSiteSwitchesAction(draftSw));
      const res = r.ok ? r.value : null;
      if (res?.ok) {
        setSavedSw(res.switches);
        swSaved = true;
      }
      else ok = false;
    }
    if (languagesChangeCount(lang.saved, lang.draft) > 0) {
      const res = await lang.save();
      if (!res) ok = false;
    }
    // Keep whatever did save, so a retry only resends what is still different.
    setOfferings(nextOfferings);
    setSaved(nextSaved);
    // Honest partial state: something landed, something did not.
    setPartial(!ok && (nextSaved !== saved || swSaved));
    setStatus(ok ? "idle" : "failed");
    return ok;
  }, [saved, draft, offerings, talentId, draftSw, savedSw, t, lang]);

  const discard = () => {
    if (saved) setDraft(saved);
    setDraftSw(savedSw);
    lang.discard();
    setPartial(false);
    setStatus("idle");
  };

  const back = () => {
    if (view !== "home") {
      setView("home");
      return;
    }
    if (dirty) {
      setConfirmExit(true);
      return;
    }
    onClose();
  };

  const titles: Record<View, string> = {
    home: t("Website settings"),
    site: t("Address, logo and pages"),
    lang: t("Languages"),
    booking: t("Services & booking"),
    timing: t("Availability & timing"),
    pay: t("Payments"),
    self: t("Client self-service"),
    chat: t("Chat & inquiries"),
    vis: t("Appearance & visibility"),
  };

  const header = (
    <div className="mb-4 flex items-center gap-2">
      <button
        type="button"
        onClick={back}
        className="min-h-[44px] shrink-0 pr-2 text-[14px] text-admin-ink-muted hover:text-admin-ink"
      >
        ‹ {view === "home" ? t("My website") : t("Settings")}
      </button>
      <h1 className="min-w-0 flex-1 truncate text-[18px] font-semibold text-admin-ink">{titles[view]}</h1>
      {/* No chip until settings load: "Saved" would be a claim about nothing. */}
      {draft && saved ? (
      <StatusChip
        status={status}
        unsaved={unsaved}
        labels={{ saved: t("Saved · live now"), unsaved: t("{n} unsaved"), saving: t("Saving…"), failed: partial ? t("Some changes saved") : t("Couldn’t save") }}
      />
      ) : null}
    </div>
  );

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl px-4 font-admin-body">
        {header}
        <p className="rounded-lg bg-red-50 px-3.5 py-3 text-[13.5px] text-red-800">{loadError}</p>
      </div>
    );
  }
  if (!draft || !saved) {
    return (
      <div className="mx-auto max-w-xl px-4 font-admin-body">
        {header}
        <p className="text-[13.5px] text-admin-ink-muted">{t("Loading…")}</p>
      </div>
    );
  }

  const d = draft.defaults;
  // Display only: same overlay the booking path uses (defaults win, then hours row).
  const noticeMin = resolveEffectiveMinNoticeMin({ hoursMinNoticeMin: hoursNoticeMin, sellingDefaults: d });
  const groupProps = { t, draft, setDefaults, services, setService };
  const setSwitches = (next: TalentSiteSwitches) => {
    setDraftSw(next);
    if (status === "failed") setStatus("idle");
  };
  const switchProps = { t, switches: draftSw, setSwitches };
  // Q3 live warning: which services would lose their only route.
  const strandedTitles =
    draftSw.acceptingBookings && !draftSw.acceptingInquiries
      ? services
          .filter((s) => effectiveServiceMode(draft.services[s.id]?.bookingMode ?? null, d.bookingPosture) === "inquiry")
          .map((s) => s.title)
      : [];
  const defaultGap = swReadiness
    ? readinessGaps({ hasWorkingHours: swReadiness.hasWorkingHours, takesMoneyOnline: false, payoutsReady: swReadiness.payoutsReady })[0]
    : undefined;
  const defaultInstantGap = defaultGap ? t(READINESS_GAP_COPY[defaultGap]) : null;
  const instantCount = Object.values(draft.services).filter((f) => f.bookingMode != null).length;

  return (
    <div className="mx-auto max-w-xl px-4 font-admin-body">
      {header}
      {view === "home" ? (
        <div className="overflow-hidden rounded-xl border border-admin-border-soft bg-white">
          <NavRow
            title={titles.site}
            summary={t("Site address, logo, pages and custom domain")}
            onOpen={() => setView("site")}
          />
          {lang.draft ? (
            <NavRow
              title={titles.lang}
              summary={languagesSummary(t, lang.draft)}
              onOpen={() => setView("lang")}
            />
          ) : null}
          <NavRow
            title={titles.booking}
            summary={t("{mode} by default · {n} of {total} services with their own setting")
              .replace("{mode}", postureLabel(d.bookingPosture, t))
              .replace("{n}", String(instantCount))
              .replace("{total}", String(services.length))}
            onOpen={() => setView("booking")}
          />
          <NavRow
            title={titles.timing}
            summary={t("{before} min before · {after} min after · {notice} h notice")
              .replace("{before}", String(d.bufferBeforeMin ?? 0))
              .replace("{after}", String(d.bufferAfterMin ?? 0))
              .replace("{notice}", String(Math.round(noticeMin / 60)))}
            onOpen={() => setView("timing")}
          />
          <NavRow
            title={titles.pay}
            summary={`${
              d.depositPct ? t("Deposit {pct}% when they book").replace("{pct}", String(d.depositPct)) : t("No deposit")
            } · ${t("{n} with their own setting").replace("{n}", String(countCustom(draft.services, "depositPct")))}`}
            onOpen={() => setView("pay")}
          />
          <NavRow
            title={titles.self}
            summary={t("Free cancelling until {c} h · rescheduling until {r} h")
              .replace("{c}", String(d.cancelHours ?? 24))
              .replace("{r}", String(d.rescheduleHours ?? 24))}
            onOpen={() => setView("self")}
          />
          <NavRow title={titles.chat} summary={chatSummary(t, draftSw)} onOpen={() => setView("chat")} />
          <NavRow title={titles.vis} summary={visibilitySummary(t, draftSw)} onOpen={() => setView("vis")} />
        </div>
      ) : null}
      {view === "booking" ? (
        <BookingGroup
          {...groupProps}
          defaultInstantGap={defaultInstantGap}
          savedPosture={saved.defaults.bookingPosture}
          before={<AcceptBookingsCard {...switchProps} />}
        />
      ) : null}
      {view === "chat" ? <ChatInquiriesGroup {...switchProps} strandedTitles={strandedTitles} /> : null}
      {view === "vis" ? <VisibilityGroup {...switchProps} /> : null}
      {status === "failed" && partial ? (
        <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">
          {t("Some changes saved. Still unsaved: {items}. Retry sends only these.").replace(
            "{items}",
            pendingChangeLabels({
              saved,
              draft,
              savedSwitches: savedSw,
              draftSwitches: draftSw,
              serviceTitle: (id) => services.find((x) => x.id === id)?.title ?? t("Untitled service"),
              labels: { defaults: t("Your defaults"), bookings: t("Accept new bookings"), chat: t("Chat & inquiries") },
            }).join(", "),
          )}
        </p>
      ) : null}
      {view === "timing" ? <TimingGroup {...groupProps} noticeMin={noticeMin} /> : null}
      {view === "pay" ? <PaymentsGroup {...groupProps} /> : null}
      {view === "pay" && swReadiness && (!swReadiness.payoutsReady || !swReadiness.connectPayoutsEnabled) ? (
        // Q2: advisory. The server gate reads platform checkout (PAY-2 Option B).
        <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">
          {t(READINESS_GAP_COPY.payouts)}
        </p>
      ) : null}
      {view === "self" ? <SelfServiceGroup {...groupProps} /> : null}
      {view === "site" ? <MaxSiteSettingsPanels /> : null}
      {view === "lang" && lang.draft && lang.saved ? (
        <LanguagesGroup
          t={t}
          uiLocale={copy.locale}
          draft={lang.draft}
          saved={lang.saved}
          suggested={lang.suggested}
          setDraft={(next: LanguagesDraft) => {
            lang.setDraft(next);
            if (status === "failed") setStatus("idle");
          }}
        />
      ) : null}
      {lang.confirmPrimary && lang.draft && lang.saved ? (
        <ConfirmSheet
          title={t("Switch your primary language to {lang}?").replace("{lang}", lang.nameInUi(lang.draft.primary))}
          body={t("Your site's default language, links and search listing change. Your {old} text is kept.").replace(
            "{old}",
            lang.nameInUi(lang.saved.primary),
          )}
          confirm={t("Switch language")}
          cancel={t("Keep editing")}
          onConfirm={() => {
            lang.closeConfirmPrimary();
            void save(true);
          }}
          onCancel={lang.closeConfirmPrimary}
        />
      ) : null}

      {view === "site" ? null : (
      <SaveBar
        status={status}
        dirty={dirty}
        onDiscard={discard}
        onSave={() => void save()}
        labels={{ discard: t("Discard"), save: t("Save"), saving: t("Saving…"), retry: t("Retry save"), nothing: t("No changes yet. Edit a setting to save.") }}
      />
      )}

      {confirmExit ? (
        <UnsavedExitSheet
          title={t("Leave without saving?")}
          body={(unsaved === 1 ? t("You have 1 unsaved change.") : t("You have {n} unsaved changes.")).replace(
            "{n}",
            String(unsaved),
          )}
          labels={{ saveLeave: t("Save and leave"), discard: t("Discard changes"), stay: t("Keep editing") }}
          onSaveAndLeave={() => {
            setConfirmExit(false);
            void save(true).then((ok) => {
              if (ok) onClose();
            });
          }}
          onDiscard={() => {
            setConfirmExit(false);
            discard();
            onClose();
          }}
          onStay={() => setConfirmExit(false)}
        />
      ) : null}
    </div>
  );
}
