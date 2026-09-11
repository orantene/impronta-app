"use client";

/**
 * PosModesSettingsCard — Settings › POS as the W20 board draws it: the
 * header "POS · <location>" with the one location and the save state, the
 * modes at this location beside the devices & drawers, then Tips, Receipts
 * and Offline.
 *
 * Writes `agencies.settings.pos.locations.<slug>.modes` through
 * `getLocationModes` / `setLocationModes` (D-POS-76). A toggle saves
 * immediately and the header's chip says Saving · Saved HH:MM · Save failed
 * (W58). Writes are gated to the owner: `setLocationModes` requires
 * `manage_billing`.
 *
 * TURNING THE LAST MODE OFF IS A REAL, PERSISTED STATE, said in words
 * (`allOffHint`). A MODE WITH NO SCREEN IS NEVER OFFERED AS A TOGGLE THAT
 * WORKS: an unbuilt mode's switch is disabled with its reason. EVERY REFUSAL
 * IS A CODE THE CARD TRANSLATES (`PosModesRefusal`), so a Spanish or French
 * operator reads it in their own language, and a load that never resolves
 * has its own sentence and a retry (W59), never "Loading…" for ever.
 *
 * WHAT IS DRAWN BUT NOT WIRED, each disabled with its one-sentence reason
 * (D-POS-58): Field Services, Pair a device, and every Tips / Receipts /
 * Offline field. Locations come from `venue_locations`.
 *
 * THE PLATFORM SWITCH OUTRANKS EVERYTHING HERE. With
 * `platform_settings.workspace_pos_enabled` off nothing reads the modes
 * (`PosModeSwitch`, `MobileBottomNav`), so this renders one plain sentence
 * instead of a bank of switches that look live and are not.
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { getLocationModes, setLocationModes } from "@/lib/server-actions/pos-modes";
import { getPosLocationFacts, type PosLocationFacts } from "@/lib/server-actions/pos-location-facts";
import { locationsList } from "@/lib/server-actions/venue-engine";
import { CLIENT_LOAD_REFUSAL, type ClientLoadRefusal, type PosModesRefusal } from "@/lib/settings/refusals";
import { POS_MODES, POS_MODE_META, type PosMode } from "@/lib/pos/modes";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";
import {
  ActionButton,
  CouldNotLoad,
  DeviceRow,
  LoadingLines,
  Note,
  SaveStateChip,
  Segmented,
  SelectField,
  SettingsCard,
  SettingsHeader,
  StatePill,
  Switch,
  SwitchRow,
  type SaveState,
} from "./settings-ui";

const K = "dashboard.adminWorkspace.posModes";

/** A server refusal, or the one failure that never reaches the server at all. */
type CardRefusal = PosModesRefusal | ClientLoadRefusal;

type LocationOption = { id: string; slug: string; label: string };

function clock(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function PosModesSettingsCard({
  canEdit,
  platformEnabled,
  workspaceName,
}: {
  canEdit: boolean;
  /** `platform_settings.workspace_pos_enabled` off the shell bridge — the platform kill switch. */
  platformEnabled: boolean;
  workspaceName: string;
}) {
  const t = useT();
  const queueRouterRefresh = useQueuedRouterRefresh();

  // `null` = not loaded yet or unreadable; never rendered as "everything off".
  const [current, setCurrent] = useState<PosMode[] | null>(null);
  const [loadRefusal, setLoadRefusal] = useState<CardRefusal | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  // The change a failed save was carrying, so Retry sends the SAME change once.
  const [pending, setPending] = useState<PosMode[] | null>(null);
  const [facts, setFacts] = useState<PosLocationFacts | null>(null);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [locationSlug, setLocationSlug] = useState("default");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadRefusal(null);
    void locationsList()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoadRefusal(CLIENT_LOAD_REFUSAL);
          return;
        }
        const options = res.locations.map((row) => ({ id: row.slug, slug: row.slug, label: row.name }));
        setLocationOptions(options);
        setLocationSlug((prev) => (options.some((row) => row.slug === prev) ? prev : options.find((row) => row.slug === "default")?.slug ?? options[0]?.slug ?? "default"));
      })
      .catch(() => {
        if (!cancelled) setLoadRefusal(CLIENT_LOAD_REFUSAL);
      });
    void getPosLocationFacts()
      .then((res) => {
        if (!cancelled && res.ok) setFacts(res.facts);
      })
      .catch(() => {
        /* the facts card says what it could not read */
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    void getLocationModes({ slug: locationSlug })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setCurrent(res.modes);
        else setLoadRefusal(res.reason);
      })
      .catch(() => {
        if (!cancelled) setLoadRefusal(CLIENT_LOAD_REFUSAL);
      });
    return () => {
      cancelled = true;
    };
  }, [locationSlug, reloadToken]);

  const commit = useCallback(
    async (next: PosMode[]) => {
      setSave({ kind: "saving" });
      setPending(next);
      try {
        const res = await setLocationModes({ slug: locationSlug, modes: next });
        if (res.ok) {
          setCurrent(res.modes);
          setPending(null);
          setSave({ kind: "saved", at: new Date() });
          queueRouterRefresh();
          return;
        }
        setSave({ kind: "failed", message: t(`${K}.errors.${res.reason}`) });
      } catch {
        setSave({ kind: "failed", message: t(`${K}.errors.${CLIENT_LOAD_REFUSAL}`) });
      }
    },
    [locationSlug, queueRouterRefresh, t],
  );

  function toggle(mode: PosMode) {
    if (!canEdit || save.kind === "saving" || current === null) return;
    const meta = POS_MODE_META[mode];
    const base = pending ?? current;
    const isOn = base.includes(mode);
    if (!meta.built && !isOn) return;
    const next = isOn ? base.filter((m) => m !== mode) : [...base, mode];
    // The switch moves at once; the chip says whether the server agreed.
    setCurrent(next);
    void commit(next);
  }

  const timeZone = facts?.timezone ?? "UTC";
  const selectedLocation = locationOptions.find((row) => row.slug === locationSlug);
  const location = selectedLocation?.label || facts?.venueName?.trim() || workspaceName;
  const notWiredReason = (key: string) => t(`${K}.notWired.${key}`);
  const locationOptionsForControl =
    locationOptions.length > 0
      ? locationOptions.map((row) => ({ id: row.slug, label: row.label }))
      : [{ id: "default", label: location }];

  const header = (
    <SettingsHeader
      testId="pos-settings-header"
      title={interpolate(t(`${K}.headerTitle`), { location })}
      subtitle={t(`${K}.headerSubtitle`)}
      actions={
        <>
          <SaveStateChip
            testId="pos-save-state"
            state={save}
            timeZone={timeZone}
            labels={{ saving: t(`${K}.saving`), saved: t(`${K}.saved`), failed: t(`${K}.saveFailed`), retry: t(`${K}.retry`) }}
            onRetry={pending ? () => void commit(pending) : undefined}
          />
          <Segmented
            label={t(`${K}.locationsLabel`)}
            value={locationSlug}
            onChange={(id) => {
              setLocationSlug(id);
              setCurrent(null);
            }}
            options={locationOptionsForControl}
          />
        </>
      }
    />
  );

  if (!platformEnabled) {
    return (
      <div data-testid="pos-modes-card" className="flex flex-col gap-[14px]">
        {header}
        <SettingsCard title={t(`${K}.title`)}>
          <div data-testid="pos-modes-platform-off" className="text-admin-12h leading-relaxed text-admin-ink-muted">
            {t(`${K}.platformOffHint`)}
          </div>
        </SettingsCard>
      </div>
    );
  }

  const shown = current;
  const drawerDetail = (() => {
    if (!facts) return t(`${K}.devices.drawerLoading`);
    if (facts.drawer === "unreadable") return t(`${K}.devices.drawerUnreadable`);
    if (facts.drawer === null) return t(`${K}.devices.drawerClosed`);
    return interpolate(t(`${K}.devices.drawerOpen`), {
      float: formatOrderMoney(facts.drawer.floatCents, "USD"),
      time: clock(facts.drawer.openedAt, timeZone),
    });
  })();
  const readerDetail = facts
    ? t(`dashboard.adminWorkspace.paymentsProviders.reasons.${facts.reader.reason}`)
    : t(`${K}.devices.drawerLoading`);

  return (
    <div data-testid="pos-modes-card" className="flex flex-col gap-[14px]">
      {header}

      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-[1.1fr_1fr]">
        <SettingsCard title={t(`${K}.title`)} testId="pos-modes-list">
          {loadRefusal ? (
            <CouldNotLoad
              testId="pos-modes-load-failed"
              message={t(`${K}.errors.${loadRefusal}`)}
              retryLabel={t(`${K}.retry`)}
              onRetry={() => setReloadToken((n) => n + 1)}
            />
          ) : shown === null ? (
            <LoadingLines label={t(`${K}.loadingLabel`)} />
          ) : (
            <div role="group" aria-label={t(`${K}.title`)} className="flex flex-col">
              {POS_MODES.map((mode) => {
                const meta = POS_MODE_META[mode];
                const on = shown.includes(mode);
                const label = t(`${K}.modes.${mode}.label`);
                const disabled = !canEdit || save.kind === "saving" || (!meta.built && !on);
                return (
                  <SwitchRow
                    key={mode}
                    testId={`pos-mode-row-${mode}`}
                    right={
                      meta.built ? (
                        on ? (
                          <StatePill tone="green" state="ready">{t(`${K}.pillReady`)}</StatePill>
                        ) : (
                          <StatePill tone="slate" state="off">{t(`${K}.offLabel`)}</StatePill>
                        )
                      ) : (
                        <StatePill tone="slate" state="not-built">{t(`${K}.notBuiltBadge`)}</StatePill>
                      )
                    }
                  >
                    <Switch
                      on={on}
                      disabled={disabled}
                      label={label}
                      onToggle={() => toggle(mode)}
                      reason={!meta.built && !on ? t(`${K}.notBuiltHint`) : !canEdit ? t(`${K}.ownerOnly`) : undefined}
                    />
                    <div className="min-w-0 text-admin-13 font-medium leading-[20px] text-admin-ink" title={meta.built ? t(`${K}.modes.${mode}.desc`) : t(`${K}.notBuiltHint`)}>
                      {label}
                    </div>
                  </SwitchRow>
                );
              })}
              <SwitchRow
                testId="pos-mode-row-field"
                right={<StatePill tone="slate" state="no-zones">{t(`${K}.fieldServicesPill`)}</StatePill>}
              >
                <Switch on={false} label={t(`${K}.fieldServicesLabel`)} reason={notWiredReason("fieldServices")} />
                <div className="min-w-0 text-admin-13 font-medium leading-[20px] text-admin-ink" title={notWiredReason("fieldServices")}>
                  {t(`${K}.fieldServicesLabel`)}
                </div>
              </SwitchRow>
            </div>
          )}
          {shown !== null && shown.length === 0 ? (
            <div data-testid="pos-modes-all-off" className="text-admin-12h leading-relaxed text-admin-ink-muted">
              {t(`${K}.allOffHint`)}
            </div>
          ) : null}
          <Note>{t(`${K}.modesNote`)}</Note>
          {!canEdit ? <Note>{t(`${K}.ownerOnly`)}</Note> : null}
        </SettingsCard>

        <SettingsCard title={t(`${K}.devicesHeading`)} testId="pos-devices-card">
          <div className="flex flex-col">
            <DeviceRow name={t(`${K}.devices.everyDevice`)} detail={t(`${K}.devices.everyDeviceDetail`)} tone="dim" />
            <DeviceRow
              name={t(`${K}.devices.drawerName`)}
              detail={drawerDetail}
              tone={facts && facts.drawer !== "unreadable" && facts.drawer !== null ? "green" : "dim"}
            />
            <DeviceRow name={t(`${K}.devices.readerName`)} detail={readerDetail} tone={facts?.reader.configured ? "green" : "coral"} />
          </div>
          <div>
            <ActionButton reason={notWiredReason("pairDevice")} className="h-[30px] px-[12px] text-[12px]" testId="pos-pair-device">
              + {t(`${K}.devices.pair`)}
            </ActionButton>
          </div>
          <Note>{t(`${K}.devicesGap`)}</Note>
        </SettingsCard>
      </div>

      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-3">
        <SettingsCard title={t(`${K}.tips.title`)} testId="pos-tips-card">
          {(["prompt", "base", "rounding", "allocation"] as const).map((f) => (
            <SelectField key={f} label={t(`${K}.tips.${f}`)} value={t(`${K}.tips.${f}Value`)} reason={notWiredReason("tips")} />
          ))}
        </SettingsCard>
        <SettingsCard title={t(`${K}.receipts.title`)} testId="pos-receipts-card">
          <SelectField label={t(`${K}.receipts.identity`)} value={workspaceName} reason={notWiredReason("receiptIdentity")} />
          <SelectField label={t(`${K}.receipts.language`)} value={t(`${K}.receipts.languageValue`)} reason={notWiredReason("receiptLanguage")} />
          <SelectField label={t(`${K}.receipts.default`)} value={t(`${K}.receipts.defaultValue`)} reason={notWiredReason("receiptDefault")} />
          <SelectField label={t(`${K}.receipts.fiscal`)} value={t(`${K}.receipts.fiscalValue`)} reason={notWiredReason("fiscal")} />
        </SettingsCard>
        <SettingsCard title={t(`${K}.offline.title`)} testId="pos-offline-card">
          {(["policy", "allowed", "never", "unsynced"] as const).map((f) => (
            <SelectField key={f} label={t(`${K}.offline.${f}`)} value={t(`${K}.offline.${f}Value`)} reason={notWiredReason("offline")} />
          ))}
        </SettingsCard>
      </div>
    </div>
  );
}
