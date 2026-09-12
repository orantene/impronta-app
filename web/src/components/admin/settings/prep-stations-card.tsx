"use client";

/**
 * PrepStationsCard — Orders › preparation stations (W15). Stations write
 * through venue-engine. Dispatch rules have no columns, so those controls
 * stay disabled with a sentence. Course firing is the floor's Fire course.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  locationsList,
  prepStationDelete,
  prepStationUpsert,
  prepStationsList,
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
  Switch,
  SwitchRow,
  TextField,
  UsedIn,
  type SaveState,
} from "./settings-ui";

const K = "dashboard.adminWorkspace.prepStations";
const KINDS = ["kitchen", "bar", "pickup", "pass"] as const;
type StationKind = (typeof KINDS)[number];

type StationRow = {
  id: string;
  locationId: string | null;
  code: string;
  name: string;
  kind: StationKind;
  sortOrder: number;
};

function isRefusal(reason: string): reason is VenueEngineRefusal {
  return reason in VENUE_ENGINE_REFUSALS;
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "station"
  );
}

export function PrepStationsCard() {
  const t = useT();
  const [stations, setStations] = useState<StationRow[] | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [loadRefusal, setLoadRefusal] = useState<ClientLoadRefusal | VenueEngineRefusal | null>(null);
  const [writeReason, setWriteReason] = useState<VenueEngineRefusal | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [codeDraft, setCodeDraft] = useState("");
  const [kindDraft, setKindDraft] = useState<StationKind>("kitchen");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoadRefusal(null);
    try {
      const [stationRes, locRes] = await Promise.all([prepStationsList(), locationsList()]);
      if (!stationRes.ok) {
        setLoadRefusal(stationRes.reason);
        return;
      }
      if (!locRes.ok) {
        setLoadRefusal(locRes.reason);
        return;
      }
      setStations(stationRes.stations as StationRow[]);
      setLocationId(locRes.locations.find((row) => row.isDefault)?.id ?? locRes.locations[0]?.id ?? null);
      setSelectedId((prev) => {
        if (prev && stationRes.stations.some((row) => row.id === prev)) return prev;
        return stationRes.stations[0]?.id ?? null;
      });
    } catch {
      setLoadRefusal(CLIENT_LOAD_REFUSAL);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const selected = useMemo(() => stations?.find((row) => row.id === selectedId) ?? null, [stations, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setNameDraft(selected.name);
    setCodeDraft(selected.code);
    setKindDraft(selected.kind);
    setAdding(false);
  }, [selected]);

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
      setAdding(false);
      setSave({ kind: "saved", at: new Date() });
    } catch {
      setSave({ kind: "failed", message: t(`${K}.errors.load_failed`) });
    }
  }

  const dirty = Boolean(selected && (nameDraft.trim() !== selected.name || codeDraft !== selected.code || kindDraft !== selected.kind));

  return (
    <div data-testid="prep-stations-card" className="flex flex-col gap-[14px]">
      <SettingsHeader
        title={t(`${K}.title`)}
        subtitle={t(`${K}.subtitle`)}
        actions={
          <>
            <SaveStateChip
              testId="stations-save-state"
              state={save}
              labels={{ saving: t(`${K}.saving`), saved: t(`${K}.saved`), failed: t(`${K}.saveFailed`), retry: t(`${K}.retry`) }}
              onRetry={save.kind === "failed" && dirty && selected ? () => void runWrite(() => prepStationUpsert({
                id: selected.id,
                locationId,
                code: codeDraft,
                name: nameDraft,
                kind: kindDraft,
                sortOrder: selected.sortOrder,
              })) : undefined}
            />
            <ActionButton
              testId="stations-add"
              disabled={adding || save.kind === "saving"}
              onClick={() => {
                setAdding(true);
                setSelectedId(null);
                setNameDraft("");
                setCodeDraft("");
                setKindDraft("kitchen");
              }}
            >
              + {t(`${K}.add`)}
            </ActionButton>
            <ActionButton
              tone="primary"
              testId="stations-save"
              disabled={(!dirty && !adding) || save.kind === "saving"}
              onClick={() =>
                void runWrite(() =>
                  prepStationUpsert({
                    id: adding ? undefined : selected?.id,
                    locationId,
                    code: codeDraft || slugify(nameDraft),
                    name: nameDraft,
                    kind: kindDraft,
                    sortOrder: selected?.sortOrder ?? (stations?.length ?? 0),
                  }),
                )
              }
            >
              {t(`${K}.save`)}
            </ActionButton>
          </>
        }
      />
      <UsedIn
        count={5}
        label={t(`${K}.usedIn`)}
        parts={[
          { where: t(`${K}.usedInPos`), what: t(`${K}.usedInPosList`) },
          { where: t(`${K}.usedInWeb`), what: t(`${K}.usedInWebList`) },
        ]}
      />
      {writeReason ? <p className="m-0 text-admin-13 text-admin-red">{sentence(writeReason)}</p> : null}

      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2">
        <SettingsCard title={t(`${K}.stationsHeading`)} testId="stations-list">
          {loadRefusal ? (
            <CouldNotLoad message={sentence(loadRefusal)} retryLabel={t(`${K}.retry`)} onRetry={() => setReloadToken((n) => n + 1)} />
          ) : !stations ? (
            <LoadingLines label={t(`${K}.loading`)} />
          ) : stations.length === 0 && !adding ? (
            <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.empty`)}</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_110px_90px] gap-[8px] text-[11.5px] font-semibold text-admin-ink-muted">
                <span>{t(`${K}.colStation`)}</span>
                <span>{t(`${K}.colKind`)}</span>
                <span>{t(`${K}.colCode`)}</span>
              </div>
              {stations.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  data-testid={`stations-row-${row.code}`}
                  onClick={() => setSelectedId(row.id)}
                  className={`grid w-full grid-cols-[1fr_110px_90px] gap-[8px] border-t border-admin-border-soft py-[8px] text-left text-admin-13 ${
                    row.id === selectedId ? "bg-admin-surface-alt" : ""
                  }`}
                >
                  <span className="font-semibold text-admin-ink">{row.name}</span>
                  <span className="text-admin-ink-muted">{t(`${K}.kind.${row.kind}`)}</span>
                  <span className="text-admin-ink-muted">{row.code}</span>
                </button>
              ))}
            </>
          )}
          {selected || adding ? (
            <div className="flex flex-col gap-[10px] border-t border-admin-border-soft pt-[10px]">
              <TextField label={t(`${K}.nameLabel`)} value={nameDraft} onChange={setNameDraft} testId="stations-name" />
              <TextField label={t(`${K}.codeLabel`)} value={codeDraft} onChange={setCodeDraft} testId="stations-code" />
              <SelectField
                label={t(`${K}.kindLabel`)}
                value={kindDraft}
                options={KINDS.map((kind) => ({ id: kind, label: t(`${K}.kind.${kind}`) }))}
                onChange={(id) => setKindDraft(id as StationKind)}
                testId="stations-kind"
              />
              {selected ? (
                <ActionButton
                  testId="stations-delete"
                  disabled={save.kind === "saving"}
                  onClick={() => void runWrite(() => prepStationDelete({ id: selected.id }))}
                >
                  {t(`${K}.remove`)}
                </ActionButton>
              ) : null}
            </div>
          ) : null}
        </SettingsCard>

        <SettingsCard title={t(`${K}.dispatchHeading`)}>
          <SwitchRow>
            <Switch on disabled label={t(`${K}.sendChanged`)} reason={t(`${K}.notWired.dispatch`)} />
            <span className="text-admin-13 text-admin-ink">{t(`${K}.sendChanged`)}</span>
          </SwitchRow>
          <SwitchRow>
            <Switch on disabled label={t(`${K}.ackRequired`)} reason={t(`${K}.notWired.dispatch`)} />
            <span className="text-admin-13 text-admin-ink">{t(`${K}.ackRequired`)}</span>
          </SwitchRow>
          <Note>{t(`${K}.courseFireNote`)}</Note>
        </SettingsCard>
      </div>
    </div>
  );
}
