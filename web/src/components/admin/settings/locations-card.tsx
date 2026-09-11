"use client";

/**
 * LocationsCard — Settings › Locations & service areas (W23) over
 * `venue_locations` + `venue_location_zones` (D-POS-76). Writers live in
 * `@/lib/server-actions/venue-engine`. Travel minutes and professionals
 * per zone have no column, so those controls stay disabled with a sentence.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  locationSetDefault,
  locationUpsert,
  locationsList,
  zoneDelete,
  zoneUpsert,
} from "@/lib/server-actions/venue-engine";
import { VENUE_ENGINE_REFUSALS, type VenueEngineRefusal } from "@/lib/venues/engine-refusals";
import { CLIENT_LOAD_REFUSAL, type ClientLoadRefusal } from "@/lib/settings/refusals";
import {
  ActionButton,
  CouldNotLoad,
  LoadingLines,
  Note,
  SaveStateChip,
  SelectField,
  SettingsCard,
  SettingsHeader,
  TextField,
  UsedIn,
  type SaveState,
} from "./settings-ui";

const K = "dashboard.adminWorkspace.locations";
const ZONE_KINDS = ["floor", "bar", "terrace", "room", "counter"] as const;
type ZoneKind = (typeof ZONE_KINDS)[number];

type LocationRow = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  address: Record<string, unknown>;
  isDefault: boolean;
  version: number;
};
type ZoneRow = {
  id: string;
  locationId: string;
  name: string;
  kind: ZoneKind;
  surchargeBps: number;
  version: number;
};

function isRefusal(reason: string): reason is VenueEngineRefusal {
  return reason in VENUE_ENGINE_REFUSALS;
}

function addressLineOf(address: Record<string, unknown>): string {
  const line = typeof address.line === "string" ? address.line.trim() : "";
  if (line) return line;
  const parts = [address.line1, address.city].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  return parts.join(" · ");
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return slug || "location";
}

export function LocationsCard({ workspaceName, onEditLocation }: { workspaceName: string; onEditLocation: () => void }) {
  const t = useT();
  const [locations, setLocations] = useState<LocationRow[] | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loadRefusal, setLoadRefusal] = useState<ClientLoadRefusal | VenueEngineRefusal | null>(null);
  const [writeReason, setWriteReason] = useState<VenueEngineRefusal | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [timezoneDraft, setTimezoneDraft] = useState("");
  const [addressDraft, setAddressDraft] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [addingZone, setAddingZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneKind, setNewZoneKind] = useState<ZoneKind>("floor");

  const load = useCallback(async () => {
    setLoadRefusal(null);
    try {
      const res = await locationsList();
      if (!res.ok) {
        setLoadRefusal(res.reason);
        return;
      }
      setLocations(res.locations);
      setZones(res.zones as ZoneRow[]);
      setSelectedId((prev) => {
        if (prev && res.locations.some((row) => row.id === prev)) return prev;
        return res.locations.find((row) => row.isDefault)?.id ?? res.locations[0]?.id ?? null;
      });
    } catch {
      setLoadRefusal(CLIENT_LOAD_REFUSAL);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const selected = useMemo(
    () => locations?.find((row) => row.id === selectedId) ?? null,
    [locations, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setNameDraft(selected.name);
    setTimezoneDraft(selected.timezone);
    setAddressDraft(addressLineOf(selected.address));
  }, [selected]);

  const selectedZones = useMemo(
    () => zones.filter((zone) => zone.locationId === selectedId),
    [zones, selectedId],
  );

  function sentence(reason: string) {
    if (isRefusal(reason)) return t(VENUE_ENGINE_REFUSALS[reason]);
    if (reason === CLIENT_LOAD_REFUSAL) return t(`${K}.errors.load_failed`);
    return t(VENUE_ENGINE_REFUSALS.unavailable);
  }

  async function runWrite(work: () => Promise<{ ok: true } | { ok: false; reason: string }>) {
    setSave({ kind: "saving" });
    setWriteReason(null);
    try {
      const res = await work();
      if (!res.ok) {
        const reason = isRefusal(res.reason) ? res.reason : "unavailable";
        setWriteReason(reason);
        setSave({ kind: "failed", message: sentence(reason) });
        return;
      }
      await load();
      setAddingLocation(false);
      setNewLocationName("");
      setAddingZone(false);
      setNewZoneName("");
      setSave({ kind: "saved", at: new Date() });
    } catch {
      setSave({ kind: "failed", message: t(`${K}.errors.load_failed`) });
    }
  }

  const dirty = Boolean(
    selected &&
      (nameDraft.trim() !== selected.name ||
        timezoneDraft.trim() !== selected.timezone ||
        addressDraft.trim() !== addressLineOf(selected.address)),
  );

  return (
    <div data-testid="locations-card" className="flex flex-col gap-[14px]">
      <SettingsHeader
        title={t(`${K}.title`)}
        subtitle={t(`${K}.subtitle`)}
        actions={
          <>
            <SaveStateChip
              testId="locations-save-state"
              state={save}
              timeZone={selected?.timezone}
              labels={{ saving: t(`${K}.saving`), saved: t(`${K}.saved`), failed: t(`${K}.saveFailed`), retry: t(`${K}.retry`) }}
              onRetry={save.kind === "failed" && dirty ? () => void runWrite(async () => {
                if (!selected) return { ok: false as const, reason: "invalid" };
                return locationUpsert({
                  id: selected.id,
                  slug: selected.slug,
                  name: nameDraft,
                  timezone: timezoneDraft,
                  address: { line: addressDraft.trim() },
                  expectedVersion: selected.version,
                });
              }) : undefined}
            />
            <ActionButton
              testId="locations-add-location"
              disabled={addingLocation || save.kind === "saving"}
              onClick={() => {
                setAddingLocation(true);
                setNewLocationName("");
              }}
            >
              + {t(`${K}.addLocation`)}
            </ActionButton>
            <ActionButton
              testId="locations-add-zone"
              disabled={!selected || addingZone || save.kind === "saving"}
              onClick={() => {
                setAddingZone(true);
                setNewZoneName("");
              }}
            >
              + {t(`${K}.addZone`)}
            </ActionButton>
            <ActionButton
              tone="primary"
              testId="locations-save"
              disabled={!dirty || save.kind === "saving" || !selected}
              onClick={() =>
                void runWrite(async () => {
                  if (!selected) return { ok: false as const, reason: "invalid" };
                  return locationUpsert({
                    id: selected.id,
                    slug: selected.slug,
                    name: nameDraft,
                    timezone: timezoneDraft,
                    address: { line: addressDraft.trim() },
                    expectedVersion: selected.version,
                  });
                })
              }
            >
              {t(`${K}.save`)}
            </ActionButton>
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
          {loadRefusal ? (
            <CouldNotLoad message={sentence(loadRefusal)} retryLabel={t(`${K}.retry`)} onRetry={() => setReloadToken((n) => n + 1)} />
          ) : !locations ? (
            <LoadingLines label={t(`${K}.loading`)} />
          ) : (
            <div className="flex flex-col">
              {locations.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  data-testid={`locations-row-${row.slug}`}
                  onClick={() => setSelectedId(row.id)}
                  className={`flex items-start gap-[12px] border-t border-admin-border-soft py-[8px] text-left text-admin-13 ${
                    row.id === selectedId ? "bg-admin-surface-alt" : ""
                  }`}
                >
                  <span className="w-[110px] shrink-0 font-semibold text-admin-ink">{row.name}</span>
                  <span className="min-w-0 flex-1 font-medium text-admin-ink">
                    {[addressLineOf(row.address) || t(`${K}.noAddress`), row.timezone, row.isDefault ? t(`${K}.defaultChip`) : t(`${K}.notDefault`)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
          {addingLocation ? (
            <div className="flex flex-col gap-[8px] border-t border-admin-border-soft pt-[10px]">
              <TextField
                label={t(`${K}.nameLabel`)}
                value={newLocationName}
                onChange={setNewLocationName}
                testId="locations-new-name"
              />
              <div className="flex gap-[8px]">
                <ActionButton
                  tone="primary"
                  testId="locations-new-confirm"
                  disabled={!newLocationName.trim() || save.kind === "saving"}
                  onClick={() =>
                    void runWrite(() =>
                      locationUpsert({
                        slug: slugify(newLocationName),
                        name: newLocationName,
                        timezone: selected?.timezone || "America/Mexico_City",
                      }),
                    )
                  }
                >
                  {t(`${K}.addLocation`)}
                </ActionButton>
                <ActionButton testId="locations-new-cancel" onClick={() => setAddingLocation(false)}>
                  {t(`${K}.cancel`)}
                </ActionButton>
              </div>
            </div>
          ) : null}
          {selected ? (
            <div className="grid grid-cols-1 gap-[12px] border-t border-admin-border-soft pt-[10px]">
              <TextField label={t(`${K}.nameLabel`)} value={nameDraft} onChange={setNameDraft} testId="locations-edit-name" />
              <TextField label={t(`${K}.timezoneLabel`)} value={timezoneDraft} onChange={setTimezoneDraft} testId="locations-edit-timezone" />
              <TextField label={t(`${K}.addressLabel`)} value={addressDraft} onChange={setAddressDraft} testId="locations-edit-address" />
              {!selected.isDefault ? (
                <ActionButton
                  testId="locations-set-default"
                  disabled={save.kind === "saving"}
                  onClick={() => void runWrite(() => locationSetDefault({ id: selected.id, expectedVersion: selected.version }))}
                >
                  {t(`${K}.setDefault`)}
                </ActionButton>
              ) : null}
            </div>
          ) : null}
          <div>
            <ActionButton onClick={onEditLocation} className="h-[30px] px-[12px] text-[12px]" testId="locations-edit">
              {t(`${K}.editLocation`)}
            </ActionButton>
          </div>
          {writeReason ? <Note>{sentence(writeReason)}</Note> : null}
          <Note>{interpolate(t(`${K}.oneLocationNote`), { workspace: workspaceName })}</Note>
        </SettingsCard>

        <SettingsCard title={t(`${K}.zonesHeading`)} testId="locations-zones">
          {selectedZones.length === 0 && !addingZone ? (
            <div className="rounded-[9px] bg-admin-surface-alt px-[12px] py-[10px] text-admin-12h text-admin-ink-muted">
              {t(`${K}.noZones`)}
            </div>
          ) : (
            <div className="flex flex-col">
              {selectedZones.map((zone) => (
                <div key={zone.id} className="flex items-center gap-[10px] border-t border-admin-border-soft py-[8px] text-admin-13">
                  <span className="min-w-0 flex-1 font-semibold text-admin-ink">{zone.name}</span>
                  <span className="shrink-0 text-admin-ink-muted">{t(`${K}.kind.${zone.kind}`)}</span>
                  <span className="shrink-0 text-admin-ink-muted">
                    {interpolate(t(`${K}.zoneSurcharge`), { pct: String(Math.round(zone.surchargeBps / 100)) })}
                  </span>
                  <ActionButton
                    className="h-[30px] px-[12px] text-[12px]"
                    testId={`locations-zone-delete-${zone.id}`}
                    disabled={save.kind === "saving"}
                    onClick={() => void runWrite(() => zoneDelete({ id: zone.id, expectedVersion: zone.version }))}
                  >
                    {t(`${K}.removeZone`)}
                  </ActionButton>
                </div>
              ))}
            </div>
          )}
          {addingZone && selected ? (
            <div className="flex flex-col gap-[8px] border-t border-admin-border-soft pt-[10px]">
              <TextField label={t(`${K}.zoneNameLabel`)} value={newZoneName} onChange={setNewZoneName} testId="locations-new-zone-name" />
              <SelectField
                label={t(`${K}.zoneKindLabel`)}
                value={newZoneKind}
                options={ZONE_KINDS.map((kind) => ({ id: kind, label: t(`${K}.kind.${kind}`) }))}
                onChange={(id) => setNewZoneKind(id as ZoneKind)}
              />
              <div className="flex gap-[8px]">
                <ActionButton
                  tone="primary"
                  testId="locations-new-zone-confirm"
                  disabled={!newZoneName.trim() || save.kind === "saving"}
                  onClick={() =>
                    void runWrite(() =>
                      zoneUpsert({
                        locationId: selected.id,
                        name: newZoneName,
                        kind: newZoneKind,
                      }),
                    )
                  }
                >
                  {t(`${K}.addZone`)}
                </ActionButton>
                <ActionButton testId="locations-new-zone-cancel" onClick={() => setAddingZone(false)}>
                  {t(`${K}.cancel`)}
                </ActionButton>
              </div>
            </div>
          ) : null}
          <div className="rounded-[9px] bg-admin-surface-alt px-[12px] py-[10px] text-admin-12h text-admin-ink-muted" data-not-wired="true" title={t(`${K}.notWired.travel`)}>
            {t(`${K}.notWired.travel`)}
          </div>
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
            <TextField label={t(`${K}.surcharge`)} value="" reason={t(`${K}.notWired.surcharge`)} hint={t(`${K}.surchargeHint`)} ariaLabel={t(`${K}.surcharge`)} />
            <SelectField label={t(`${K}.professionals`)} value={t(`${K}.professionalsValue`)} reason={t(`${K}.notWired.professionals`)} />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
