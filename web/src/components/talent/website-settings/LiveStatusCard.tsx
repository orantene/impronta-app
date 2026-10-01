"use client";

/**
 * G3a: the "Atiendo emergencias hoy" switch. Writes immediately (a daily
 * toggle, not a draft setting) and turns itself off at the end of the
 * talent's local day.
 */

import { useEffect, useState, useTransition } from "react";
import { loadLiveStatusAction, setEmergenciesTodayAction } from "./live-status-action";
import { SettingsCard, Switch } from "./primitives";

type T = (s: string) => string;

export function LiveStatusCard({ t }: { t: T }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void loadLiveStatusAction().then((s) => {
      if (alive) setOn(s ? s.emergenciesOn : null);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (on === null) return null;

  const toggle = (next: boolean) => {
    const prev = on;
    setOn(next);
    setFailed(false);
    start(async () => {
      let tz: string | undefined;
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        tz = undefined;
      }
      const res = await setEmergenciesTodayAction(next, tz);
      if (res.ok) setOn(res.status.emergenciesOn);
      else {
        setOn(prev);
        setFailed(true);
      }
    });
  };

  return (
    <div className="mb-3" aria-busy={pending}>
      <SettingsCard>
        <Switch
          checked={on}
          label={t("Taking emergencies today")}
          detail={t("Shows on your website right away and turns itself off at the end of your day.")}
          onChange={toggle}
        />
        {failed ? (
          <p role="alert" className="pb-1 text-[12.5px] text-red-800">
            {t("Could not update. Try again.")}
          </p>
        ) : null}
      </SettingsCard>
    </div>
  );
}
