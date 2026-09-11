"use client";

/**
 * LocationsCard — Settings › Locations & service areas as the W23 board draws
 * it, over the one location every workspace has: the default venue (its
 * address and clock, `lib/spaces/venues.ts`), the one drawer (`pos_shifts`)
 * and the modes switched on for it (`agencies.settings.pos.locations.default`).
 *
 * THERE IS NO LOCATIONS TABLE (D-POS-58; `lib/pos/modes.ts` header), so "Add
 * location" is disabled with that sentence, and the service-zone matrix,
 * the surcharge and the professionals-per-zone control have no reader or
 * writer: each is drawn disabled with its reason, never as a control that
 * silently does nothing. The location's own fields are edited on the Venue
 * group, which this card opens rather than duplicating.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { getPosLocationFacts, type PosLocationFacts } from "@/lib/server-actions/pos-location-facts";
import { CLIENT_LOAD_REFUSAL, type ClientLoadRefusal, type PaymentProviderRefusal } from "@/lib/settings/refusals";
import {
  ActionButton,
  CouldNotLoad,
  LoadingLines,
  Note,
  SelectField,
  SettingsCard,
  SettingsHeader,
  TextField,
  UsedIn,
} from "./settings-ui";

const K = "dashboard.adminWorkspace.locations";
const MODES = "dashboard.adminWorkspace.posModes.modes";

type CardRefusal = PaymentProviderRefusal | ClientLoadRefusal;

export function LocationsCard({ workspaceName, onEditLocation }: { workspaceName: string; onEditLocation: () => void }) {
  const t = useT();
  const [facts, setFacts] = useState<PosLocationFacts | null>(null);
  const [refusal, setRefusal] = useState<CardRefusal | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRefusal(null);
    void getPosLocationFacts()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setFacts(res.facts);
        else setRefusal(res.reason);
      })
      .catch(() => {
        if (!cancelled) setRefusal(CLIENT_LOAD_REFUSAL);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reason = (key: string) => t(`${K}.notWired.${key}`);

  const detail = (() => {
    if (!facts) return "";
    const modes = facts.modes === null ? t(`${K}.modesUnreadable`) : facts.modes.length === 0 ? t(`${K}.noModes`) : facts.modes.map((m) => t(`${MODES}.${m}.label`)).join(", ");
    const drawer = facts.drawer === "unreadable" ? t(`${K}.drawerUnreadable`) : t(`${K}.oneDrawer`);
    return [facts.addressLine || t(`${K}.noAddress`), facts.timezone, drawer, modes].join(" · ");
  })();

  return (
    <div data-testid="locations-card" className="flex flex-col gap-[14px]">
      <SettingsHeader
        title={t(`${K}.title`)}
        subtitle={t(`${K}.subtitle`)}
        actions={
          <>
            <ActionButton reason={reason("addLocation")} testId="locations-add-location">+ {t(`${K}.addLocation`)}</ActionButton>
            <ActionButton reason={reason("addZone")} testId="locations-add-zone">+ {t(`${K}.addZone`)}</ActionButton>
            <ActionButton tone="primary" reason={reason("save")} testId="locations-save">{t(`${K}.save`)}</ActionButton>
          </>
        }
      />
      <div className="flex flex-col gap-[4px]">
        <UsedIn
          count={3}
          label={t(`${K}.usedIn`)}
          parts={[
            { where: t(`${K}.usedInPos`), what: t(`${K}.usedInPosList`) },
            { where: t(`${K}.usedInWeb`), what: t(`${K}.usedInWebList`) },
          ]}
        />
        <span className="text-[11.5px] text-admin-ink-dim">{t(`${K}.usedInNote`)}</span>
      </div>

      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2">
        <SettingsCard title={t(`${K}.locationsHeading`)} testId="locations-list">
          {refusal ? (
            <CouldNotLoad message={t(`${K}.errors.${refusal}`)} retryLabel={t(`${K}.retry`)} onRetry={() => setReloadToken((n) => n + 1)} />
          ) : !facts ? (
            <LoadingLines label={t(`${K}.loading`)} />
          ) : (
            <div className="flex items-start gap-[12px] border-t border-admin-border-soft py-[8px] text-admin-13">
              <span className="w-[110px] shrink-0 text-admin-ink-muted">{facts.venueName.trim() || workspaceName}</span>
              <span className="min-w-0 flex-1 font-medium text-admin-ink">{detail}</span>
            </div>
          )}
          <div>
            <ActionButton onClick={onEditLocation} className="h-[30px] px-[12px] text-[12px]" testId="locations-edit">
              {t(`${K}.editLocation`)}
            </ActionButton>
          </div>
          <Note>{interpolate(t(`${K}.oneLocationNote`), { workspace: workspaceName })}</Note>
        </SettingsCard>

        <SettingsCard title={t(`${K}.zonesHeading`)} testId="locations-zones">
          <div className="rounded-[9px] bg-admin-surface-alt px-[12px] py-[10px] text-admin-12h text-admin-ink-muted" data-not-wired="true" title={reason("zones")}>
            {reason("zones")}
          </div>
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
            <TextField label={t(`${K}.surcharge`)} value="" reason={reason("surcharge")} hint={t(`${K}.surchargeHint`)} ariaLabel={t(`${K}.surcharge`)} />
            <SelectField label={t(`${K}.professionals`)} value={t(`${K}.professionalsValue`)} reason={reason("professionals")} />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
