"use client";

/**
 * Website settings (WSF F1): the shell. A list of groups, each with a one-line
 * summary, opening a group sub-screen. One draft across all groups, saved only
 * by an explicit Save (operational settings never auto-save).
 *
 * Backed only by stores that exist and are read today:
 *  - `talent_profiles.selling_defaults` via load/saveSellingDefaults
 *  - `talent_offerings.booking_mode` via loadTalentOfferingsForEditor/upsertTalentOffering
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  loadSellingDefaults,
  saveSellingDefaults,
  type SellingDefaults,
} from "@/lib/talent/services-settings-actions";
import { loadTalentOfferingsForEditor, upsertTalentOffering } from "@/lib/talent/offerings-actions";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { NavRow, SaveBar, StatusChip, UnsavedExitSheet, type SaveStatus } from "./primitives";
import { BookingGroup, PaymentsGroup, SelfServiceGroup, TimingGroup, postureLabel } from "./WebsiteSettingsGroups";
import {
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
    bookingMode: o.bookingMode === "instant" ? "instant" : "request",
    depositPct: o.depositPct ?? null,
    cancellationHours: o.cancellationHours ?? null,
  };
}

type View = "home" | "booking" | "timing" | "pay" | "self";

export function WebsiteSettingsScreen({ talentId, onClose }: { talentId: string; onClose: () => void }) {
  const copy = useDashboardText();
  const t = copy.t;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<TalentOffering[] | null>(null);
  const [saved, setSaved] = useState<SettingsDraft | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [view, setView] = useState<View>("home");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [d, o] = await Promise.all([loadSellingDefaults(talentId), loadTalentOfferingsForEditor(talentId)]);
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
        depositRequired: needsOwnDeposit(o),
      })),
    [offerings, t],
  );

  const unsaved = saved && draft ? changeCount(saved, draft) : 0;
  const dirty = unsaved > 0;

  const edit = (next: SettingsDraft) => {
    setDraft(next);
    if (status === "failed") setStatus("idle");
  };
  const setDefaults = (defaults: SellingDefaults) => draft && edit({ ...draft, defaults });
  const setService = (id: string, patch: Partial<ServiceFields>) =>
    draft && edit({ ...draft, services: { ...draft.services, [id]: { ...draft.services[id], ...patch } } });

  const save = useCallback(async (): Promise<boolean> => {
    if (!saved || !draft || !offerings) return false;
    setStatus("saving");
    const diff = diffDraft(saved, draft);
    let nextSaved = saved;
    let ok = true;
    if (diff.defaults.length > 0) {
      const res = await saveSellingDefaults(talentId, draft.defaults);
      if (res.ok) nextSaved = { ...nextSaved, defaults: draft.defaults };
      else ok = false;
    }
    const nextOfferings = [...offerings];
    for (const id of diff.services) {
      const idx = nextOfferings.findIndex((o) => o.id === id);
      if (idx < 0) continue;
      const fields = draft.services[id];
      const res = await upsertTalentOffering(talentId, {
        ...nextOfferings[idx],
        bookingMode: fields.bookingMode,
        depositPct: fields.depositPct,
        cancellationHours: fields.cancellationHours,
      });
      if (res.ok) {
        nextOfferings[idx] = res.item;
        nextSaved = { ...nextSaved, services: { ...nextSaved.services, [id]: fields } };
      } else ok = false;
    }
    // Keep whatever did save, so a retry only resends what is still different.
    setOfferings(nextOfferings);
    setSaved(nextSaved);
    setStatus(ok ? "idle" : "failed");
    return ok;
  }, [saved, draft, offerings, talentId]);

  const discard = () => {
    if (saved) setDraft(saved);
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
    booking: t("Services & booking"),
    timing: t("Availability & timing"),
    pay: t("Payments"),
    self: t("Client self-service"),
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
      <StatusChip
        status={status}
        unsaved={unsaved}
        labels={{ saved: t("Saved · live now"), unsaved: t("{n} unsaved"), saving: t("Saving…"), failed: t("Couldn’t save") }}
      />
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
  const groupProps = { t, draft, setDefaults, services, setService };
  const instantCount = Object.values(draft.services).filter((f) => f.bookingMode === "instant").length;

  return (
    <div className="mx-auto max-w-xl px-4 font-admin-body">
      {header}
      {view === "home" ? (
        <div className="overflow-hidden rounded-xl border border-admin-border-soft bg-white">
          <NavRow
            title={titles.booking}
            summary={t("{mode} by default · {n} of {total} services set to instant")
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
              .replace("{notice}", String(Math.round((d.minNoticeMin ?? 0) / 60)))}
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
        </div>
      ) : null}
      {view === "booking" ? <BookingGroup {...groupProps} /> : null}
      {view === "timing" ? <TimingGroup {...groupProps} /> : null}
      {view === "pay" ? <PaymentsGroup {...groupProps} /> : null}
      {view === "self" ? <SelfServiceGroup {...groupProps} /> : null}

      <SaveBar
        status={status}
        dirty={dirty}
        onDiscard={discard}
        onSave={() => void save()}
        labels={{ discard: t("Discard"), save: t("Save"), saving: t("Saving…"), retry: t("Retry save"), nothing: t("No changes yet. Edit a setting to save.") }}
      />

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
            void save().then((ok) => {
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
