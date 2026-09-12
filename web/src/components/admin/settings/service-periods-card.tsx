"use client";

/**
 * ServicePeriodsCard — Spaces › service periods (W14). Periods write through
 * venue-engine. Pacing and money-by-type have no columns, so those controls
 * stay disabled with a sentence.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  locationsList,
  servicePeriodUpsert,
  servicePeriodsList,
} from "@/lib/server-actions/venue-engine";
import { VENUE_ENGINE_REFUSALS, type VenueEngineRefusal } from "@/lib/venues/engine-refusals";
import { CLIENT_LOAD_REFUSAL, type ClientLoadRefusal } from "@/lib/settings/refusals";
import {
  ActionButton,
  CouldNotLoad,
  LoadingLines,
  Note,
  SaveStateChip,
  SettingsCard,
  SettingsHeader,
  TextField,
  UsedIn,
  type SaveState,
} from "./settings-ui";

const K = "dashboard.adminWorkspace.servicePeriods";
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

type PeriodRow = {
  id: string;
  locationId: string;
  name: string;
  weekdayMask: number;
  startsLocal: string;
  endsLocal: string;
  turnMinutes: number;
  version: number;
};

function isRefusal(reason: string): reason is VenueEngineRefusal {
  return reason in VENUE_ENGINE_REFUSALS;
}

function maskLabel(mask: number, labels: readonly string[]): string {
  return DAYS.filter((iso) => mask & (1 << (iso - 1)))
    .map((iso) => labels[iso - 1])
    .join("");
}

export function ServicePeriodsCard() {
  const t = useT();
  const dayLabels = DAYS.map((iso) => t(`${K}.day.${iso}`));
  const [periods, setPeriods] = useState<PeriodRow[] | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [loadRefusal, setLoadRefusal] = useState<ClientLoadRefusal | VenueEngineRefusal | null>(null);
  const [writeReason, setWriteReason] = useState<VenueEngineRefusal | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [maskDraft, setMaskDraft] = useState(31);
  const [startsDraft, setStartsDraft] = useState("12:00");
  const [endsDraft, setEndsDraft] = useState("16:00");
  const [turnDraft, setTurnDraft] = useState("90");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoadRefusal(null);
    try {
      const [periodRes, locRes] = await Promise.all([servicePeriodsList(), locationsList()]);
      if (!periodRes.ok) {
        setLoadRefusal(periodRes.reason);
        return;
      }
      if (!locRes.ok) {
        setLoadRefusal(locRes.reason);
        return;
      }
      setPeriods(periodRes.periods);
      const loc = locRes.locations.find((row) => row.isDefault)?.id ?? locRes.locations[0]?.id ?? null;
      setLocationId(loc);
      setSelectedId((prev) => {
        if (prev && periodRes.periods.some((row) => row.id === prev)) return prev;
        return periodRes.periods[0]?.id ?? null;
      });
    } catch {
      setLoadRefusal(CLIENT_LOAD_REFUSAL);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const selected = useMemo(() => periods?.find((row) => row.id === selectedId) ?? null, [periods, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setNameDraft(selected.name);
    setMaskDraft(selected.weekdayMask);
    setStartsDraft(selected.startsLocal);
    setEndsDraft(selected.endsLocal);
    setTurnDraft(String(selected.turnMinutes));
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

  function payload(id?: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!locationId) return Promise.resolve({ ok: false as const, reason: "invalid" });
    const turn = Number(turnDraft);
    if (!Number.isInteger(turn)) return Promise.resolve({ ok: false as const, reason: "invalid" });
    return servicePeriodUpsert({
      id,
      locationId,
      name: nameDraft,
      weekdayMask: maskDraft,
      startsLocal: startsDraft,
      endsLocal: endsDraft,
      turnMinutes: turn,
      expectedVersion: id && selected ? selected.version : undefined,
    });
  }

  const dirty = Boolean(
    selected &&
      (nameDraft.trim() !== selected.name ||
        maskDraft !== selected.weekdayMask ||
        startsDraft !== selected.startsLocal ||
        endsDraft !== selected.endsLocal ||
        Number(turnDraft) !== selected.turnMinutes),
  );

  return (
    <div data-testid="service-periods-card" className="flex flex-col gap-[14px]">
      <SettingsHeader
        title={t(`${K}.title`)}
        subtitle={t(`${K}.subtitle`)}
        actions={
          <>
            <SaveStateChip
              testId="periods-save-state"
              state={save}
              labels={{ saving: t(`${K}.saving`), saved: t(`${K}.saved`), failed: t(`${K}.saveFailed`), retry: t(`${K}.retry`) }}
              onRetry={save.kind === "failed" && dirty ? () => void runWrite(() => payload(selected?.id)) : undefined}
            />
            <ActionButton
              testId="periods-add"
              disabled={adding || save.kind === "saving" || !locationId}
              onClick={() => {
                setAdding(true);
                setSelectedId(null);
                setNameDraft("");
                setMaskDraft(31);
                setStartsDraft("12:00");
                setEndsDraft("16:00");
                setTurnDraft("90");
              }}
            >
              + {t(`${K}.add`)}
            </ActionButton>
            <ActionButton
              tone="primary"
              testId="periods-save"
              disabled={(!dirty && !adding) || save.kind === "saving" || !locationId}
              onClick={() => void runWrite(() => payload(adding ? undefined : selected?.id))}
            >
              {t(`${K}.save`)}
            </ActionButton>
          </>
        }
      />
      <UsedIn
        count={3}
        label={t(`${K}.usedIn`)}
        parts={[
          { where: t(`${K}.usedInPos`), what: t(`${K}.usedInPosList`) },
          { where: t(`${K}.usedInWeb`), what: t(`${K}.usedInWebList`) },
        ]}
      />
      {writeReason ? <p className="m-0 text-admin-13 text-admin-red">{sentence(writeReason)}</p> : null}

      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2">
        <SettingsCard title={t(`${K}.periodsHeading`)} testId="periods-list">
          {loadRefusal ? (
            <CouldNotLoad message={sentence(loadRefusal)} retryLabel={t(`${K}.retry`)} onRetry={() => setReloadToken((n) => n + 1)} />
          ) : !periods ? (
            <LoadingLines label={t(`${K}.loading`)} />
          ) : periods.length === 0 && !adding ? (
            <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.empty`)}</p>
          ) : (
            periods.map((row) => (
              <button
                key={row.id}
                type="button"
                data-testid={`periods-row-${row.id}`}
                onClick={() => setSelectedId(row.id)}
                className={`flex w-full items-start gap-[12px] border-t border-admin-border-soft py-[8px] text-left text-admin-13 first:border-t-0 ${
                  row.id === selectedId ? "bg-admin-surface-alt" : ""
                }`}
              >
                <span className="w-[110px] shrink-0 font-semibold text-admin-ink">{row.name}</span>
                <span className="min-w-0 flex-1 text-admin-ink-muted">
                  {maskLabel(row.weekdayMask, dayLabels)} · {row.startsLocal}–{row.endsLocal} · {row.turnMinutes}
                  {t(`${K}.minutesSuffix`)}
                </span>
              </button>
            ))
          )}
          {selected || adding ? (
            <div className="flex flex-col gap-[10px] border-t border-admin-border-soft pt-[10px]">
              <TextField label={t(`${K}.nameLabel`)} value={nameDraft} onChange={setNameDraft} testId="periods-name" />
              <div className="flex flex-wrap gap-[6px]">
                {DAYS.map((iso) => {
                  const on = Boolean(maskDraft & (1 << (iso - 1)));
                  return (
                    <button
                      key={iso}
                      type="button"
                      data-testid={`periods-day-${iso}`}
                      aria-pressed={on}
                      onClick={() => setMaskDraft((prev) => (on ? prev & ~(1 << (iso - 1)) : prev | (1 << (iso - 1))))}
                      className={`h-[30px] rounded-[8px] border px-[8px] text-[12px] ${
                        on ? "border-admin-brand bg-admin-brand-soft text-admin-ink" : "border-admin-border text-admin-ink-muted"
                      }`}
                    >
                      {dayLabels[iso - 1]}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-[10px]">
                <TextField label={t(`${K}.startsLabel`)} value={startsDraft} onChange={setStartsDraft} testId="periods-starts" />
                <TextField label={t(`${K}.endsLabel`)} value={endsDraft} onChange={setEndsDraft} testId="periods-ends" />
                <TextField label={t(`${K}.turnLabel`)} value={turnDraft} onChange={setTurnDraft} inputMode="numeric" testId="periods-turn" />
              </div>
            </div>
          ) : null}
        </SettingsCard>

        <div className="flex flex-col gap-[16px]">
          <SettingsCard title={t(`${K}.pacingHeading`)}>
            <TextField label={t(`${K}.partiesPer15`)} value="4" reason={t(`${K}.notWired.pacing`)} />
            <TextField label={t(`${K}.coversPer15`)} value="16" reason={t(`${K}.notWired.pacing`)} />
            <TextField label={t(`${K}.setupCleanup`)} value="5 / 10" reason={t(`${K}.notWired.pacing`)} />
            <TextField label={t(`${K}.lateGrace`)} value="15" reason={t(`${K}.notWired.pacing`)} />
          </SettingsCard>
          <SettingsCard title={t(`${K}.moneyHeading`)}>
            <Note>{t(`${K}.notWired.money`)}</Note>
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
