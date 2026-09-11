"use client";

/**
 * Device registry + cash-only outbox islands for POSDevices / POSConnection /
 * W20. They fetch themselves so the counter client stays effect-free.
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  posDeviceHeartbeat,
  posDeviceRegister,
  posDevicesList,
  posOutboxApply,
} from "@/lib/server-actions/venue-engine";
import { readCashOutbox, readPairedDevice, writeCashOutbox, writePairedDevice } from "@/lib/pos/cash-outbox";
import { VENUE_ENGINE_REFUSALS, type VenueEngineRefusal } from "@/lib/venues/engine-refusals";
import { POS_OUTLINE_ACTION, POS_SECONDARY_ACTION } from "./pos-classes";
import { cn } from "@/lib/utils";

function isRefusal(reason: string): reason is VenueEngineRefusal {
  return reason in VENUE_ENGINE_REFUSALS;
}

function say(t: (key: string) => string, reason: string): string {
  return t(VENUE_ENGINE_REFUSALS[isRefusal(reason) ? reason : "unavailable"]);
}

export function DeviceRegistryPanel() {
  const t = useT();
  const [devices, setDevices] = useState<Array<{ id: string; name: string; kind: string; lastSeenAt: string | null }>>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    void posDevicesList().then((res) => {
      if (res.ok) setDevices(res.devices);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="col-span-2 flex flex-col gap-3 rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 py-4" data-testid="pos-device-registry">
      <p className="m-0 text-[16px] font-semibold text-admin-ink">{t("dashboard.pos.counter.devices.registryTitle")}</p>
      <p className="m-0 text-[14px] text-admin-ink-muted">{t("dashboard.pos.counter.devices.cashOnlyOffline")}</p>
      {devices.length === 0 ? (
        <p className="m-0 text-[14px] text-admin-ink-muted">{t("dashboard.pos.counter.devices.registryEmpty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {devices.map((device) => (
            <li key={device.id} className="flex items-center justify-between gap-3 text-[14px]">
              <span className="font-semibold text-admin-ink">{device.name}</span>
              <span className="text-admin-ink-muted">{device.kind}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("dashboard.pos.counter.devices.pairName")}
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-admin-border bg-admin-card px-3 text-[15px] text-admin-ink"
        />
        <button
          type="button"
          disabled={busy}
          data-testid="pos-pair-this-till"
          className={cn(POS_OUTLINE_ACTION, "h-11")}
          onClick={() => {
            setBusy(true);
            setNotice(null);
            void (async () => {
              const deviceKey = crypto.randomUUID();
              const res = await posDeviceRegister({
                deviceKey,
                name: name.trim() || t("dashboard.pos.counter.devices.thisTill"),
                kind: "tablet",
              });
              setBusy(false);
              if (!res.ok) {
                setNotice(say(t, res.reason));
                return;
              }
              writePairedDevice({ deviceKey, deviceId: res.id });
              setName("");
              reload();
            })();
          }}
        >
          {t("dashboard.pos.counter.devices.pairThisTill")}
        </button>
      </div>
      {notice ? (
        <p role="alert" className="m-0 text-[13px] text-admin-red">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

export function OutboxSyncPanel() {
  const t = useT();
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setQueued(readCashOutbox().length);
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="pos-outbox-sync">
      <p className="m-0 text-[14px] leading-relaxed text-admin-ink-muted">
        {queued === 0
          ? t("dashboard.pos.counter.connection.nothingQueued")
          : interpolate(t("dashboard.pos.counter.connection.queuedCount"), { count: queued })}
      </p>
      <p className="m-0 text-[14px] text-admin-ink-muted">{t("dashboard.pos.counter.devices.cashOnlyOffline")}</p>
      <button
        type="button"
        disabled={busy || queued === 0}
        data-testid="pos-outbox-sync"
        className={cn(POS_SECONDARY_ACTION, "mt-1")}
        onClick={() => {
          const paired = readPairedDevice();
          if (!paired) {
            setNotice(t("dashboard.pos.counter.devices.pairFirst"));
            return;
          }
          setBusy(true);
          setNotice(null);
          void (async () => {
            await posDeviceHeartbeat({ deviceKey: paired.deviceKey });
            const items = readCashOutbox();
            const kept: typeof items = [];
            for (const item of items) {
              const res = await posOutboxApply({
                deviceId: paired.deviceId,
                operationKey: item.operationKey,
                command: item.command,
              });
              if (!res.ok) kept.push(item);
            }
            writeCashOutbox(kept);
            setQueued(kept.length);
            setBusy(false);
            if (kept.length > 0) setNotice(t("dashboard.venue.engine.refusal.not_replayable"));
          })();
        }}
      >
        {t("dashboard.pos.counter.connection.syncNow")}
      </button>
      {notice ? (
        <p role="alert" className="m-0 text-[13px] text-admin-red">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
